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
  // UACS code of the account debited by this DV's accounting entry (the expense
  // recognised, or the payable settled for statutory remittances).
  debitCode: string;
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
      debitCode: '5-02-04-020', // Electricity Expenses
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
      debitCode: '5-02-05-020', // Telephone Expenses
    });
    // Statutory remittances (rotate which agency leads, all via ADA). A remittance
    // settles the payable that was withheld earlier, so it debits the "Due to …"
    // liability rather than an expense.
    const remit: Array<[string, string, number, string]> = [
      [
        'Bureau of Internal Revenue',
        `Remittance of taxes withheld — ${monthName(m === 1 ? 12 : m - 1)} 2026`,
        15500,
        '2-02-01-010-01', // Due to BIR - Withholding Tax on Compensation
      ],
      [
        'Government Service Insurance System (GSIS)',
        `Remittance of GSIS premiums — ${monthName(m)} 2026`,
        43000,
        '2-02-01-020-01', // Due to GSIS - Life and Retirement Premium
      ],
      [
        'PhilHealth',
        `Remittance of PhilHealth premiums — ${monthName(m)} 2026`,
        12000,
        '2-02-01-040',
      ],
      [
        'Pag-IBIG Fund (HDMF)',
        `Remittance of Pag-IBIG contributions — ${monthName(m)} 2026`,
        9500,
        '2-02-01-030-01', // Due to Pag-IBIG - Premium
      ],
    ];
    const [rPayee, rParticulars, rBase, rDebit] = remit[(m - 1) % remit.length]!;
    specs.push({
      date: d(m, 11),
      type: 'other',
      payee: rPayee,
      particulars: rParticulars,
      gross: vary(rBase, m, 3),
      taxRate: 0,
      mode: 'ada',
      debitCode: rDebit,
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
      debitCode: '5-02-99-120', // Directors and Committee Members' Fees
    });
    // Rotating procurement
    const proc: Array<[string, string, string, number, number, string]> = [
      [
        'Petron Siquijor Service Station',
        '000-234-567-000',
        'Fuel, oil and lubricants for service vehicles',
        19000,
        0.01,
        '5-02-03-090', // Fuel, Oil and Lubricants Expenses
      ],
      [
        'AquaPure Chemicals Trading',
        '000-345-678-000',
        'Chlorine and water-treatment chemicals',
        98000,
        0.01,
        '5-02-03-130', // Chemical and Filtering Supplies Expense
      ],
      [
        'Siquijor Builders Hardware & Supply',
        '000-456-789-000',
        'PVC pipes, fittings and pipeline repair materials',
        64000,
        0.01,
        '5-02-13-030', // Repairs and Maintenance - Infrastructure Assets
      ],
      [
        'Island Office Supplies Center',
        '000-567-890-000',
        'Office supplies and printer consumables',
        9800,
        0.01,
        '5-02-03-010', // Office Supplies Expenses
      ],
    ];
    const [pPayee, pTin, pParticulars, pBase, pRate, pDebit] = proc[(m - 1) % proc.length]!;
    specs.push({
      date: d(m, 18),
      type: 'procurement',
      payee: pPayee,
      tin: pTin,
      particulars: pParticulars,
      gross: vary(pBase, m, 5),
      taxRate: pRate,
      mode: 'check',
      debitCode: pDebit,
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
        debitCode: '5-02-01-010', // Traveling Expenses - Local (falls back to Other MOOE)
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
        debitCode: '5-02-13-050', // Repairs and Maintenance - Machinery and Equipment
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

  // ── Posting accounts for the accounting entry (Box B) ──
  // Cash and Due-to-BIR come from the org's posting-account mappings (the same
  // accounts the app credits on a real release); each DV's debit account comes
  // from its spec's debitCode, resolved against the chart of accounts.
  const mappingAccount = async (key: string) => {
    const m = await prisma.accountMapping.findFirst({
      where: { organizationId: org.id, mappingKey: key, isActive: true },
      select: { chartOfAccountId: true },
    });
    return m?.chartOfAccountId ?? null;
  };
  const cashAccountId = await mappingAccount('cash.in_bank');
  const birAccountId = await mappingAccount('ap.due_to_bir');
  if (!cashAccountId || !birAccountId) {
    throw new Error(
      'Missing cash.in_bank / ap.due_to_bir posting-account mappings — cannot post DV entries.',
    );
  }
  const specsForCodes = buildSpecs();
  const wantedCodes = [...new Set(specsForCodes.map((s) => s.debitCode))];
  const coa = await prisma.chartOfAccount.findMany({
    where: {
      organizationId: org.id,
      accountCode: { in: wantedCodes },
      isHeader: false,
      isActive: true,
    },
    select: { id: true, accountCode: true },
  });
  const codeToId = new Map(coa.map((c) => [c.accountCode, c.id]));
  // Fallback for any debit code not present in this COA (e.g. Traveling Expenses).
  const fallbackDebitId =
    codeToId.get('5-02-99-990') ?? (await mappingAccount('expense.expendable'));
  if (!fallbackDebitId) throw new Error('No fallback expense account available.');
  const debitAccountId = (code: string) => codeToId.get(code) ?? fallbackDebitId;

  // Open accounting period for a given date (all 2026 periods are open).
  const periodForDate = async (date: Date) =>
    prisma.accountingPeriod.findFirst({
      where: {
        fiscalYear: { organizationId: org.id },
        status: 'open',
        lockedAt: null,
        startDate: { lte: date },
        endDate: { gte: date },
      },
      select: { id: true },
    });

  // JEV numbering — same document_sequences counter the app uses.
  const nextJevNumber = async (year: number): Promise<string> => {
    const rows = await prisma.$queryRaw<Array<{ next_number: bigint }>>`
      UPDATE document_sequences
      SET next_number = next_number + 1, last_generated_at = NOW()
      WHERE organization_id = ${org.id}::uuid AND document_type = 'jev'
      RETURNING next_number`;
    if (rows[0]) return `JEV-${year}-${String(rows[0].next_number).padStart(6, '0')}`;
    const ins = await prisma.$queryRaw<Array<{ next_number: bigint }>>`
      INSERT INTO document_sequences (organization_id, document_type, prefix, next_number)
      VALUES (${org.id}::uuid, 'jev', 'JEV-', 1)
      RETURNING next_number`;
    return `JEV-${year}-${String(ins[0]!.next_number).padStart(6, '0')}`;
  };

  // Reset the sample range (and the accounting entries it had posted).
  const existing = await prisma.disbursementVoucher.findMany({
    where: { organizationId: org.id, dvNumber: { startsWith: 'DV-2026-' } },
    select: { id: true },
  });
  if (existing.length) {
    const ids = existing.map((e) => e.id);
    // Delete the DV-sourced JEVs first (jev_lines cascade with the voucher).
    await prisma.journalEntryVoucher.deleteMany({
      where: {
        organizationId: org.id,
        sourceTable: 'disbursement_vouchers',
        sourceId: { in: ids },
      },
    });
    await prisma.check.deleteMany({ where: { disbursementVoucherId: { in: ids } } });
    await prisma.disbursementVoucher.deleteMany({ where: { id: { in: ids } } });
  }

  const specs = buildSpecs();
  let seq = 0;
  let checkNo = 1000001;
  let postedJevs = 0;
  let draftJevs = 0;

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

    const dv = await prisma.disbursementVoucher.create({
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
      select: { id: true },
    });

    // ── Accounting entry (Box B) ──
    // A released DV posts its entry to the ledger; a still-in-progress DV holds a
    // DRAFT entry (visible on the voucher but not yet in the GL); a cancelled DV
    // has none. Entry: Dr expense/payable (gross), Cr Due to BIR (tax),
    // Cr Cash in Bank (net) — balanced since gross = tax + net.
    if (status !== 'cancelled') {
      const jevStatus: 'posted' | 'draft' = released ? 'posted' : 'draft';
      const period = await periodForDate(s.date);
      if (period) {
        const lines: Array<{
          chartOfAccountId: string;
          debitAmount: number;
          creditAmount: number;
          description: string;
        }> = [
          {
            chartOfAccountId: debitAccountId(s.debitCode),
            debitAmount: s.gross,
            creditAmount: 0,
            description: `${s.particulars} — DV ${dvNumber}`,
          },
        ];
        if (tax > 0) {
          lines.push({
            chartOfAccountId: birAccountId,
            debitAmount: 0,
            creditAmount: tax,
            description: `Tax withheld (EWT) — DV ${dvNumber}`,
          });
        }
        lines.push({
          chartOfAccountId: cashAccountId,
          debitAmount: 0,
          creditAmount: net,
          description: `Cash disbursement — DV ${dvNumber}`,
        });

        const totalDebit = round2(lines.reduce((a, l) => a + l.debitAmount, 0));
        const totalCredit = round2(lines.reduce((a, l) => a + l.creditAmount, 0));
        await prisma.journalEntryVoucher.create({
          data: {
            organizationId: org.id,
            jevNumber: await nextJevNumber(2026),
            jevDate: s.date,
            accountingPeriodId: period.id,
            sourceType: 'disbursement' as never,
            sourceTable: 'disbursement_vouchers',
            sourceId: dv.id,
            particulars: `DV ${dvNumber}: ${s.particulars}`,
            ...(gf ? { fundSourceId: gf.id } : {}),
            ...(rc ? { responsibilityCenterId: rc.id } : {}),
            totalDebit,
            totalCredit,
            status: jevStatus as never,
            ...(jevStatus === 'posted' ? { postedBy: admin.id, postedAt: plus(3) } : {}),
            createdBy: admin.id,
            updatedBy: admin.id,
            createdAt: s.date,
            lines: { create: lines },
          },
        });
        if (jevStatus === 'posted') postedJevs += 1;
        else draftJevs += 1;
      }
    }
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
  console.log(
    `Accounting entries: ${postedJevs} posted to the ledger (released DVs), ` +
      `${draftJevs} draft (in-progress DVs).`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
