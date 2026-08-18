import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';

/**
 * Generates and removes DEMO-ONLY sample data for client demonstrations.
 *
 * Every generated Journal Entry Voucher is tagged `sourceTable = 'demo'` so the
 * wipe removes exactly what was generated and never touches real entries. The
 * amounts are generated procedurally (not hard-coded) against the org's real
 * chart of accounts, spread across Jan 1 – Aug 18, 2026.
 */
const DEMO_TAG = 'demo';
const YEAR = 2026;
const LAST_MONTH = 8; // through August
const LAST_DAY = 18; // August entries stop at the 18th

@Injectable()
export class DemoDataService {
  constructor(private readonly prisma: PrismaService) {}

  async status(organizationId: string): Promise<{ present: boolean; jevCount: number }> {
    const jevCount = await this.prisma.journalEntryVoucher.count({
      where: { organizationId, sourceTable: DEMO_TAG },
    });
    return { present: jevCount > 0, jevCount };
  }

  async wipe(organizationId: string): Promise<{ removed: number }> {
    // jev_lines cascade on JEV delete; the audit trigger tolerates the deletes.
    const demo = await this.prisma.journalEntryVoucher.findMany({
      where: { organizationId, sourceTable: DEMO_TAG },
      select: { id: true },
    });
    if (demo.length === 0) return { removed: 0 };
    await this.prisma.journalEntryVoucher.deleteMany({
      where: { organizationId, sourceTable: DEMO_TAG },
    });
    await this.prisma.systemSetting
      .deleteMany({ where: { key: 'demo_data_batch' } })
      .catch(() => undefined);
    return { removed: demo.length };
  }

