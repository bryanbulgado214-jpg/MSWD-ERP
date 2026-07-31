import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const password = 'ChangeMe!2026';
  const passwordHash = await bcrypt.hash(password, 12);

  // Find the organization
  const org = await prisma.organization.findFirst();
  if (!org) throw new Error('No organization found');

  // Create j.sumagang user
  const user = await prisma.user.upsert({
    where: { organizationId_username: { organizationId: org.id, username: 'j.sumagang' } },
    update: {},
    create: {
      organizationId: org.id,
      username: 'j.sumagang',
      email: 'j.sumagang@mswd.gov.ph',
      passwordHash,
      isActive: true,
    },
  });
  console.log('User created:', user.id, user.username);

  // Find the EMPLOYEE role
  const employeeRole = await prisma.role.findFirst({
    where: { organizationId: org.id, name: 'Employee' },
  });
  if (!employeeRole) throw new Error('EMPLOYEE role not found');

  // Find the organization-wide root unit
  const rootUnit = await prisma.organizationalUnit.findFirst({
    where: { organizationId: org.id, unitType: 'organization_wide' },
  });
  if (!rootUnit) throw new Error('No root org unit found');

  // Assign EMPLOYEE role
  await prisma.userRole.upsert({
    where: {
      userId_roleId_organizationalUnitId: {
        userId: user.id,
        roleId: employeeRole.id,
        organizationalUnitId: rootUnit.id,
      },
    },
    update: {},
    create: {
      userId: user.id,
      roleId: employeeRole.id,
      organizationalUnitId: rootUnit.id,
    },
  });
  console.log('EMPLOYEE role assigned');

  // Get fiscal year and department for PPMP items
  const fiscalYear = await prisma.fiscalYear.findFirst({
    where: { organizationId: org.id },
    orderBy: { year: 'desc' },
  });
  if (!fiscalYear) throw new Error('No fiscal year found');

  const dept = await prisma.department.findFirst({
    where: { organizationId: org.id, code: 'ADMIN' },
  });
  if (!dept) throw new Error('ADMIN department not found');

  // Jeramel Sumagang's PPMP items (realistic water district items)
  const ppmpItems = [
    { code: 'JBS-001', desc: 'Money Counting Machine', uom: 'unit', qty: 2, cost: 15000, mode: 'Shopping', quarter: 1 },
    { code: 'JBS-002', desc: 'Bond Paper (A4, 80gsm)', uom: 'ream', qty: 50, cost: 250, mode: 'Shopping', quarter: 1 },
    { code: 'JBS-003', desc: 'Ink Cartridge (Epson 003)', uom: 'bottle', qty: 24, cost: 350, mode: 'Shopping', quarter: 1 },
    { code: 'JBS-004', desc: 'Desktop Computer (Core i5, 16GB RAM)', uom: 'unit', qty: 1, cost: 45000, mode: 'Small Value Procurement', quarter: 2 },
    { code: 'JBS-005', desc: 'Office Chair (Ergonomic)', uom: 'unit', qty: 3, cost: 8500, mode: 'Shopping', quarter: 2 },
    { code: 'JBS-006', desc: 'External Hard Drive (2TB)', uom: 'unit', qty: 2, cost: 4500, mode: 'Shopping', quarter: 3 },
    { code: 'JBS-007', desc: 'Whiteboard (4x6 ft)', uom: 'unit', qty: 1, cost: 3500, mode: 'Shopping', quarter: 3 },
    { code: 'JBS-008', desc: 'Filing Cabinet (4-drawer, steel)', uom: 'unit', qty: 2, cost: 12000, mode: 'Shopping', quarter: 4 },
  ];

  for (const item of ppmpItems) {
    const totalCost = item.qty * item.cost;
    await prisma.ppmpItem.upsert({
      where: {
        organizationId_code: {
          organizationId: org.id,
          code: item.code,
        },
      },
      update: {
        assignedUserId: user.id,
      },
      create: {
        organizationId: org.id,
        fiscalYearId: fiscalYear.id,
        departmentId: dept.id,
        assignedUserId: user.id,
        code: item.code,
        itemDescription: item.desc,
        procurementCategory: 'goods',
        unitOfMeasure: item.uom,
        quantity: item.qty,
        estimatedUnitCost: item.cost,
        estimatedTotalCost: totalCost,
        modeOfProcurement: item.mode,
        scheduleQuarter: item.quarter,
        cboNotes: 'APPROVED',
        status: 'approved',
      },
    });
    console.log(`  PPMP ${item.code}: ${item.desc} (${item.qty} x P${item.cost.toLocaleString()} = P${totalCost.toLocaleString()})`);
  }

  const grandTotal = ppmpItems.reduce((sum, i) => sum + i.qty * i.cost, 0);
  console.log(`\nTotal PPMP allocation for j.sumagang: P${grandTotal.toLocaleString()}`);
  console.log(`\nLogin: username "j.sumagang", password "${password}"`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
