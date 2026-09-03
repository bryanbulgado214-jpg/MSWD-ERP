import { useEffect, useState, type CSSProperties } from 'react';

import { useAuth } from '../../../app/auth';
import { signatoryFor } from '../../../app/signatories';
import './accounting.css';
import {
  getChangesInEquity,
  getDetailedScf,
  getDetailedSci,
  getDetailedSfp,
  getGlFiscalYears,
  getGlPeriods,
} from '../api';
import type {
  ChangesInEquityResult,
  DetailedStatement,
  DetailedStatementRow,
  FiscalYearOption,
  PeriodOption,
} from '../types';

type ViewMode = 'sfp' | 'sci' | 'scf' | 'sce';
type Detail = 'detailed' | 'condensed';
const ANNUAL = 'annual';

/** Accounting-style money: blank for zero, parentheses for negatives. */
function money(n: number): string {
  if (!n || Math.abs(n) < 0.005) return '—';
  const s = new Intl.NumberFormat('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(n));
  return n < 0 ? `(${s})` : s;
}

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: DetailedStatement }
  | { status: 'sce'; data: ChangesInEquityResult };

function StatementRowView({ row }: { row: DetailedStatementRow }) {
  if (row.kind === 'spacer') {
    return (
      <tr aria-hidden>
        <td colSpan={3} style={{ height: 8, border: 'none' }} />
      </tr>
    );
  }
  const isSection = row.kind === 'section';
  const isTotal = row.kind === 'total';
  const isGrand = row.kind === 'grand_total';
  const isHeader = row.kind === 'header';

  const labelStyle: CSSProperties = {
    paddingLeft: 8 + row.level * 18,
    paddingTop: 3,
    paddingBottom: 3,
    fontWeight: isSection || isTotal || isGrand ? 700 : isHeader ? 600 : 400,
    textTransform: isSection ? 'uppercase' : 'none',
    letterSpacing: isSection ? '0.04em' : undefined,
    color: isSection || isTotal || isGrand ? 'var(--mswd-navy, #0b3a67)' : '#1e293b',
    borderTop: isTotal ? '1px solid #98a2b3' : isGrand ? '2px double #0b3a67' : 'none',
  };
  const numStyle: CSSProperties = {
    textAlign: 'right',
    fontFamily: "'SF Mono','Cascadia Code',monospace",
    fontVariantNumeric: 'tabular-nums',
    fontWeight: isTotal || isGrand ? 700 : isHeader ? 600 : 400,
    color: isSection || isTotal || isGrand ? 'var(--mswd-navy, #0b3a67)' : '#334155',
    whiteSpace: 'nowrap',
    borderTop: isTotal ? '1px solid #98a2b3' : isGrand ? '2px double #0b3a67' : 'none',
    padding: '3px 10px 3px 4px',
  };

  return (
    <tr>
      <td style={labelStyle}>
        {row.code && (
          <span style={{ color: '#98a2b3', fontSize: 11, marginRight: 8, fontFamily: 'monospace' }}>
            {row.code}
          </span>
        )}
        {row.label}
      </td>
      <td style={numStyle}>{isSection ? '' : money(row.current)}</td>
      <td style={numStyle}>{isSection ? '' : money(row.compare)}</td>
    </tr>
  );
}

function DocHeader({ org, title, period }: { org: string; title: string; period: string }) {
  return (
    <div style={{ textAlign: 'center', marginBottom: 18 }}>
      <div
        style={{
          fontWeight: 700,
          fontSize: 15,
          color: 'var(--mswd-navy, #0b3a67)',
          textTransform: 'uppercase',
        }}
      >
        {org}
      </div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: '#475467',
          textTransform: 'uppercase',
          letterSpacing: '0.03em',
        }}
      >
        {title.replace('DETAILED ', '').replace('CONDENSED ', '')}
      </div>
      <div style={{ fontSize: 12, color: '#667085' }}>{period}</div>
      <div style={{ fontSize: 11, color: '#98a2b3', marginTop: 2 }}>In Philippine Peso (₱)</div>
    </div>
  );
}

