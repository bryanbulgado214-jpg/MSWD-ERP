import type { PrismaClient } from '@prisma/client';

export async function getGrantedPermissionCodes(
  prisma: Pick<PrismaClient, 'userRole' | 'delegationAuthority'>,
  userId: string,
): Promise<Set<string>> {
  const today = new Date();

  const [userRoles, delegations] = await Promise.all([
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
  return codes;
}
