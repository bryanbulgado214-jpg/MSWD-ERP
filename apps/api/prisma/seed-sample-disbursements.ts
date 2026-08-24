import * as path from 'path';

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const prisma = new PrismaClient();

/**
 * Seeds sample Disbursement Vouchers for SBWD dated January 1 – August 24, 2026:
 * recurring monthly obligations (electricity, telecom, statutory remittances,
 * board per diem) plus scattered procurement, fuel, and reimbursements — with a
 * realistic spread of workflow statuses (older ones released, the most recent
 * still in draft / for-approval). Records only (no GL posting).
 *
 * Idempotent: clears the DV-2026-* range and re-creates it.
 */

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const monthName = (m: number) => MONTHS[m - 1];
const CUTOFF = new Date('2026-08-24T23:59:59Z');

type DvType = 'procurement' | 'travel' | 'reimbursement' | 'payroll' | 'utility' | 'other';
type PaymentMode = 'check' | 'ada' | 'others';

interface Spec {
  date: Date;
  type: DvType;
  payee: string;
  tin?: string;
  particulars: string;
  gross: number;
  taxRate: number; // EWT rate applied to gross
  mode: PaymentMode;
}

const d = (m: number, day: number) => new Date(Date.UTC(2026, m - 1, day, 8, 0, 0));
const round2 = (n: number) => Math.round(n * 100) / 100;
// Small deterministic per-month variation so amounts aren't identical.
const vary = (base: number, m: number, k: number) =>
  round2(base + (((m * 971 + k * 313) % 6000) - 3000));

function buildSpecs(): Spec[] {
  const specs: Spec[] = [];
  for (let m = 1; m <= 8; m++) {
    // Recurring utilities
    specs.push({
      date: d(m, 8),
      type: 'utility',
      payee: 'Prov. of Siquijor Electric Coop (PROSIELCO)',
      particulars: `Electricity charges for ${monthName(m)} 2026`,
      gross: vary(34000, m, 1),
      taxRate: 0,
      mode: 'check',
    });
    specs.push({
      date: d(m, 10),
      type: 'utility',
      payee: 'PLDT Inc.',
      tin: '000-123-456-000',
      particulars: `Telephone and internet service — ${monthName(m)} 2026`,
      gross: vary(6800, m, 2),
      taxRate: 0.02,
      mode: 'check',
    });
    // Statutory remittances (rotate which agency leads, all via ADA)
    const remit: Array<[string, string, number]> = [
      [
        'Bureau of Internal Revenue',
        `Remittance of taxes withheld — ${monthName(m === 1 ? 12 : m - 1)} 2026`,
        15500,
      ],
      [
        'Government Service Insurance System (GSIS)',
        `Remittance of GSIS premiums — ${monthName(m)} 2026`,
        43000,
      ],
      ['PhilHealth', `Remittance of PhilHealth premiums — ${monthName(m)} 2026`, 12000],
      ['Pag-IBIG Fund (HDMF)', `Remittance of Pag-IBIG contributions — ${monthName(m)} 2026`, 9500],
    ];
    const [rPayee, rParticulars, rBase] = remit[(m - 1) % remit.length]!;
    specs.push({
      date: d(m, 11),
      type: 'other',
      payee: rPayee,
      particulars: rParticulars,
      gross: vary(rBase, m, 3),
      taxRate: 0,
      mode: 'ada',
    });
    // Board per diem
    specs.push({
      date: d(m, 15),
      type: 'payroll',
      payee: 'SBWD Board of Directors',
      particulars: `Board of Directors per diem — ${monthName(m)} 2026`,
      gross: vary(26000, m, 4),
      taxRate: 0.1,
      mode: 'check',
    });
    // Rotating procurement
    const proc: Array<[string, string, string, number, number]> = [
      [
        'Petron Siquijor Service Station',
        '000-234-567-000',
        'Fuel, oil and lubricants for service vehicles',
        19000,
        0.01,
      ],
      [
        'AquaPure Chemicals Trading',
        '000-345-678-000',
        'Chlorine and water-treatment chemicals',
        98000,
        0.01,
      ],
      [
        'Siquijor Builders Hardware & Supply',
        '000-456-789-000',
        'PVC pipes, fittings and pipeline repair materials',
        64000,
        0.01,
      ],
      [
        'Island Office Supplies Center',
        '000-567-890-000',
        'Office supplies and printer consumables',
        9800,
        0.01,
      ],
    ];
    const [pPayee, pTin, pParticulars, pBase, pRate] = proc[(m - 1) % proc.length]!;
    specs.push({
      date: d(m, 18),
      type: 'procurement',
      payee: pPayee,
      tin: pTin,
      particulars: pParticulars,
      gross: vary(pBase, m, 5),
      taxRate: pRate,
      mode: 'check',
    });
    // Occasional travel / reimbursement (every 3rd month)
    if (m % 3 === 0) {
      specs.push({
        date: d(m, 20),
        type: 'travel',
        payee: 'Maria S. Santos',
        particulars: 'Travel expenses — LWUA regional coordination meeting, Cebu City',
        gross: vary(8700, m, 6),
        taxRate: 0,
        mode: 'check',
      });
    }
    // A second procurement mid-year to add volume
    if (m % 2 === 0) {
      specs.push({
        date: d(m, 22),
        type: 'procurement',
        payee: 'MetroPump Industrial Sales',
        tin: '000-678-901-000',
        particulars: 'Submersible pump spare parts and motor rewinding',
        gross: vary(47000, m, 7),
        taxRate: 0.01,
        mode: 'check',
      });
    }
  }
  return specs.filter((s) => s.date <= CUTOFF).sort((a, b) => a.date.getTime() - b.date.getTime());
}

