import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '../../../app/auth';
import {
  getUtilizationReport,
  listFiscalYears,
  UTILIZATION_SECTION_LABELS,
  type FiscalYearLookupItem,
  type UtilizationReport,
  type UtilizationReportLine,
} from '../api';
import { formatPeso } from '../format-peso';
import { UtilizationBreakdownModal } from './UtilizationBreakdownModal';

function fmtDate(s: string): string {
  return s ? new Date(s).toLocaleDateString('en-PH', { dateStyle: 'long' }) : '';
}

const WRAP: React.CSSProperties = { maxWidth: 1040, margin: '0 auto', padding: '1.5rem' };
const TH: React.CSSProperties = { padding: '8px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
const TD: React.CSSProperties = { padding: '7px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

export default function BudgetUtilizationReportPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('budgeting.header.manage');

  const [fiscalYears, setFiscalYears] = useState<FiscalYearLookupItem[]>([]);
  const [fiscalYearId, setFiscalYearId] = useState('');
  const [report, setReport] = useState<UtilizationReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [drill, setDrill] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    listFiscalYears()
      .then((years) => {
        setFiscalYears(years);
        if (years.length) setFiscalYearId((cur) => cur || years[0]!.id);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load fiscal years.'));
  }, []);

  useEffect(() => {
    if (!fiscalYearId) return;
    setLoading(true);
    setError('');
    getUtilizationReport(fiscalYearId)
      .then(setReport)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load the report.'))
      .finally(() => setLoading(false));
  }, [fiscalYearId]);

  const hasLines = useMemo(
    () => !!report && report.sections.some((s) => s.lines.length > 0),
    [report],
  );

  function pct(line: { utilizationPct: number; overBudget: boolean }) {
    return (
      <span style={{ color: line.overBudget ? '#b42318' : '#344054', fontWeight: 600 }}>
        {line.utilizationPct.toFixed(1)}%
      </span>
    );
  }

  return (
    <div style={WRAP}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          gap: 16,
          flexWrap: 'wrap',
          marginBottom: 16,
        }}
      >
        <div>
          <h1 style={{ margin: '0 0 4px' }}>Budget Utilization Report</h1>
          <p style={{ margin: 0, color: '#667085', fontSize: 14 }}>
            Actual spend against the year's budget, by category.
            {report && (
              <>
                {' '}
                Period: <strong>{fmtDate(report.period.startDate)}</strong> –{' '}
                <strong>{fmtDate(report.period.endDate)}</strong>.
              </>
            )}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ fontSize: 13, color: '#344054' }}>
            Fiscal Year{' '}
            <select
              value={fiscalYearId}
              onChange={(e) => setFiscalYearId(e.target.value)}
              style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid #d0d5dd' }}
            >
              {fiscalYears.map((fy) => (
                <option key={fy.id} value={fy.id}>
                  {fy.name} ({fy.year})
                </option>
              ))}
            </select>
          </label>
          {canManage && (
            <Link
              to={`/budgeting/utilization/setup${fiscalYearId ? `?fiscalYearId=${fiscalYearId}` : ''}`}
              className="wo-btn wo-btn--nav"
              style={{
                padding: '7px 12px',
                borderRadius: 8,
                border: '1px solid #d0d5dd',
                textDecoration: 'none',
                color: '#344054',
                fontSize: 13,
              }}
            >
              ⚙ Setup &amp; mapping
            </Link>
          )}
          <button
            type="button"
            onClick={() => window.print()}
            style={{
              padding: '7px 12px',
              borderRadius: 8,
              border: '1px solid #d0d5dd',
              background: '#fff',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            🖨 Print
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fef3f2', color: '#b42318', padding: '10px 14px', borderRadius: 8, marginBottom: 12 }}>
          {error}
        </div>
      )}
      {loading && <div style={{ color: '#667085' }}>Loading…</div>}

      {!loading && report && !hasLines && (
        <div
          style={{
            border: '1px dashed #d0d5dd',
            borderRadius: 12,
            padding: 28,
            textAlign: 'center',
            color: '#475467',
          }}
        >
          <p style={{ margin: '0 0 12px' }}>
            No budget categories are set up for <strong>{report.fiscalYear.name}</strong> yet.
          </p>
          {canManage ? (
            <Link
              to={`/budgeting/utilization/setup?fiscalYearId=${fiscalYearId}`}
              style={{ color: '#175cd3', fontWeight: 600 }}
            >
              Go to Setup &amp; mapping →
            </Link>
          ) : (
            <span>Ask the budget officer to set up the categories and GL-account mapping.</span>
          )}
        </div>
      )}

      {!loading && report && hasLines && (
        <div style={{ overflowX: 'auto', border: '1px solid #eaecf0', borderRadius: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 720 }}>
            <thead>
              <tr style={{ background: '#f9fafb', color: '#475467', textAlign: 'left' }}>
                <th style={{ padding: '10px' }}>Particulars</th>
                <th style={TH}>Budget</th>
                <th style={TH}>Utilization</th>
                <th style={TH}>Remaining</th>
                <th style={TH}>% Used</th>
              </tr>
            </thead>
            <tbody>
              {report.sections.map((section) => (
                <SectionBlock
                  key={section.section}
                  label={UTILIZATION_SECTION_LABELS[section.section]}
                  lines={section.lines}
                  subtotal={section}
                  onDrill={(l) => setDrill({ id: l.id, name: l.name })}
                  pct={pct}
                />
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: '#f2f4f7', fontWeight: 800, borderTop: '2px solid #98a2b3' }}>
                <td style={{ padding: '12px 10px' }}>TOTAL BUDGET</td>
                <td style={TD}>{formatPeso(report.total.budget)}</td>
                <td style={TD}>{formatPeso(report.total.utilization)}</td>
                <td style={{ ...TD, color: report.total.remaining < 0 ? '#b42318' : undefined }}>
                  {formatPeso(report.total.remaining)}
                </td>
                <td style={TD}>{report.total.utilizationPct.toFixed(1)}%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {drill && report && (
        <UtilizationBreakdownModal
          lineId={drill.id}
          lineName={drill.name}
          startDate={report.period.startDate}
          endDate={report.period.endDate}
          onClose={() => setDrill(null)}
        />
      )}
    </div>
  );
}

function SectionBlock({
  label,
  lines,
  subtotal,
  onDrill,
  pct,
}: {
  label: string;
  lines: UtilizationReportLine[];
  subtotal: { budget: number; utilization: number; remaining: number; utilizationPct: number; overBudget: boolean };
  onDrill: (line: UtilizationReportLine) => void;
  pct: (l: { utilizationPct: number; overBudget: boolean }) => React.ReactNode;
}) {
  if (lines.length === 0) return null;
  return (
    <>
      <tr style={{ background: '#fcfcfd' }}>
        <td style={{ padding: '10px', fontWeight: 700, textTransform: 'uppercase', fontSize: 13, letterSpacing: 0.3 }} colSpan={5}>
          {label}
        </td>
      </tr>
      {lines.map((l) => (
        <tr key={l.id} style={{ borderTop: '1px solid #f2f4f7' }}>
          <td style={{ padding: '7px 10px 7px 24px' }}>
            {l.name}
            {l.appCrossCheck && l.appUtilization != null && (
              <span style={{ display: 'block', fontSize: 11, color: '#667085' }}>
                APP utilization (PO commitments): {formatPeso(l.appUtilization)}
              </span>
            )}
          </td>
          <td style={TD}>{formatPeso(l.budget)}</td>
          <td style={TD}>
            {l.accountCount > 0 ? (
              <button
                type="button"
                onClick={() => onDrill(l)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  color: '#175cd3',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontVariantNumeric: 'tabular-nums',
                }}
                title="Show the entries behind this figure"
              >
                {formatPeso(l.utilization)}
              </button>
            ) : (
              <span style={{ color: '#98a2b3' }}>{formatPeso(l.utilization)}</span>
            )}
          </td>
          <td style={{ ...TD, color: l.remaining < 0 ? '#b42318' : undefined }}>
            {formatPeso(l.remaining)}
            {l.overBudget && <span title="Over budget"> ⚠</span>}
          </td>
          <td style={TD}>{pct(l)}</td>
        </tr>
      ))}
      <tr style={{ background: '#f9fafb', fontWeight: 700, borderTop: '1px solid #e4e7ec' }}>
        <td style={{ padding: '8px 10px', textAlign: 'right' }}>Subtotal — {label}</td>
        <td style={TD}>{formatPeso(subtotal.budget)}</td>
        <td style={TD}>{formatPeso(subtotal.utilization)}</td>
        <td style={{ ...TD, color: subtotal.remaining < 0 ? '#b42318' : undefined }}>
          {formatPeso(subtotal.remaining)}
        </td>
        <td style={TD}>{subtotal.utilizationPct.toFixed(1)}%</td>
      </tr>
    </>
  );
}
