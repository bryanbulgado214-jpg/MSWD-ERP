import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { getPostableAccounts, type PostableAccount } from '../../accounting/api';
import {
  createUtilizationLine,
  deleteUtilizationLine,
  getUtilizationLines,
  listFiscalYears,
  seedUtilizationLines,
  setUtilizationAccounts,
  setUtilizationExcludedContras,
  setUtilizationRequiredContras,
  updateUtilizationLine,
  UTILIZATION_SECTION_LABELS,
  type FiscalYearLookupItem,
  type UtilizationLineConfig,
  type UtilizationSection,
} from '../api';
import { formatPeso } from '../format-peso';

const SECTIONS: UtilizationSection[] = ['personnel_services', 'mooe', 'capital_outlay'];
const WRAP: React.CSSProperties = { maxWidth: 1040, margin: '0 auto', padding: '1.5rem' };
const btn: React.CSSProperties = {
  padding: '6px 11px',
  borderRadius: 8,
  border: '1px solid #d0d5dd',
  background: '#fff',
  cursor: 'pointer',
  fontSize: 13,
};

export default function BudgetUtilizationSetupPage() {
  const [params, setParams] = useSearchParams();
  const [fiscalYears, setFiscalYears] = useState<FiscalYearLookupItem[]>([]);
  const fiscalYearId = params.get('fiscalYearId') ?? '';
  const [lines, setLines] = useState<UtilizationLineConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [mapFor, setMapFor] = useState<{
    line: UtilizationLineConfig;
    kind: 'accounts' | 'excluded' | 'required';
  } | null>(null);
  const [newName, setNewName] = useState<Record<UtilizationSection, string>>({
    personnel_services: '',
    mooe: '',
    capital_outlay: '',
  });

  useEffect(() => {
    listFiscalYears()
      .then((years) => {
        setFiscalYears(years);
        if (years.length && !fiscalYearId) {
          setParams({ fiscalYearId: years[0]!.id }, { replace: true });
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load fiscal years.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function refresh() {
    if (!fiscalYearId) return;
    setLoading(true);
    getUtilizationLines(fiscalYearId)
      .then(setLines)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load lines.'))
      .finally(() => setLoading(false));
  }

  useEffect(refresh, [fiscalYearId]);

  async function withBusy(fn: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  async function saveAmount(line: UtilizationLineConfig, value: string) {
    const amount = Number(value.replace(/,/g, ''));
    if (!Number.isFinite(amount) || amount === Number(line.budgetAmount)) return;
    await withBusy(async () => {
      await updateUtilizationLine(line.id, { expectedVersion: line.version, budgetAmount: amount });
      refresh();
    });
  }

  async function addLine(section: UtilizationSection) {
    const name = newName[section].trim();
    if (!name || !fiscalYearId) return;
    await withBusy(async () => {
      await createUtilizationLine({ fiscalYearId, section, name });
      setNewName((p) => ({ ...p, [section]: '' }));
      refresh();
    });
  }

  async function removeLine(line: UtilizationLineConfig) {
    if (!window.confirm(`Remove "${line.name}" and its account mapping?`)) return;
    await withBusy(async () => {
      await deleteUtilizationLine(line.id);
      refresh();
    });
  }

  const hasLines = lines.length > 0;

  return (
    <div style={WRAP}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: '0 0 4px' }}>Budget Utilization — Setup &amp; Mapping</h1>
          <p style={{ margin: 0, color: '#667085', fontSize: 14 }}>
            Set each category's budget for the year and choose which GL accounts' disbursements roll into it.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ fontSize: 13 }}>
            Fiscal Year{' '}
            <select
              value={fiscalYearId}
              onChange={(e) => setParams({ fiscalYearId: e.target.value }, { replace: true })}
              style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid #d0d5dd' }}
            >
              {fiscalYears.map((fy) => (
                <option key={fy.id} value={fy.id}>
                  {fy.name} ({fy.year})
                </option>
              ))}
            </select>
          </label>
          <Link
            to={`/budgeting/utilization${fiscalYearId ? `?fiscalYearId=${fiscalYearId}` : ''}`}
            style={{ ...btn, textDecoration: 'none', color: '#344054' }}
          >
            ← Back to report
          </Link>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fef3f2', color: '#b42318', padding: '10px 14px', borderRadius: 8, marginBottom: 12 }}>
          {error}
        </div>
      )}
      {loading && <div style={{ color: '#667085' }}>Loading…</div>}

      {!loading && !hasLines && (
        <div style={{ border: '1px dashed #d0d5dd', borderRadius: 12, padding: 28, textAlign: 'center' }}>
          <p style={{ margin: '0 0 12px', color: '#475467' }}>
            No lines yet for this fiscal year. Load the standard DBM Form 703 line items to start.
          </p>
          <button
            type="button"
            disabled={busy || !fiscalYearId}
            onClick={() => withBusy(async () => {
              await seedUtilizationLines(fiscalYearId);
              refresh();
            })}
            style={{ ...btn, background: '#175cd3', color: '#fff', borderColor: '#175cd3', padding: '9px 16px' }}
          >
            {busy ? 'Loading…' : 'Load standard DBM 703 lines'}
          </button>
        </div>
      )}

      {!loading && hasLines &&
        SECTIONS.map((section) => {
          const secLines = lines.filter((l) => l.section === section);
          const subtotal = secLines.reduce((s, l) => s + Number(l.budgetAmount), 0);
          return (
            <div key={section} style={{ marginBottom: 22 }}>
              <h3 style={{ margin: '0 0 8px', color: 'var(--mswd-navy, #0a2540)', fontSize: 15 }}>
                {UTILIZATION_SECTION_LABELS[section]}{' '}
                <span style={{ color: '#667085', fontWeight: 400, fontSize: 13 }}>— budget {formatPeso(subtotal)}</span>
              </h3>
              <div style={{ border: '1px solid #eaecf0', borderRadius: 10, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
                  <thead>
                    <tr style={{ background: '#f9fafb', color: '#475467', textAlign: 'left' }}>
                      <th style={{ padding: '8px 10px', width: '34%' }}>Line item</th>
                      <th style={{ padding: '8px 10px', width: '20%' }}>Budget for the year</th>
                      <th style={{ padding: '8px 10px' }}>Mapped GL accounts</th>
                      <th style={{ padding: '8px 10px', width: 90 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {secLines.map((line) => (
                      <tr key={line.id} style={{ borderTop: '1px solid #f2f4f7', verticalAlign: 'top' }}>
                        <td style={{ padding: '9px 10px' }}>
                          {line.name}
                          {line.appCrossCheck && (
                            <span
                              title="This line also shows APP utilization for reconciliation"
                              style={{ marginLeft: 6, fontSize: 10, color: '#175cd3', border: '1px solid #b2ccff', borderRadius: 6, padding: '1px 5px' }}
                            >
                              APP cross-check
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '9px 10px' }}>
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            defaultValue={Number(line.budgetAmount)}
                            onBlur={(e) => saveAmount(line, e.target.value)}
                            style={{ width: 150, padding: '5px 8px', borderRadius: 7, border: '1px solid #d0d5dd', textAlign: 'right' }}
                          />
                        </td>
                        <td style={{ padding: '9px 10px' }}>
                          {line.accounts.length === 0 ? (
                            <span style={{ color: '#98a2b3' }}>No accounts mapped</span>
                          ) : (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                              {line.accounts.map((a) => (
                                <span
                                  key={a.id}
                                  style={{ background: '#eff4ff', color: '#175cd3', borderRadius: 6, padding: '2px 7px', fontSize: 12 }}
                                  title={a.name}
                                >
                                  {a.accountCode}
                                </span>
                              ))}
                            </div>
                          )}
                          {line.excludedContras.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 5, alignItems: 'center' }}>
                              <span style={{ fontSize: 11, color: '#98a2b3' }}>ignore offsets:</span>
                              {line.excludedContras.map((a) => (
                                <span
                                  key={a.id}
                                  style={{ background: '#fef3f2', color: '#b42318', borderRadius: 6, padding: '2px 7px', fontSize: 12 }}
                                  title={a.name}
                                >
                                  {a.accountCode}
                                </span>
                              ))}
                            </div>
                          )}
                          {line.requiredContras.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 5, alignItems: 'center' }}>
                              <span style={{ fontSize: 11, color: '#98a2b3' }}>count only when offset by:</span>
                              {line.requiredContras.map((a) => (
                                <span
                                  key={a.id}
                                  style={{ background: '#ecfdf3', color: '#067647', borderRadius: 6, padding: '2px 7px', fontSize: 12 }}
                                  title={a.name}
                                >
                                  {a.accountCode}
                                </span>
                              ))}
                            </div>
                          )}
                          <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                            <button type="button" style={{ ...btn, padding: '4px 9px' }} onClick={() => setMapFor({ line, kind: 'accounts' })}>
                              Map accounts
                            </button>
                            <button
                              type="button"
                              style={{ ...btn, padding: '4px 9px' }}
                              onClick={() => setMapFor({ line, kind: 'excluded' })}
                              title="Ignore entries offset by chosen accounts (e.g. the month-end inventory reclass)"
                            >
                              Ignore offsets…
                            </button>
                            {section === 'capital_outlay' && (
                              <button
                                type="button"
                                style={{ ...btn, padding: '4px 9px' }}
                                onClick={() => setMapFor({ line, kind: 'required' })}
                                title="Count a capital-asset debit only when the voucher credits one of these accounts (Accounts Payable), so asset reclassifications are left out"
                              >
                                Require offset…
                              </button>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '9px 10px', textAlign: 'right' }}>
                          <button
                            type="button"
                            onClick={() => removeLine(line)}
                            style={{ ...btn, color: '#b42318', borderColor: '#fda29b' }}
                            title="Remove line"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                    <tr style={{ borderTop: '1px solid #f2f4f7', background: '#fcfcfd' }}>
                      <td style={{ padding: '9px 10px' }} colSpan={4}>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <input
                            value={newName[section]}
                            onChange={(e) => setNewName((p) => ({ ...p, [section]: e.target.value }))}
                            onKeyDown={(e) => e.key === 'Enter' && addLine(section)}
                            placeholder="Add a line item…"
                            style={{ flex: 1, maxWidth: 320, padding: '6px 9px', borderRadius: 7, border: '1px solid #d0d5dd' }}
                          />
                          <button type="button" style={btn} disabled={busy || !newName[section].trim()} onClick={() => addLine(section)}>
                            + Add line
                          </button>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}

      {mapFor && (
        <AccountMapModal
          line={mapFor.line}
          kind={mapFor.kind}
          onClose={() => setMapFor(null)}
          onSaved={(updated) => {
            setLines(updated);
            setMapFor(null);
          }}
        />
      )}
    </div>
  );
}

function AccountMapModal({
  line,
  kind,
  onClose,
  onSaved,
}: {
  line: UtilizationLineConfig;
  kind: 'accounts' | 'excluded' | 'required';
  onClose: () => void;
  onSaved: (lines: UtilizationLineConfig[]) => void;
}) {
  const isExcluded = kind === 'excluded';
  const isRequired = kind === 'required';
  const initial = isRequired
    ? line.requiredContras
    : isExcluded
      ? line.excludedContras
      : line.accounts;
  const [accounts, setAccounts] = useState<PostableAccount[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set(initial.map((a) => a.id)));
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getPostableAccounts()
      .then(setAccounts)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load accounts.'));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter((a) => `${a.accountCode} ${a.name}`.toLowerCase().includes(q));
  }, [accounts, search]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setError('');
    try {
      const updated = isRequired
        ? await setUtilizationRequiredContras(line.id, [...selected])
        : isExcluded
          ? await setUtilizationExcludedContras(line.id, [...selected])
          : await setUtilizationAccounts(line.id, [...selected]);
      onSaved(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save.');
      setSaving(false);
    }
  }

  return (
    <div
      onMouseDown={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(16,24,40,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 560, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #eaecf0' }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>
            {isRequired
              ? 'Count only when offset by'
              : isExcluded
                ? 'Ignore entries offset by'
                : 'Map GL accounts'}{' '}
            — {line.name}
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#667085' }}>
            {isRequired
              ? 'Pick the offset accounts (Accounts Payable): a debit to this line is counted only when its voucher also credits one of these. Capital-asset reclassifications, which credit another asset instead of A/P, are left out.'
              : isExcluded
                ? 'Pick the contra accounts to ignore: a debit to this line is dropped when its voucher also credits one of these (e.g. the month-end Supplies Inventory reclass).'
                : 'Pick the accounts whose posted voucher debits count toward this line.'}
          </p>
        </div>
        <div style={{ padding: '10px 18px' }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by code or name…"
            style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid #d0d5dd' }}
          />
        </div>
        {error && <div style={{ color: '#b42318', padding: '0 18px 8px' }}>{error}</div>}
        <div style={{ overflowY: 'auto', padding: '0 18px', flex: 1 }}>
          {accounts.length === 0 && !error && <div style={{ color: '#667085', padding: '12px 0' }}>Loading accounts…</div>}
          {filtered.map((a) => (
            <label
              key={a.id}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 2px', borderBottom: '1px solid #f2f4f7', cursor: 'pointer', fontSize: 13 }}
            >
              <input type="checkbox" checked={selected.has(a.id)} onChange={() => toggle(a.id)} />
              <span style={{ color: '#667085', minWidth: 90, fontVariantNumeric: 'tabular-nums' }}>{a.accountCode}</span>
              <span>{a.name}</span>
            </label>
          ))}
        </div>
        <div style={{ padding: '12px 18px', borderTop: '1px solid #eaecf0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#667085' }}>{selected.size} selected</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={onClose} style={btn}>
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              style={{ ...btn, background: '#175cd3', color: '#fff', borderColor: '#175cd3' }}
            >
              {saving
                ? 'Saving…'
                : isRequired
                  ? 'Save offset rule'
                  : isExcluded
                    ? 'Save ignore list'
                    : 'Save mapping'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
