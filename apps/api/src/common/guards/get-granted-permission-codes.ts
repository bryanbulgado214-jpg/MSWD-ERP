import type { PrismaClient } from '@prisma/client';

export async function getGrantedPermissionCodes(
  prisma: Pick<PrismaClient, 'userRole' | 'delegationAuthority' | 'userPermission'>,
  userId: string,
): Promise<Set<string>> {
  const today = new Date();

  const [userRoles, delegations, directGrants] = await Promise.all([
    prisma.userRole.findMany({
      where: { userId },
      include: {
        role: {
          include: {
            rolePermissions: {
              include: { permission: true },
            },
          },
        },
      },
    }),
    prisma.delegationAuthority.findMany({
      where: {
        delegateUserId: userId,
        status: 'active',
        effectiveDate: { lte: today },
        expirationDate: { gte: today },
      },
      select: { permissionCode: true },
    }),
    // Direct per-user grants — access is the union of roles + these.
    prisma.userPermission.findMany({
      where: { userId },
      select: { permission: { select: { code: true } } },
    }),
  ]);

  const codes = new Set<string>();
  for (const ur of userRoles) {
    if (!ur.role.isActive) continue;
    for (const rp of ur.role.rolePermissions) {
      codes.add(rp.permission.code);
    }
  }
  for (const d of delegations) {
    codes.add(d.permissionCode);
  }
  for (const g of directGrants) {
    codes.add(g.permission.code);
  }
  return codes;
}
