import type { PrismaClient } from '@prisma/client';

export async function getGrantedPermissionCodes(
  prisma: Pick<PrismaClient, 'userRole'>,
  userId: string,
): Promise<Set<string>> {
  const userRoles = await prisma.userRole.findMany({
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
  });

  const codes = new Set<string>();
  for (const ur of userRoles) {
    if (!ur.role.isActive) continue;
    for (const rp of ur.role.rolePermissions) {
      codes.add(rp.permission.code);
    }
  }
  return codes;
}
