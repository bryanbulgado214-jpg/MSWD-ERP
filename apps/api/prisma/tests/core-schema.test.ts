// prisma/tests/core-schema.test.ts
//
// Automated tests for the Core Platform schema: foreign-key constraints,
// unique constraints, role-permission relationships, organization
// isolation, and audit-log creation rules.
//
// These tests run against a real PostgreSQL database (not mocks) — they
// exist to prove the *database itself* enforces these rules, not just
// application code. Point DATABASE_URL at a disposable test database
// before running (never the dev or production database, since these
// tests insert and delete real rows).
//
// Run via: npm test --workspace=@mswd-erp/api

import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

// Unique-ish codes per test run so repeated runs never collide with
// leftover data from a previous, possibly-crashed run.
const runId = Date.now().toString(36);
const orgCodeA = `TESTORG_A_${runId}`;
const orgCodeB = `TESTORG_B_${runId}`;

let orgA: { id: string };
let orgB: { id: string };
let rootUnitA: { id: string };
let rootUnitB: { id: string };

beforeAll(async () => {
  orgA = await prisma.organization.create({
    data: { code: orgCodeA, name: 'Test Organization A' },
  });
  orgB = await prisma.organization.create({
    data: { code: orgCodeB, name: 'Test Organization B' },
  });
  rootUnitA = await prisma.organizationalUnit.create({
    data: { organizationId: orgA.id, code: 'ROOT', name: 'Org A Root', unitType: 'organization_wide' },
  });
  rootUnitB = await prisma.organizationalUnit.create({
    data: { organizationId: orgB.id, code: 'ROOT', name: 'Org B Root', unitType: 'organization_wide' },
  });
});

afterAll(async () => {
  // Clean up everything created under these two test organizations.
  // audit_logs has ON DELETE SET NULL FKs to users and organizations,
  // but its immutable trigger blocks the resulting UPDATEs — disable
  // the trigger for cleanup, delete the audit rows, then re-enable.
  for (const orgId of [orgA?.id, orgB?.id].filter(Boolean)) {
    await prisma.$executeRawUnsafe('ALTER TABLE audit_logs DISABLE TRIGGER trg_audit_logs_immutable');
    await prisma.$executeRawUnsafe(`DELETE FROM audit_logs WHERE organization_id = '${orgId}'`);
    await prisma.userRole.deleteMany({ where: { user: { organizationId: orgId } } });
    await prisma.user.deleteMany({ where: { organizationId: orgId } });
    await prisma.role.deleteMany({ where: { organizationId: orgId } });
    await prisma.organizationalUnit.deleteMany({ where: { organizationId: orgId } });
    await prisma.organization.deleteMany({ where: { id: orgId } });
    await prisma.$executeRawUnsafe('ALTER TABLE audit_logs ENABLE TRIGGER trg_audit_logs_immutable');
  }
  await prisma.$disconnect();
});

describe('Foreign-key constraints', () => {
  it('rejects a user referencing a non-existent organization', async () => {
    await expect(
      prisma.user.create({
        data: {
          organizationId: '00000000-0000-0000-0000-000000000000',
          username: 'ghost',
          email: 'ghost@example.invalid',
          passwordHash: 'irrelevant-for-this-test',
        },
      }),
    ).rejects.toThrow();
  });

  it('blocks deleting an organization that still has a department referencing it (RESTRICT)', async () => {
    const unit = await prisma.organizationalUnit.create({
      data: { organizationId: orgA.id, code: `FK_TEST_${runId}`, name: 'FK Test Unit', unitType: 'department' },
    });
    await prisma.department.create({
      data: { organizationId: orgA.id, organizationalUnitId: unit.id, code: `FK_TEST_${runId}`, name: 'FK Test Dept' },
    });

    await expect(prisma.organization.delete({ where: { id: orgA.id } })).rejects.toThrow();

    // Clean up this sub-test's own rows so it doesn't interfere with
    // afterAll's cleanup ordering.
    await prisma.department.deleteMany({ where: { organizationalUnitId: unit.id } });
    await prisma.organizationalUnit.delete({ where: { id: unit.id } });
  });

  it('sets uploaded_by to NULL (not a hard failure) when the uploading user is deleted', async () => {
    const user = await prisma.user.create({
      data: {
        organizationId: orgA.id,
        username: `attach_uploader_${runId}`,
        email: `attach_uploader_${runId}@example.invalid`,
        passwordHash: 'irrelevant',
      },
    });
    const attachment = await prisma.attachment.create({
      data: {
        organizationId: orgA.id,
        attachableTable: 'test_table',
        attachableId: '00000000-0000-0000-0000-000000000001',
        fileName: 'test.pdf',
        filePath: '/tmp/test.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: BigInt(1024),
        uploadedBy: user.id,
      },
    });

    await prisma.user.delete({ where: { id: user.id } });

    const reloaded = await prisma.attachment.findUniqueOrThrow({ where: { id: attachment.id } });
    expect(reloaded.uploadedBy).toBeNull();

    await prisma.attachment.delete({ where: { id: attachment.id } });
  });
});