function Signatories({ prepared, noted }: { prepared: string; noted: string }) {
  const { organization } = useAuth();
  const prepCfg = signatoryFor(organization?.signatories, 'financialStatements', 'preparedBy');
  const noteCfg = signatoryFor(organization?.signatories, 'financialStatements', 'notedBy');
  // Configured name wins; the passed-in string ("Accountant"/"General Manager")
  // is the fallback. A configured designation shows as a second line.
  const preparedName = prepCfg?.name || prepared;
  const notedName = noteCfg?.name || noted;
  const lineStyle: CSSProperties = {
    marginTop: 28,
    fontWeight: 700,
    borderTop: '1px solid #344054',
    paddingTop: 4,
    minWidth: 200,
  };
  const titleStyle: CSSProperties = { fontWeight: 400, color: '#475467', fontSize: 11 };
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 48, fontSize: 12 }}>
      <div>
        <div style={{ color: '#667085' }}>Prepared by:</div>
        <div style={lineStyle}>
          {preparedName}
          {prepCfg?.title ? <div style={titleStyle}>{prepCfg.title}</div> : null}
        </div>
      </div>
      <div>
        <div style={{ color: '#667085' }}>Noted by:</div>
        <div style={lineStyle}>
          {notedName}
          {noteCfg?.title ? <div style={titleStyle}>{noteCfg.title}</div> : null}
        </div>
      </div>
    </div>
  );
}

