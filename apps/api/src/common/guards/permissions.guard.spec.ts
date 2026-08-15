// permissions.guard.spec.ts — UNIT TESTS.
//
// Genuinely executable: uses hand-built mock objects for Reflector and
// PrismaService rather than a real database connection, so this proves
// the guard's actual authorization LOGIC (does it correctly compute the
// granted-permission set and compare it against what's required) without
// needing a live Postgres instance or a generated Prisma Client at all.
// This is a real unit test of production code, not a rewrite of it.

import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';

import { PermissionsGuard } from './permissions.guard';

function fakeContext(user: { userId: string } | undefined): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function fakeReflectorRequiring(codes: string[] | undefined): Reflector {
  return { getAllAndOverride: () => codes } as unknown as Reflector;
}

/** Shape-compatible fake for the one PrismaService method the guard
 * actually calls (`userRole.findMany`). Cast through `unknown` at the
 * call site — this intentionally never touches the real PrismaClient. */
function fakePrismaGranting(permissionCodes: string[]) {
  return {
    userRole: {
      findMany: jest.fn().mockResolvedValue([
        {
          role: {
            isActive: true,
            rolePermissions: permissionCodes.map((code) => ({ permission: { code } })),
          },
        },
      ]),
    },
    // The guard now also reads active delegated authorities via
    // getGrantedPermissionCodes → prisma.delegationAuthority.findMany.
    // These unit tests exercise role-based grants only, so return an
    // empty delegation set (no delegated permissions).
    delegationAuthority: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
}

describe('PermissionsGuard', () => {
  it('allows the request when the route requires no permissions', async () => {
    const guard = new PermissionsGuard(
      fakeReflectorRequiring(undefined),
      fakePrismaGranting([]) as any,
    );
    await expect(guard.canActivate(fakeContext({ userId: 'u1' }))).resolves.toBe(true);
  });

  it('allows the request when the user holds the exact required permission', async () => {
    const guard = new PermissionsGuard(
      fakeReflectorRequiring(['budgeting.reservation.create']),
      fakePrismaGranting(['budgeting.reservation.create']) as any,
    );
    await expect(guard.canActivate(fakeContext({ userId: 'u1' }))).resolves.toBe(true);
  });

  it('rejects when the user holds none of the required permissions', async () => {
    const guard = new PermissionsGuard(
      fakeReflectorRequiring(['budgeting.reservation.approve']),
      fakePrismaGranting(['budgeting.reservation.create']) as any, // has a DIFFERENT permission
    );
    await expect(guard.canActivate(fakeContext({ userId: 'u1' }))).rejects.toThrow(
      /Missing required permission/,
    );
  });

  it('requires ALL listed permissions, not just one of them', async () => {
    const guard = new PermissionsGuard(
      fakeReflectorRequiring(['budgeting.reservation.create', 'budgeting.reservation.approve']),
      fakePrismaGranting(['budgeting.reservation.create']) as any, // only has ONE of the two
    );
    await expect(guard.canActivate(fakeContext({ userId: 'u1' }))).rejects.toThrow(
      /Missing required permission\(s\): budgeting\.reservation\.approve/,
    );
  });

  it('rejects when there is no authenticated user on the request at all', async () => {
    const guard = new PermissionsGuard(
      fakeReflectorRequiring(['budgeting.reservation.create']),
      fakePrismaGranting(['budgeting.reservation.create']) as any,
    );
    await expect(guard.canActivate(fakeContext(undefined))).rejects.toThrow(/Not authenticated/);
  });

  it('ignores permissions granted by an INACTIVE role', async () => {
    const inactiveRolePrisma = {
      userRole: {
        findMany: jest.fn().mockResolvedValue([
          {
            role: {
              isActive: false, // deactivated role
              rolePermissions: [{ permission: { code: 'budgeting.reservation.create' } }],
            },
          },
        ]),
      },
      delegationAuthority: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const guard = new PermissionsGuard(
      fakeReflectorRequiring(['budgeting.reservation.create']),
      inactiveRolePrisma as any,
    );
    await expect(guard.canActivate(fakeContext({ userId: 'u1' }))).rejects.toThrow(
      /Missing required permission/,
    );
  });
});