describe('Unique constraints', () => {
  it('rejects a duplicate organization code', async () => {
    await expect(
      prisma.organization.create({ data: { code: orgCodeA, name: 'Duplicate Attempt' } }),
    ).rejects.toThrow();
  });

  it('allows the same username in two different organizations (unique is per-organization, not global)', async () => {
    const userA = await prisma.user.create({
      data: {
        organizationId: orgA.id,
        username: `shared_username_${runId}`,
        email: `a_${runId}@example.invalid`,
        passwordHash: 'irrelevant',
      },
    });
    const userB = await prisma.user.create({
      data: {
        organizationId: orgB.id,
        username: `shared_username_${runId}`,
        email: `b_${runId}@example.invalid`,
        passwordHash: 'irrelevant',
      },
    });
    expect(userA.id).not.toEqual(userB.id);

    await prisma.user.delete({ where: { id: userA.id } });
    await prisma.user.delete({ where: { id: userB.id } });
  });

  it('rejects the same username twice within the same organization', async () => {
    const username = `dup_username_${runId}`;
    const user = await prisma.user.create({
      data: { organizationId: orgA.id, username, email: `dup_${runId}@example.invalid`, passwordHash: 'irrelevant' },
    });

    await expect(
      prisma.user.create({
        data: { organizationId: orgA.id, username, email: `dup2_${runId}@example.invalid`, passwordHash: 'irrelevant' },
      }),
    ).rejects.toThrow();

    await prisma.user.delete({ where: { id: user.id } });
  });

  it('rejects a duplicate global permission code', async () => {
    const code = `test.permission.${runId}`;
    const permission = await prisma.permission.create({
      data: { code, name: 'Test Permission', module: 'test' },
    });

    await expect(
      prisma.permission.create({ data: { code, name: 'Duplicate', module: 'test' } }),
    ).rejects.toThrow();

    await prisma.permission.delete({ where: { id: permission.id } });
  });
});

describe('Role–permission relationships', () => {
  it('grants a permission to a role and can query it back through the join table', async () => {
    const role = await prisma.role.create({
      data: { organizationId: orgA.id, code: `TEST_ROLE_${runId}`, name: 'Test Role' },
    });
    const permission = await prisma.permission.create({
      data: { code: `test.rp.${runId}`, name: 'RP Test Permission', module: 'test' },
    });

    await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });

    const roleWithPermissions = await prisma.role.findUniqueOrThrow({
      where: { id: role.id },
      include: { rolePermissions: { include: { permission: true } } },
    });

    expect(roleWithPermissions.rolePermissions).toHaveLength(1);
    expect(roleWithPermissions.rolePermissions[0].permission.code).toBe(`test.rp.${runId}`);

    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.role.delete({ where: { id: role.id } });
    await prisma.permission.delete({ where: { id: permission.id } });
  });

  it('rejects granting the same permission to the same role twice', async () => {
    const role = await prisma.role.create({
      data: { organizationId: orgA.id, code: `TEST_ROLE2_${runId}`, name: 'Test Role 2' },
    });
    const permission = await prisma.permission.create({
      data: { code: `test.rp2.${runId}`, name: 'RP Test Permission 2', module: 'test' },
    });
    await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });

    await expect(
      prisma.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } }),
    ).rejects.toThrow();

    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.role.delete({ where: { id: role.id } });
    await prisma.permission.delete({ where: { id: permission.id } });
  });
});