  async generate(organizationId: string, userId: string): Promise<{ created: number }> {
    const existing = await this.status(organizationId);
    if (existing.present) {
      throw new BadRequestException(
        `Demo data already exists (${existing.jevCount} entries). Wipe it first, then generate again.`,
      );
    }

    const [accounts, periods, fund, rc] = await Promise.all([
      this.prisma.chartOfAccount.findMany({
        where: { organizationId, isActive: true, isHeader: false },
        select: { id: true, accountCode: true, name: true, accountType: true, normalBalance: true },
      }),
      this.prisma.accountingPeriod.findMany({
        where: {
          fiscalYear: { organizationId },
          startDate: { gte: new Date(Date.UTC(YEAR, 0, 1)) },
        },
        select: { id: true, startDate: true, endDate: true },
      }),
      this.prisma.fundSource.findFirst({ where: { organizationId }, select: { id: true } }),
      this.prisma.responsibilityCenter.findFirst({
        where: { organizationId },
        select: { id: true },
      }),
    ]);

    // Resolve a postable account by exact code, code prefix, or name regex.
    type Acct = (typeof accounts)[number];
    const find = (opts: {
      code?: string;
      codePrefix?: string;
      name?: RegExp;
      type?: string;
    }): Acct | null => {
      const list = opts.type ? accounts.filter((a) => a.accountType === opts.type) : accounts;
      if (opts.code) {
        const m = list.find((a) => a.accountCode === opts.code);
        if (m) return m;
      }
      if (opts.codePrefix) {
        const m = list.find((a) => a.accountCode.startsWith(opts.codePrefix!));
        if (m) return m;
      }
      if (opts.name) {
        const m = list.find((a) => opts.name!.test(a.name));
        if (m) return m;
      }
      return null;
    };

    const cashBank = find({ codePrefix: '1-01-02-020', name: /cash in bank/i });
    const cashColl = find({ code: '1-01-01-010', name: /collecting officer/i });
    const ar =
      find({ name: /^accounts receivable$/i, type: 'asset' }) ||
      find({ name: /accounts receivable/i, type: 'asset' });
    const revenue =
      find({ name: /sale.*water|water.*sale|waterworks|water system.*income/i, type: 'revenue' }) ||
      find({ type: 'revenue' });
    const salaries =
      find({ name: /salaries and wages - regular/i }) ||
      find({ name: /salaries/i, type: 'expense' });
    const electricity = find({ name: /electricity/i, type: 'expense' });
    const waterExp = find({ name: /^water expenses$/i, type: 'expense' });
    const telephone = find({ name: /telephone/i, type: 'expense' });
    const officeSupplies = find({ name: /office supplies expense/i, type: 'expense' });
    const chemicals = find({ name: /chemical.*supplies|filtering supplies/i, type: 'expense' });
    const depExp = find({ name: /depreciation/i, type: 'expense' });
    const ppe = find({ name: /water supply system|infrastructure|pump/i, type: 'asset' });
    const accumDep = find({ name: /accumulated depreciation/i, type: 'asset' });
    const payable =
      find({ name: /^accounts payable$/i, type: 'liability' }) || find({ type: 'liability' });
    const equity =
      find({ name: /government equity|accumulated surplus|equity/i, type: 'equity' }) ||
      find({ type: 'equity' });

    if (!cashBank || !revenue || !equity) {
      throw new BadRequestException(
        'Could not resolve the core accounts (cash in bank / revenue / equity) in the chart of accounts.',
      );
    }

    const periodFor = (d: Date) =>
      periods.find((p) => d >= p.startDate && d <= p.endDate)?.id ?? null;

    // Deterministic-ish jitter for natural-looking amounts.
    const jitter = (base: number, spread = 0.2) =>
      Math.round((base * (1 - spread / 2 + Math.random() * spread)) / 10) * 10;

    type Line = { acct: { id: string } | null; debit: number; credit: number; desc?: string };
    const jevs: { date: Date; particulars: string; lines: Line[] }[] = [];

    // ── Opening balances (Jan 1) — makes the Statement of Financial Position real.
    const obCashBank = 2_150_000;
    const obCashColl = 45_000;
    const obAr = 380_000;
    const obPpe = 8_600_000;
    const obAccDep = 1_250_000; // contra-asset (credit)
    const obPayable = 165_000;
    const obAssets = obCashBank + obCashColl + obAr + obPpe;
    const obEquity = obAssets - obAccDep - obPayable; // balancing figure
    jevs.push({
      date: new Date(Date.UTC(YEAR, 0, 1)),
      particulars: 'To record the beginning balances as at January 1, 2026',
      lines: [
        { acct: cashBank, debit: obCashBank, credit: 0 },
        cashColl ? { acct: cashColl, debit: obCashColl, credit: 0 } : null,
        ar ? { acct: ar, debit: obAr, credit: 0 } : null,
        ppe ? { acct: ppe, debit: obPpe, credit: 0 } : null,
        accumDep ? { acct: accumDep, debit: 0, credit: obAccDep } : null,
        payable ? { acct: payable, debit: 0, credit: obPayable } : null,
        { acct: equity, debit: 0, credit: obEquity },
      ].filter(Boolean) as Line[],
    });
    // If PPE / accum-dep / payable weren't found, re-balance opening equity to totals.
    {
      const ob = jevs[0]!;
      const d = ob.lines.reduce((s, l) => s + l.debit, 0);
      const c = ob.lines.reduce((s, l) => s + l.credit, 0);
      if (Math.abs(d - c) > 0.005) {
        const eq = ob.lines.find((l) => l.acct === equity)!;
        eq.credit += d - c;
      }
    }

    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August'];
    for (let m = 0; m < LAST_MONTH; m++) {
      const growth = 1 + m * 0.015;
      const mid = (day: number) =>
        new Date(Date.UTC(YEAR, m, m === LAST_MONTH - 1 ? Math.min(day, LAST_DAY) : day));
      const label = `${MONTHS[m]} ${YEAR}`;

      const billed = jitter(210_000 * growth);
      jevs.push({
        date: mid(3),
        particulars: `To record billing of water sales for ${label}`,
        lines: [
          { acct: ar ?? cashBank, debit: billed, credit: 0 },
          { acct: revenue, debit: 0, credit: billed },
        ],
      });
      const collected = jitter(billed * 0.82, 0.1);
      jevs.push({
        date: mid(8),
        particulars: `To record collections of water bills for ${label}`,
        lines: [
          { acct: cashBank, debit: collected, credit: 0 },
          { acct: ar ?? cashBank, debit: 0, credit: collected },
        ],
      });
      if (salaries)
        jevs.push({
          date: mid(15),
          particulars: `To record payment of salaries and wages for ${label}`,
          lines: [
            { acct: salaries, debit: jitter(98_000, 0.08), credit: 0 },
            { acct: cashBank, debit: 0, credit: 0 },
          ],
        });
      if (electricity)
        jevs.push({
          date: mid(18),
          particulars: `To record payment of electricity for pumping stations, ${label}`,
          lines: [
            { acct: electricity, debit: jitter(31_000), credit: 0 },
            { acct: cashBank, debit: 0, credit: 0 },
          ],
        });
      if (officeSupplies && m % 2 === 0)
        jevs.push({
          date: mid(12),
          particulars: `To record purchase of office supplies, ${label}`,
          lines: [
            { acct: officeSupplies, debit: jitter(8_500, 0.4), credit: 0 },
            { acct: cashBank, debit: 0, credit: 0 },
          ],
        });
      if (chemicals)
        jevs.push({
          date: mid(20),
          particulars: `To record water treatment chemicals, ${label}`,
          lines: [
            { acct: chemicals, debit: jitter(16_000, 0.3), credit: 0 },
            { acct: cashBank, debit: 0, credit: 0 },
          ],
        });
      if (telephone && m % 2 === 1)
        jevs.push({
          date: mid(22),
          particulars: `To record telephone and internet charges, ${label}`,
          lines: [
            { acct: telephone, debit: jitter(4_800, 0.15), credit: 0 },
            { acct: cashBank, debit: 0, credit: 0 },
          ],
        });
      if (depExp && accumDep)
        jevs.push({
          date: mid(28),
          particulars: `To record monthly depreciation of water supply systems, ${label}`,
          lines: [
            { acct: depExp, debit: 42_000, credit: 0 },
            { acct: accumDep, debit: 0, credit: 42_000 },
          ],
        });
    }

    // Balance each expense-payment entry: the cash credit equals the expense debit.
    for (const j of jevs) {
      const dr = j.lines.reduce((s, l) => s + l.debit, 0);
      const cr = j.lines.reduce((s, l) => s + l.credit, 0);
      const cashLine = j.lines.find((l) => l.acct === cashBank && l.credit === 0 && l.debit === 0);
      if (cashLine && dr > cr) cashLine.credit = dr - cr;
    }

    // Insert as posted, tagged demo JEVs — direct writes keep the real
    // document-number sequence untouched.
    const perMonthSeq: Record<number, number> = {};
    let created = 0;
    for (const j of jevs) {
      const totalDebit = j.lines.reduce((s, l) => s + l.debit, 0);
      const totalCredit = j.lines.reduce((s, l) => s + l.credit, 0);
      if (Math.abs(totalDebit - totalCredit) > 0.005) continue; // never post an unbalanced demo entry
      const periodId = periodFor(j.date);
      if (!periodId) continue;
      const mm = j.date.getUTCMonth() + 1;
      perMonthSeq[mm] = (perMonthSeq[mm] ?? 0) + 1;
      const jevNumber = `JEV-${YEAR}-${String(mm).padStart(2, '0')}-${String(perMonthSeq[mm]).padStart(3, '0')}`;
      await this.prisma.journalEntryVoucher.create({
        data: {
          organizationId,
          jevNumber,
          jevDate: j.date,
          accountingPeriodId: periodId,
          sourceType: 'manual',
          sourceTable: DEMO_TAG,
          particulars: j.particulars,
          ...(fund ? { fundSourceId: fund.id } : {}),
          ...(rc ? { responsibilityCenterId: rc.id } : {}),
          totalDebit,
          totalCredit,
          status: 'posted',
          postedBy: userId,
          postedAt: j.date,
          createdBy: userId,
          updatedBy: userId,
          lines: {
            create: j.lines.map((l) => ({
              chartOfAccountId: l.acct!.id,
              debitAmount: l.debit,
              creditAmount: l.credit,
              ...(l.desc ? { description: l.desc } : {}),
            })),
          },
        },
      });
      created++;
    }

    const batchValue = JSON.stringify({ count: created, generatedAt: new Date().toISOString() });
    await this.prisma.systemSetting
      .upsert({
        where: { key: 'demo_data_batch' },
        update: { value: batchValue, updatedBy: userId },
        create: { key: 'demo_data_batch', value: batchValue, updatedBy: userId },
      })
      .catch(() => undefined);

    return { created };
  }
}
