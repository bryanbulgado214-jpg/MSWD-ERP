/**
 * Introduce the new "Post Disbursement Vouchers" permission (accounting.dv.post)
 * and grant it to everyone who can already post journal entries — i.e. the
 * accountant. Run once after deploying the maker-checker change so DV posting
 * keeps working for the accountant while data-entry staff can only save drafts.
 *
 *   npx tsx prisma/grant-dv-post.ts
 *
 * Idempotent: safe to run more than once.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  // 1. Ensure the permission row exists (seed adds it too; this covers live DBs
  //    that were seeded before it existed).
  const dvPost = await prisma.permission.upsert({
    where: { code: 'accounting.dv.post' },
    update: {},
    create: {
      code: 'accounting.dv.post',
      name: 'Post Disbursement Vouchers',
      module: 'accounting',
    },
    select: { id: true },
  });

  // 2. Everyone who can post JEVs should be able to post DVs. Find them via role
  //    grants and direct per-user grants.
  const jevPost = await prisma.permission.findUnique({
    where: { code: 'accounting.jev.post' },
    select: { id: true },
  });
  if (!jevPost) {
    console.log('accounting.jev.post permission not found — nothing to base the grant on.');
    return;
  }
  const [viaRole, viaDirect] = await Promise.all([
    prisma.userRole.findMany({
      where: { role: { rolePermissions: { some: { permissionId: jevPost.id } } } },
      select: { userId: true },
    }),
    prisma.userPermission.findMany({
      where: { permissionId: jevPost.id },
      select: { userId: true },
    }),
  ]);
  const posterIds = [
    ...new Set([...viaRole.map((r) => r.userId), ...viaDirect.map((d) => d.userId)]),
  ];

  let granted = 0;
  for (const userId of posterIds) {
    const res = await prisma.userPermission.upsert({
      where: { userId_permissionId: { userId, permissionId: dvPost.id } },
      update: {},
      create: { userId, permissionId: dvPost.id },
      select: { createdAt: true },
    });
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { username: true },
    });
    console.log(`  ✔ accounting.dv.post → ${user?.username ?? userId}`);
    granted++;
    void res;
  }
  console.log(
    `\nDone. accounting.dv.post is granted to ${granted} user(s) (everyone who can post JEVs).`,
  );
  if (granted === 0) {
    console.log('⚠  No JEV-posters found — grant "Post Disbursement Vouchers" to the accountant');
    console.log('   manually in Admin → Users → Access, or nobody will be able to post DVs.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