function SceView({ data }: { data: ChangesInEquityResult }) {
  return (
    <div className="fs-doc">
      <DocHeader org={data.organizationName} title={data.title} period={data.headingPeriod} />
      <table
        className="fs-table"
        style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}
      >
        <thead>
          <tr>
            <th
              style={{
                textAlign: 'left',
                padding: '6px 8px',
                borderBottom: '2px solid #0b3a67',
                fontSize: 11,
                textTransform: 'uppercase',
                color: '#667085',
              }}
            >
              Particulars
            </th>
            {data.columns.map((c) => (
              <th
                key={c}
                style={{
                  textAlign: 'right',
                  padding: '6px 10px',
                  borderBottom: '2px solid #0b3a67',
                  fontSize: 11,
                  textTransform: 'uppercase',
                  color: '#667085',
                  minWidth: 120,
                }}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r, i) => {
            if (r.kind === 'spacer') {
              return (
                <tr key={i} aria-hidden>
                  <td colSpan={data.columns.length + 1} style={{ height: 8, border: 'none' }} />
                </tr>
              );
            }
            const strong = r.kind === 'total';
            const cell: CSSProperties = {
              textAlign: 'right',
              fontFamily: "'SF Mono','Cascadia Code',monospace",
              fontVariantNumeric: 'tabular-nums',
              padding: '3px 10px',
              fontWeight: strong ? 700 : 400,
              color: strong ? 'var(--mswd-navy, #0b3a67)' : '#334155',
              borderTop: strong ? '1px solid #98a2b3' : 'none',
            };
            return (
              <tr key={i}>
                <td
                  style={{
                    paddingLeft: 8 + r.level * 18,
                    paddingTop: 3,
                    paddingBottom: 3,
                    fontWeight: r.kind === 'total' || r.kind === 'header' ? 700 : 400,
                    color: r.kind === 'total' ? 'var(--mswd-navy, #0b3a67)' : '#1e293b',
                    borderTop: strong ? '1px solid #98a2b3' : 'none',
                  }}
                >
                  {r.label}
                </td>
                {r.values.map((v, j) => (
                  <td key={j} style={cell}>
                    {money(v)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      <Signatories prepared={data.preparedBy} noted={data.notedBy} />
    </div>
  );
}

export default function FinancialStatementsPage() {
  const { organization } = useAuth();
  const [viewMode, setViewMode] = useState<ViewMode>('sfp');
  const [detail, setDetail] = useState<Detail>('detailed');
  const [fiscalYears, setFiscalYears] = useState<FiscalYearOption[]>([]);
  const [periods, setPeriods] = useState<PeriodOption[]>([]);
  const [selectedFY, setSelectedFY] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState(''); // '' interim(latest), ANNUAL, or a periodId
  const [state, setState] = useState<LoadState>({ status: 'idle' });

  const isSce = viewMode === 'sce';
  const annual = selectedPeriod === ANNUAL || isSce;

  useEffect(() => {
    getGlFiscalYears().then((fy) => {
      setFiscalYears(fy);
      if (fy.length > 0) setSelectedFY(fy[0]!.id);
    });
  }, []);

  useEffect(() => {
    if (!selectedFY) return;
    getGlPeriods(selectedFY).then(setPeriods);
  }, [selectedFY]);

  useEffect(() => {
    if (!selectedFY) return;
    setState({ status: 'loading' });

    if (isSce) {
      getChangesInEquity(`fiscalYearId=${selectedFY}`)
        .then((data) => setState({ status: 'sce', data }))
        .catch((err) =>
          setState({ status: 'error', message: err.message ?? 'Failed to load statement.' }),
        );
      return;
    }

    const params = new URLSearchParams();
    params.set('fiscalYearId', selectedFY);
    if (selectedPeriod === ANNUAL) params.set('mode', 'annual');
    else if (selectedPeriod) params.set('periodId', selectedPeriod);
    if (detail === 'condensed') params.set('condensed', '1');

    const fetcher =
      viewMode === 'sfp' ? getDetailedSfp : viewMode === 'sci' ? getDetailedSci : getDetailedScf;
    fetcher(params.toString())
      .then((data) => {
        setState({ status: 'loaded', data });
        setSelectedPeriod((prev) => prev || data.period.id); // reflect the server's chosen month
      })
      .catch((err) =>
        setState({ status: 'error', message: err.message ?? 'Failed to load statement.' }),
      );
  }, [selectedFY, selectedPeriod, viewMode, detail, isSce]);

  const districtName =
    (state.status === 'loaded' || state.status === 'sce' ? state.data.organizationName : '') ||
    organization?.legalName ||
    organization?.name ||
    'Water District';

  return (
    <div className="acct-page acct-page--embedded">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <h1 style={{ margin: 0 }}>Financial Statements</h1>
        <button className="acct-btn" onClick={() => window.print()} style={{ fontSize: 12 }}>
          Print
        </button>
      </div>

      <div className="acct-toolbar">
        <select
          value={viewMode}
          onChange={(e) => setViewMode(e.target.value as ViewMode)}
          style={{ maxWidth: 360 }}
        >
          <option value="sfp">Statement of Financial Position (SFP)</option>
          <option value="sci">Statement of Comprehensive Income (SCI)</option>
          <option value="scf">Statement of Cash Flows (SCF)</option>
          <option value="sce">Statement of Changes in Equity (SCE)</option>
        </select>

        <select value={selectedFY} onChange={(e) => setSelectedFY(e.target.value)}>
          {fiscalYears.map((fy) => (
            <option key={fy.id} value={fy.id}>
              FY {fy.year} — {fy.name}
            </option>
          ))}
        </select>

        {!isSce && (
          <select value={selectedPeriod} onChange={(e) => setSelectedPeriod(e.target.value)}>
            <option value={ANNUAL}>Full Year (Year-End)</option>
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}

        {!isSce && (
          <select value={detail} onChange={(e) => setDetail(e.target.value as Detail)}>
            <option value="detailed">Detailed</option>
            <option value="condensed">Condensed</option>
          </select>
        )}

        {(annual || isSce) && (
          <span style={{ fontSize: 12, color: '#175cd3', fontWeight: 600, alignSelf: 'center' }}>
            Year-End basis
          </span>
        )}
      </div>

      {state.status === 'error' && <div className="acct-error">{state.message}</div>}
      {state.status === 'loading' && <div className="acct-empty">Loading…</div>}

      {state.status === 'sce' && <SceView data={state.data} />}

      {state.status === 'loaded' && (
        <div className="fs-doc">
          <DocHeader
            org={districtName}
            title={state.data.title}
            period={state.data.headingPeriod}
          />
          <table
            className="fs-table"
            style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}
          >
            <thead>
              <tr>
                <th
                  style={{
                    textAlign: 'left',
                    padding: '6px 8px',
                    borderBottom: '2px solid #0b3a67',
                    fontSize: 11,
                    textTransform: 'uppercase',
                    color: '#667085',
                  }}
                >
                  Particulars
                </th>
                <th
                  style={{
                    textAlign: 'right',
                    padding: '6px 10px',
                    borderBottom: '2px solid #0b3a67',
                    fontSize: 11,
                    textTransform: 'uppercase',
                    color: '#667085',
                    minWidth: 130,
                  }}
                >
                  {state.data.currentLabel}
                </th>
                <th
                  style={{
                    textAlign: 'right',
                    padding: '6px 10px',
                    borderBottom: '2px solid #0b3a67',
                    fontSize: 11,
                    textTransform: 'uppercase',
                    color: '#667085',
                    minWidth: 130,
                  }}
                >
                  {state.data.compareLabel}
                </th>
              </tr>
            </thead>
            <tbody>
              {state.data.rows.map((row, i) => (
                <StatementRowView
                  key={row.code ? `${row.code}-${i}` : `${row.kind}-${i}`}
                  row={row}
                />
              ))}
            </tbody>
          </table>
          <Signatories prepared={state.data.preparedBy} noted={state.data.notedBy} />
        </div>
      )}
    </div>
  );
}
