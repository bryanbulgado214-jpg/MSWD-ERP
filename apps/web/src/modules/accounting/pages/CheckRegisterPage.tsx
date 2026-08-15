import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useAuth } from '../../../app/auth';

import { AccountingSubNav } from './AccountingSubNav';

import './accounting.css';
import { getChecks, printCheck, transitionCheck, voidCheck } from '../api';
import type { CheckListItem } from '../types';

function formatPeso(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num) || num === 0) return '—';
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(num);
}

const STATUS_OPTIONS = [
  '',
  'pending',
  'printed',
  'released',
  'cleared',
  'stale_dated',
  'spoiled',
  'voided',
];

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: CheckListItem[] };

export default function CheckRegisterPage() {
  const { permissions } = useAuth();
  const navigate = useNavigate();
  const canPrint = permissions.has('accounting.check.print');
  const canRelease = permissions.has('accounting.check.record_release');
  const canVoid = permissions.has('accounting.check.void');

  const [state, setState] = useState<LoadState>({ status: 'idle' });
  const [filterBank, setFilterBank] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [search, setSearch] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  // Cashier print modal
  const [printTarget, setPrintTarget] = useState<CheckListItem | null>(null);
  const [printNumber, setPrintNumber] = useState('');
  const [printDate, setPrintDate] = useState(new Date().toISOString().slice(0, 10));
  const [printError, setPrintError] = useState('');
  const [printing, setPrinting] = useState(false);

  const loadChecks = () => {
    setState({ status: 'loading' });
    const params = new URLSearchParams();
    if (filterBank) params.set('bankAccountId', filterBank);
    if (filterStatus) params.set('status', filterStatus);
    if (search) params.set('search', search);
    getChecks(params.toString())
      .then((data) => setState({ status: 'loaded', data }))
      .catch((err) => setState({ status: 'error', message: err.message }));
  };

  useEffect(() => {
    loadChecks();
  }, [filterBank, filterStatus]);

  const checks = state.status === 'loaded' ? state.data : [];

  // Bank filter options are derived from the loaded checks — the cashier has no
  // broad accounting.read to list bank accounts, and the register only needs the
  // banks that actually appear on checks.
  const bankOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of checks)
      map.set(c.bankAccount.id, `${c.bankAccount.bank.code} — ${c.bankAccount.accountName}`);
    return [...map.entries()].map(([id, label]) => ({ id, label }));
  }, [checks]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadChecks();
  };

  function openPrint(check: CheckListItem) {
    setPrintTarget(check);
    setPrintNumber('');
    setPrintDate(new Date().toISOString().slice(0, 10));
    setPrintError('');
  }

  async function confirmPrint() {
    if (!printTarget || !printNumber.trim()) return;
    setPrinting(true);
    setPrintError('');
    try {
      await printCheck(printTarget.id, { checkNumber: printNumber.trim(), checkDate: printDate });
      const id = printTarget.id;
      setPrintTarget(null);
      navigate(`/accounting/checks/${id}/print`);
    } catch (err: any) {
      setPrintError(err.message);
    } finally {
      setPrinting(false);
    }
  }

  async function handleRelease(check: CheckListItem, toStatus: 'released' | 'cleared') {
    setActionError('');
    let clearedDate: string | undefined;
    if (toStatus === 'cleared') {
      clearedDate = prompt('Cleared date (YYYY-MM-DD):') ?? undefined;
      if (!clearedDate) return;
    }
    setBusy(check.id);
    try {
      await transitionCheck(check.id, {
        expectedVersion: check.version,
        toStatus,
        ...(clearedDate ? { clearedDate } : {}),
      });
      loadChecks();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function handleVoid(check: CheckListItem, toStatus: 'voided' | 'spoiled') {
    setActionError('');
    const remarks =
      prompt(
        `Reason to ${toStatus === 'spoiled' ? 'spoil' : 'void'} check ${check.checkNumber ?? ''}:`,
      ) ?? '';
    if (!remarks.trim()) return;
    setBusy(check.id);
    try {
      await voidCheck(check.id, {
        expectedVersion: check.version,
        toStatus,
        remarks: remarks.trim(),
      });
      loadChecks();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="acct-page">
      <AccountingSubNav />
      <h1>Check Register</h1>
      <p style={{ color: '#667085', fontSize: 13, marginTop: -6, marginBottom: 16, maxWidth: 780 }}>
        Every check is backed by a Disbursement Voucher — checks are never created manually. A DV
        paid by check appears here as <strong>pending</strong>; the cashier assigns the check number
        and prints it. Voiding a check requires the General Manager (and never the person who
        printed or released it).
        {!canPrint && !canVoid && ' (You have view-only access.)'}
      </p>

      <div className="acct-toolbar">
        <select
          value={filterBank}
          onChange={(e) => setFilterBank(e.target.value)}
          style={{ width: '100%', maxWidth: 260, boxSizing: 'border-box' }}
        >
          <option value="">All Bank Accounts</option>
          {bankOptions.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s ? s.replace(/_/g, ' ') : 'All Statuses'}
            </option>
          ))}
        </select>
        <form onSubmit={handleSearch} style={{ display: 'contents' }}>
          <input
            type="text"
            placeholder="Search check# or payee..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </form>
      </div>

      {actionError && <div className="acct-error">{actionError}</div>}

      {printTarget && (
        <div
          onClick={() => setPrintTarget(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(16,24,40,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: 10,
              padding: 24,
              width: 420,
              maxWidth: '92vw',
              boxShadow: '0 10px 40px rgba(16,24,40,0.2)',
            }}
          >
            <h2 style={{ margin: '0 0 4px', fontSize: 17 }}>Print Check</h2>
            <p style={{ fontSize: 12.5, color: '#667085', margin: '0 0 16px' }}>
              {printTarget.disbursementVoucher?.dvNumber} · {printTarget.payeeName} ·{' '}
              {formatPeso(printTarget.amount)}
            </p>
            {printError && (
              <div className="acct-error" style={{ marginBottom: 12 }}>
                {printError}
              </div>
            )}
            <label
              style={{
                display: 'block',
                fontSize: 12,
                fontWeight: 600,
                color: '#344054',
                marginBottom: 4,
              }}
            >
              Check Number *
            </label>
            <input
              autoFocus
              value={printNumber}
              onChange={(e) => setPrintNumber(e.target.value)}
              placeholder="e.g. DBP-0004851"
              style={{
                width: '100%',
                padding: '8px 10px',
                border: '1px solid #d0d5dd',
                borderRadius: 6,
                fontSize: 13,
                boxSizing: 'border-box',
                marginBottom: 14,
              }}
            />
            <label
              style={{
                display: 'block',
                fontSize: 12,
                fontWeight: 600,
                color: '#344054',
                marginBottom: 4,
              }}
            >
              Check Date
            </label>
            <input
              type="date"
              value={printDate}
              onChange={(e) => setPrintDate(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 10px',
                border: '1px solid #d0d5dd',
                borderRadius: 6,
                fontSize: 13,
                boxSizing: 'border-box',
                marginBottom: 20,
              }}
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" className="acct-btn" onClick={() => setPrintTarget(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="acct-btn acct-btn--primary"
                disabled={!printNumber.trim() || printing}
                onClick={confirmPrint}
              >
                {printing ? 'Printing...' : 'Assign & Print'}
              </button>
            </div>
          </div>
        </div>
      )}

      {state.status === 'loading' && <div className="acct-empty">Loading...</div>}
      {state.status === 'error' && <div className="acct-error">{state.message}</div>}
      {state.status === 'loaded' && checks.length === 0 && (
        <div className="acct-empty">
          No checks found. Checks appear here when a check-paid DV is prepared.
        </div>
      )}

      {state.status === 'loaded' && checks.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="acct-table">
            <thead>
              <tr>
                <th>Check #</th>
                <th>DV #</th>
                <th>Date</th>
                <th>Payee</th>
                <th>Bank</th>
                <th className="acct-text-right">Amount</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {checks.map((c) => {
                const dvDraft = c.disbursementVoucher?.status === 'draft';
                const isPending = c.status === 'pending';
                const voidable = canVoid && !['voided', 'spoiled', 'cleared'].includes(c.status);
                return (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}>
                      {c.checkNumber ?? (
                        <span style={{ color: '#98a2b3', fontStyle: 'italic', fontWeight: 400 }}>
                          — pending —
                        </span>
                      )}
                    </td>
                    <td>
                      {c.disbursementVoucher ? (
                        <Link
                          to={`/accounting/disbursements/${c.disbursementVoucher.id}/print`}
                          className="acct-table__link"
                        >
                          {c.disbursementVoucher.dvNumber}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {new Date(c.checkDate).toLocaleDateString()}
                    </td>
                    <td>{c.payeeName}</td>
                    <td>
                      {c.bankAccount.bank.code} — {c.bankAccount.accountName}
                    </td>
                    <td className="acct-text-right acct-text-mono">{formatPeso(c.amount)}</td>
                    <td>
                      <span className={`acct-badge acct-badge--${c.status}`}>
                        {c.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td>
                      <div
                        style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}
                      >
                        {isPending && canPrint && !dvDraft && (
                          <button
                            className="acct-btn acct-btn--sm acct-btn--primary"
                            onClick={() => openPrint(c)}
                          >
                            Print Check
                          </button>
                        )}
                        {isPending && dvDraft && (
                          <span style={{ fontSize: 11, color: '#98a2b3' }}>DV not yet posted</span>
                        )}
                        {!isPending && canPrint && (
                          <Link
                            to={`/accounting/checks/${c.id}/print`}
                            className="acct-table__link"
                          >
                            Print
                          </Link>
                        )}
                        {canRelease && c.status === 'printed' && (
                          <button
                            className="acct-btn acct-btn--sm"
                            disabled={busy === c.id}
                            onClick={() => handleRelease(c, 'released')}
                          >
                            release
                          </button>
                        )}
                        {canRelease && c.status === 'released' && (
                          <button
                            className="acct-btn acct-btn--sm"
                            disabled={busy === c.id}
                            onClick={() => handleRelease(c, 'cleared')}
                          >
                            cleared
                          </button>
                        )}
                        {voidable && (
                          <button
                            className="acct-btn acct-btn--sm acct-btn--danger"
                            disabled={busy === c.id}
                            onClick={() => handleVoid(c, 'voided')}
                          >
                            void
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