/** Workflow status by how recent the DV is (older = further along). */
function statusFor(date: Date, i: number): string {
  const t = date.getTime();
  const aug10 = Date.UTC(2026, 7, 10);
  const aug17 = Date.UTC(2026, 7, 17);
  const aug20 = Date.UTC(2026, 7, 20);
  if (t < Date.UTC(2026, 6, 1)) return 'released'; // before July
  if (t < aug10) return i % 11 === 0 ? 'cancelled' : 'released';
  if (t < aug17) return i % 2 === 0 ? 'released' : 'approved';
  if (t < aug20) return i % 2 === 0 ? 'for_approval' : 'certified';
  return i % 3 === 0 ? 'draft' : 'for_certification';
}

async function main() {
  const org = await prisma.organization.findFirstOrThrow({ where: { code: 'SBWD' } });
  const admin = await prisma.user.findFirstOrThrow({
    where: { organizationId: org.id, username: 'demo.admin' },
    select: { id: true },
  });
  const gf = await prisma.fundSource.findFirst({ where: { organizationId: org.id, code: 'GF' } });
  const rc = await prisma.responsibilityCenter.findFirst({ where: { organizationId: org.id } });

  // Reset the sample range.
  const existing = await prisma.disbursementVoucher.findMany({
    where: { organizationId: org.id, dvNumber: { startsWith: 'DV-2026-' } },
    select: { id: true },
  });
  if (existing.length) {
    const ids = existing.map((e) => e.id);
    await prisma.check.deleteMany({ where: { disbursementVoucherId: { in: ids } } });
    await prisma.disbursementVoucher.deleteMany({ where: { id: { in: ids } } });
  }

  const specs = buildSpecs();
  let seq = 0;
  let checkNo = 1000001;

  for (let i = 0; i < specs.length; i++) {
    const s = specs[i]!;
    seq += 1;
    const dvNumber = `DV-2026-${String(seq).padStart(4, '0')}`;
    const status = statusFor(s.date, i);
    const tax = round2(s.gross * s.taxRate);
    const net = round2(s.gross - tax);

    const certified = ['certified', 'for_approval', 'approved', 'released'].includes(status);
    const approved = ['approved', 'released'].includes(status);
    const released = status === 'released';
    const plus = (days: number) => new Date(s.date.getTime() + days * 86400000);

    await prisma.disbursementVoucher.create({
      data: {
        organizationId: org.id,
        dvNumber,
        dvDate: s.date,
        dvType: s.type as never,
        payeeName: s.payee,
        ...(s.tin ? { payeeTin: s.tin } : {}),
        particulars: s.particulars,
        paymentMode: s.mode as never,
        grossAmount: s.gross,
        taxAmount: tax,
        otherDeductions: 0,
        netAmount: net,
        status: status as never,
        ...(gf ? { fundSourceId: gf.id } : {}),
        ...(rc ? { responsibilityCenterId: rc.id } : {}),
        ...(certified ? { certifiedBy: admin.id, certifiedAt: plus(1) } : {}),
        ...(approved ? { approvedBy: admin.id, approvedAt: plus(2) } : {}),
        ...(released
          ? {
              releasedBy: admin.id,
              releasedAt: plus(3),
              ...(s.mode === 'check'
                ? {
                    checkNumber: `CHK-${checkNo++}`,
                    checkDate: plus(3),
                    bankName: 'Land Bank of the Philippines — Siquijor Branch',
                  }
                : {}),
            }
          : {}),
        createdBy: admin.id,
        updatedBy: admin.id,
        createdAt: s.date,
      },
    });
  }

  // Keep the app's DV counter ahead of the seeded range.
  const updated = await prisma.documentSequence.updateMany({
    where: { organizationId: org.id, documentType: 'DISBURSEMENT_VOUCHER' },
    data: { nextNumber: BigInt(seq + 1) },
  });
  if (updated.count === 0) {
    await prisma.documentSequence.create({
      data: {
        organizationId: org.id,
        documentType: 'DISBURSEMENT_VOUCHER',
        prefix: 'DV-',
        nextNumber: BigInt(seq + 1),
      },
    });
  }

  const byStatus = await prisma.disbursementVoucher.groupBy({
    by: ['status'],
    where: { organizationId: org.id, dvNumber: { startsWith: 'DV-2026-' } },
    _count: { _all: true },
  });
  console.log(
    `Seeded ${seq} disbursement vouchers (Jan 1 – Aug 24, 2026). By status: ` +
      byStatus.map((b) => `${b.status}=${b._count._all}`).join(', '),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