describe('Organization isolation', () => {
  it('does not return organization B users when querying by organization A', async () => {
    const userA = await prisma.user.create({
      data: {
        organizationId: orgA.id,
        username: `isolation_a_${runId}`,
        email: `isolation_a_${runId}@example.invalid`,
        passwordHash: 'irrelevant',
      },
    });
    const userB = await prisma.user.create({
      data: {
        organizationId: orgB.id,
        username: `isolation_b_${runId}`,
        email: `isolation_b_${runId}@example.invalid`,
        passwordHash: 'irrelevant',
      },
    });

    const orgAUsers = await prisma.user.findMany({ where: { organizationId: orgA.id } });
    const orgAUserIds = orgAUsers.map((u) => u.id);

    expect(orgAUserIds).toContain(userA.id);
    expect(orgAUserIds).not.toContain(userB.id);

    await prisma.user.delete({ where: { id: userA.id } });
    await prisma.user.delete({ where: { id: userB.id } });
  });

  it('a role created for organization A cannot be assigned to a user in organization B', async () => {
    // The schema doesn't have a single constraint that directly forbids
    // this cross-organization mismatch (role.organization_id vs.
    // user.organization_id are independent FKs) — this test documents
    // that fact and is intentionally an open item, not a passing
    // guarantee. See the implementation report's "unresolved" notes.
    const roleInOrgA = await prisma.role.create({
      data: { organizationId: orgA.id, code: `CROSS_ORG_ROLE_${runId}`, name: 'Cross-Org Role' },
    });
    const userInOrgB = await prisma.user.create({
      data: {
        organizationId: orgB.id,
        username: `cross_org_user_${runId}`,
        email: `cross_org_${runId}@example.invalid`,
        passwordHash: 'irrelevant',
      },
    });

    // This currently SUCCEEDS at the database level (no cross-org check
    // exists yet) — asserting that explicitly so this test fails loudly
    // if a future migration adds the constraint, prompting an update
    // here rather than a silent behavior change going unnoticed.
    const assignment = await prisma.userRole.create({
      data: { userId: userInOrgB.id, roleId: roleInOrgA.id, organizationalUnitId: rootUnitB.id },
    });
    expect(assignment).toBeTruthy();

    await prisma.userRole.delete({ where: { id: assignment.id } });
    await prisma.user.delete({ where: { id: userInOrgB.id } });
    await prisma.role.delete({ where: { id: roleInOrgA.id } });
  });
});

describe('Audit-log creation rules', () => {
  it('automatically creates an audit_logs row on INSERT, without any application code writing to it', async () => {
    const org = await prisma.organization.create({
      data: { code: `AUDIT_TEST_${runId}`, name: 'Audit Test Org' },
    });

    const log = await prisma.auditLog.findFirst({
      where: { tableName: 'organizations', recordId: org.id, action: 'insert' },
    });

    expect(log).not.toBeNull();
    expect((log?.changedFields as any)?.after?.code).toBe(`AUDIT_TEST_${runId}`);

    await prisma.organization.delete({ where: { id: org.id } });
  });

  it('automatically creates an audit_logs row on UPDATE, capturing before/after', async () => {
    const org = await prisma.organization.create({
      data: { code: `AUDIT_UPD_${runId}`, name: 'Before Name' },
    });
    await prisma.organization.update({ where: { id: org.id }, data: { name: 'After Name' } });

    const log = await prisma.auditLog.findFirst({
      where: { tableName: 'organizations', recordId: org.id, action: 'update' },
      orderBy: { performedAt: 'desc' },
    });

    expect(log).not.toBeNull();
    const changed = log?.changedFields as any;
    expect(changed.before.name).toBe('Before Name');
    expect(changed.after.name).toBe('After Name');

    await prisma.organization.delete({ where: { id: org.id } });
  });

  it('rejects any attempt to UPDATE an audit_logs row directly (append-only enforcement)', async () => {
    const anyLog = await prisma.auditLog.findFirst();
    expect(anyLog).not.toBeNull();

    await expect(
      prisma.auditLog.update({
        where: { id: anyLog!.id },
        data: { action: 'delete' },
      }),
    ).rejects.toThrow();
  });

  it('rejects any attempt to DELETE an audit_logs row directly (append-only enforcement)', async () => {
    const anyLog = await prisma.auditLog.findFirst();
    expect(anyLog).not.toBeNull();

    await expect(prisma.auditLog.delete({ where: { id: anyLog!.id } })).rejects.toThrow();
  });
});
