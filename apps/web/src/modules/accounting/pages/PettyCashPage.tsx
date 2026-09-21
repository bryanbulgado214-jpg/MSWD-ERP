import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '../../../app/auth';
import {
  AccountingApiError,
  approvePettyCashReplenishment,
  cancelPettyCashReplenishment,
  cancelPettyCashVoucher,
  createPettyCashFund,
  createPettyCashVoucher,
  getPettyCashExpenseAccounts,
  getPettyCashFunds,
  getPettyCashReplenishment,
  getPettyCashReplenishments,
  getPettyCashVouchers,
  getPostableAccounts,
  preparePettyCashReplenishment,
  setPettyCashVoucherChargeAccount,
  updatePettyCashFund,
  type PostableAccount,
} from '../api';
import type {
  PettyCashAccountRef,
  PettyCashFund,
  PettyCashReplenishment,
  PettyCashReplenishmentDetail,
  PettyCashVoucher,
} from '../types';

import { AccountingSubNav } from './AccountingSubNav';
import './accounting.css';

const peso = (v: number) => v.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
const today = () => new Date().toISOString().slice(0, 10);
const fmtDate = (s: string) => new Date(s).toLocaleDateString('en-PH');

/** Small red dot shown on a tab header when it has pending items. */
const TabDot = ({ show, title }: { show: boolean; title: string }) =>
  show ? (
    <span
      title={title}
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: '#f04438',
        marginLeft: 6,
        verticalAlign: 'middle',
      }}
    />
  ) : null;

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div
      onMouseDown={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(16,24,40,0.45)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '48px 16px',
        zIndex: 1000,
        overflowY: 'auto',
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: 10,
          padding: 20,
          width: '100%',
          maxWidth: 640,
          boxShadow: '0 12px 40px rgba(16,24,40,0.18)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 17 }}>{title}</h2>
          <button className="acct-btn acct-btn--sm" style={{ marginLeft: 'auto' }} onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function PettyCashPage({ subNav }: { subNav?: ReactNode } = {}) {
  const { permissions } = useAuth();
  const canManage = permissions.has('accounting.petty_cash.manage'); // accountant: setup + post
  const canOperate = permissions.has('accounting.petty_cash.operate'); // cashier/custodian

  const [funds, setFunds] = useState<PettyCashFund[] | null>(null);
  const [fundId, setFundId] = useState<string>('');
  const [vouchers, setVouchers] = useState<PettyCashVoucher[]>([]);
  const [reps, setReps] = useState<PettyCashReplenishment[]>([]);
  const [expenseAccounts, setExpenseAccounts] = useState<PettyCashAccountRef[]>([]);
  const [tab, setTab] = useState<'vouchers' | 'replenishments'>('vouchers');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const fund = useMemo(() => funds?.find((f) => f.id === fundId) ?? null, [funds, fundId]);

  const loadFunds = useCallback(async () => {
    try {
      const data = await getPettyCashFunds();
      setFunds(data);
      setFundId((cur) => cur || data[0]?.id || '');
    } catch (e) {
      setError(e instanceof AccountingApiError ? e.message : 'Failed to load petty cash funds.');
      setFunds([]);
    }
  }, []);

  const loadFundData = useCallback(async (id: string) => {
    try {
      const [v, r] = await Promise.all([
        getPettyCashVouchers(id),
        getPettyCashReplenishments(id),
      ]);
      setVouchers(v);
      setReps(r);
    } catch (e) {
      setError(e instanceof AccountingApiError ? e.message : 'Failed to load fund activity.');
    }
  }, []);

  useEffect(() => {
    loadFunds();
    getPettyCashExpenseAccounts()
      .then(setExpenseAccounts)
      .catch(() => setExpenseAccounts([]));
  }, [loadFunds]);

  useEffect(() => {
    if (fundId) loadFundData(fundId);
  }, [fundId, loadFundData]);

  const refresh = useCallback(async () => {
    await loadFunds();
    if (fundId) await loadFundData(fundId);
  }, [loadFunds, loadFundData, fundId]);

  // ── modals ──
  const [showVoucherForm, setShowVoucherForm] = useState(false);
  const [showFundForm, setShowFundForm] = useState<false | 'create' | 'edit'>(false);
  const [showPrepare, setShowPrepare] = useState(false);
  const [reviewId, setReviewId] = useState<string | null>(null);

  async function act(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await fn();
      setNotice(ok);
      await refresh();
    } catch (e) {
      setError(e instanceof AccountingApiError ? e.message : 'Action failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="acct-page">
      {subNav ?? <AccountingSubNav />}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ marginBottom: 0 }}>Petty Cash Fund</h1>
        {funds && funds.length > 1 && (
          <select
            className="acct-field"
            style={{ maxWidth: 280 }}
            value={fundId}
            onChange={(e) => setFundId(e.target.value)}
          >
            {funds.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <p style={{ color: '#667085', fontSize: 13, marginTop: 6, maxWidth: 860 }}>
        Imprest system — petty-cash vouchers are recorded as the custodian pays them, with{' '}
        <strong>no journal entry</strong>. On <strong>replenishment</strong>, the accountant
        approves it to raise a draft <strong>disbursement voucher</strong> (Dr expenses, Cr Cash in
        Bank); posting that DV records the journal entry and restores the fund to its imprest amount.
      </p>

      {error && <div className="acct-error">{error}</div>}
      {notice && <div className="acct-success">{notice}</div>}

      {funds === null && <div className="acct-empty">Loading…</div>}

      {funds !== null && !fund && (
        <div className="acct-panel" style={{ marginTop: 12 }}>
          <p style={{ margin: 0 }}>
            No petty cash fund has been set up yet.{' '}
            {canManage
              ? 'Set one up to begin.'
              : 'Ask the accountant to set one up before recording vouchers.'}
          </p>
          {canManage && (
            <button
              className="acct-btn acct-btn--primary"
              style={{ marginTop: 12 }}
              onClick={() => setShowFundForm('create')}
            >
              Set up petty cash fund
            </button>
          )}
        </div>
      )}

      {fund && (
        <>
          {/* ── Fund summary ── */}
          <div className="acct-panel" style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: 16 }}>{fund.name}</h2>
              <span className={`acct-badge acct-badge--${fund.status}`}>{fund.status}</span>
              {canManage && (
                <button
                  className="acct-btn acct-btn--sm"
                  style={{ marginLeft: 'auto' }}
                  onClick={() => setShowFundForm('edit')}
                >
                  Edit fund
                </button>
              )}
            </div>
            <div className="acct-kpi-grid" style={{ marginTop: 12 }}>
              <div className="acct-kpi">
                <div className="acct-stat">{peso(fund.imprestAmount)}</div>
                <div>Imprest amount</div>
              </div>
              <div className="acct-kpi">
                <div className="acct-stat">{peso(fund.unreplenishedTotal)}</div>
                <div>Unreplenished vouchers</div>
              </div>
              <div className="acct-kpi">
                <div className="acct-stat" style={{ color: fund.cashOnHand < 0 ? '#b42318' : undefined }}>
                  {peso(fund.cashOnHand)}
                </div>
                <div>Cash on hand</div>
              </div>
            </div>
            <div style={{ fontSize: 12, color: '#667085', marginTop: 10, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              <span>
                Petty Cash acct:{' '}
                <span className="acct-text-mono">{fund.pettyCashAccount?.accountCode ?? '—'}</span>{' '}
                {fund.pettyCashAccount?.name ?? ''}
              </span>
              <span>
                Replenished from:{' '}
                <span className="acct-text-mono">{fund.cashInBankAccount?.accountCode ?? '—'}</span>{' '}
                {fund.cashInBankAccount?.name ?? ''}
              </span>
              {fund.custodianName && <span>Custodian: {fund.custodianName}</span>}
            </div>
          </div>

          {/* ── Tabs ── */}
          <div className="acct-tabs" style={{ marginTop: 16 }}>
            <button
              className={`acct-tab${tab === 'vouchers' ? ' acct-tab--active' : ''}`}
              onClick={() => setTab('vouchers')}
            >
              Vouchers
              <TabDot
                show={vouchers.some((v) => v.status === 'unreplenished' && !v.replenishmentId)}
                title="Vouchers awaiting replenishment"
              />
            </button>
            <button
              className={`acct-tab${tab === 'replenishments' ? ' acct-tab--active' : ''}`}
              onClick={() => setTab('replenishments')}
            >
              Replenishments
              <TabDot
                show={reps.some((r) => r.status === 'draft')}
                title="Replenishment pending review"
              />
            </button>
          </div>

          {tab === 'vouchers' && (
            <VouchersTab
              vouchers={vouchers}
              canOperate={canOperate}
              fundActive={fund.status === 'active'}
              busy={busy}
              onRecord={() => setShowVoucherForm(true)}
              onPrepare={() => setShowPrepare(true)}
              onCancel={(id) =>
                act(() => cancelPettyCashVoucher(id), 'Voucher cancelled.')
              }
            />
          )}

          {tab === 'replenishments' && (
            <ReplenishmentsTab
              reps={reps}
              canManage={canManage}
              onOpen={(id) => setReviewId(id)}
            />
          )}
        </>
      )}

      {/* ── Modals ── */}
      {showVoucherForm && fund && (
        <VoucherFormModal
          fund={fund}
          onClose={() => setShowVoucherForm(false)}
          onSaved={async () => {
            setShowVoucherForm(false);
            await act(async () => {}, 'Voucher recorded.');
          }}
        />
      )}

      {showFundForm && (
        <FundFormModal
          mode={showFundForm}
          fund={showFundForm === 'edit' ? fund : null}
          onClose={() => setShowFundForm(false)}
          onSaved={async () => {
            setShowFundForm(false);
            await act(async () => {}, 'Fund saved.');
          }}
        />
      )}

      {showPrepare && fund && (
        <PrepareModal
          fundId={fund.id}
          vouchers={vouchers.filter((v) => v.status === 'unreplenished' && !v.replenishmentId)}
          onClose={() => setShowPrepare(false)}
          onPrepared={async (id) => {
            setShowPrepare(false);
            setTab('replenishments');
            setReviewId(id);
            await act(async () => {}, 'Replenishment prepared — ready for the accountant to post.');
          }}
        />
      )}

      {reviewId && (
        <ReviewModal
          id={reviewId}
          canManage={canManage}
          canOperate={canOperate}
          expenseAccounts={expenseAccounts}
          onClose={() => setReviewId(null)}
          onChanged={async (msg) => {
            setReviewId(null);
            await act(async () => {}, msg);
          }}
        />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
function VouchersTab({
  vouchers,
  canOperate,
  fundActive,
  busy,
  onRecord,
  onPrepare,
  onCancel,
}: {
  vouchers: PettyCashVoucher[];
  canOperate: boolean;
  fundActive: boolean;
  busy: boolean;
  onRecord: () => void;
  onPrepare: () => void;
  onCancel: (id: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const rows = showAll ? vouchers : vouchers.filter((v) => v.status === 'unreplenished');
  const readyToReplenish = vouchers.filter(
    (v) => v.status === 'unreplenished' && !v.replenishmentId,
  ).length;
  return (
    <div style={{ marginTop: 12 }}>
      <div className="acct-toolbar">
        {canOperate && fundActive && (
          <button className="acct-btn acct-btn--primary" onClick={onRecord}>
            + Record voucher
          </button>
        )}
        {canOperate && (
          <button className="acct-btn" disabled={readyToReplenish === 0} onClick={onPrepare}>
            Prepare replenishment{readyToReplenish > 0 ? ` (${readyToReplenish})` : ''}
          </button>
        )}
        <label style={{ marginLeft: 'auto', fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          Show replenished / cancelled
        </label>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="acct-table">
          <thead>
            <tr>
              <th>PCV No.</th>
              <th>Date</th>
              <th>Payee</th>
              <th>Particulars</th>
              <th>Charge account</th>
              <th className="acct-text-right">Amount</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((v) => (
              <tr key={v.id}>
                <td className="acct-text-mono">{v.pcvNumber}</td>
                <td>{fmtDate(v.pcvDate)}</td>
                <td>{v.payeeName}</td>
                <td>{v.particulars}</td>
                <td>
                  <span className="acct-text-mono">{v.chargeAccount?.accountCode ?? '—'}</span>{' '}
                  {v.chargeAccount?.name ?? ''}
                </td>
                <td className="acct-text-right acct-text-mono">{peso(v.amount)}</td>
                <td>
                  <span className={`acct-badge acct-badge--${v.status}`}>{v.status}</span>
                </td>
                <td>
                  {canOperate && v.status === 'unreplenished' && !v.replenishmentId && (
                    <button
                      className="acct-btn acct-btn--sm acct-btn--danger"
                      disabled={busy}
                      onClick={() => onCancel(v.id)}
                    >
                      Cancel
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="acct-empty" style={{ border: 0 }}>
                  No vouchers to show.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
function ReplenishmentsTab({
  reps,
  canManage,
  onOpen,
}: {
  reps: PettyCashReplenishment[];
  canManage: boolean;
  onOpen: (id: string) => void;
}) {
  return (
    <div style={{ marginTop: 12, overflowX: 'auto' }}>
      <table className="acct-table">
        <thead>
          <tr>
            <th>Repl. No.</th>
            <th>Date</th>
            <th className="acct-text-right">Total</th>
            <th>Status</th>
            <th>DV</th>
            <th>Prepared by</th>
            <th>Posted by</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {reps.map((r) => (
            <tr key={r.id} className="acct-row--click" onClick={() => onOpen(r.id)}>
              <td className="acct-text-mono">{r.replNumber}</td>
              <td>{fmtDate(r.replDate)}</td>
              <td className="acct-text-right acct-text-mono">{peso(r.totalAmount)}</td>
              <td>
                <span className={`acct-badge acct-badge--${r.status}`}>{r.status}</span>
              </td>
              <td className="acct-text-mono">{r.dvNumber ?? '—'}</td>
              <td>{r.preparedName ?? '—'}</td>
              <td>{r.postedName ?? '—'}</td>
              <td>
                <button className="acct-btn acct-btn--sm" onClick={() => onOpen(r.id)}>
                  {r.status === 'draft' && canManage ? 'Review' : 'View'}
                </button>
              </td>
            </tr>
          ))}
          {reps.length === 0 && (
            <tr>
              <td colSpan={8} className="acct-empty" style={{ border: 0 }}>
                No replenishments yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
function VoucherFormModal({
  fund,
  onClose,
  onSaved,
}: {
  fund: PettyCashFund;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pcvDate, setPcvDate] = useState(today());
  const [payeeName, setPayeeName] = useState('');
  const [particulars, setParticulars] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit() {
    setErr('');
    const amt = parseFloat(amount);
    if (!payeeName.trim() || !particulars.trim() || !(amt > 0)) {
      setErr('Fill in payee, particulars, and a positive amount.');
      return;
    }
    setBusy(true);
    try {
      await createPettyCashVoucher({
        fundId: fund.id,
        pcvDate,
        payeeName: payeeName.trim(),
        particulars: particulars.trim(),
        amount: amt,
      });
      onSaved();
    } catch (e) {
      setErr(e instanceof AccountingApiError ? e.message : 'Failed to record voucher.');
      setBusy(false);
    }
  }

  return (
    <Modal title="Record petty cash voucher" onClose={onClose}>
      {err && <div className="acct-error">{err}</div>}
      <div style={{ fontSize: 12, color: '#667085', marginBottom: 10 }}>
        Cash on hand: <strong>{peso(fund.cashOnHand)}</strong>
      </div>
      <div className="acct-form">
        <div className="acct-form-row">
          <label className="acct-field">
            Date
            <input type="date" value={pcvDate} onChange={(e) => setPcvDate(e.target.value)} />
          </label>
          <label className="acct-field">
            Amount
            <input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </label>
        </div>
        <label className="acct-field">
          Payee
          <input value={payeeName} onChange={(e) => setPayeeName(e.target.value)} maxLength={160} />
        </label>
        <label className="acct-field">
          Particulars
          <input value={particulars} onChange={(e) => setParticulars(e.target.value)} />
        </label>
        <p style={{ fontSize: 12, color: '#667085', margin: 0 }}>
          The expense account is assigned by the accountant when the fund is replenished.
        </p>
      </div>
      <div className="acct-form-actions">
        <button className="acct-btn" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button className="acct-btn acct-btn--primary" onClick={submit} disabled={busy}>
          Record voucher
        </button>
      </div>
    </Modal>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
function FundFormModal({
  mode,
  fund,
  onClose,
  onSaved,
}: {
  mode: 'create' | 'edit';
  fund: PettyCashFund | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(fund?.name ?? 'Petty Cash Fund');
  const [imprest, setImprest] = useState(fund ? String(fund.imprestAmount) : '');
  const [pettyId, setPettyId] = useState(fund?.pettyCashAccountId ?? '');
  const [bankId, setBankId] = useState(fund?.cashInBankAccountId ?? '');
  const [cashAccounts, setCashAccounts] = useState<PostableAccount[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    getPostableAccounts()
      .then((all) => setCashAccounts(all.filter((a) => a.accountCode.startsWith('1-01'))))
      .catch(() => setCashAccounts([]));
  }, []);

  async function submit() {
    setErr('');
    const amt = parseFloat(imprest);
    if (!name.trim() || !(amt > 0) || !pettyId || !bankId) {
      setErr('Fill in a name, a positive imprest amount, and both accounts.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'create') {
        await createPettyCashFund({
          name: name.trim(),
          imprestAmount: amt,
          pettyCashAccountId: pettyId,
          cashInBankAccountId: bankId,
        });
      } else if (fund) {
        await updatePettyCashFund(fund.id, {
          name: name.trim(),
          imprestAmount: amt,
          pettyCashAccountId: pettyId,
          cashInBankAccountId: bankId,
        });
      }
      onSaved();
    } catch (e) {
      setErr(e instanceof AccountingApiError ? e.message : 'Failed to save fund.');
      setBusy(false);
    }
  }

  return (
    <Modal title={mode === 'create' ? 'Set up petty cash fund' : 'Edit petty cash fund'} onClose={onClose}>
      {err && <div className="acct-error">{err}</div>}
      <p style={{ fontSize: 12, color: '#667085', marginTop: 0 }}>
        No journal entry is posted here — the imprest fund is assumed already on the books. The JEV
        is recorded only when the fund is replenished.
      </p>
      <div className="acct-form">
        <label className="acct-field">
          Fund name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
        </label>
        <label className="acct-field">
          Imprest amount
          <input
            type="number"
            step="0.01"
            min="0"
            value={imprest}
            onChange={(e) => setImprest(e.target.value)}
            placeholder="0.00"
          />
        </label>
        <label className="acct-field">
          Petty Cash Fund account
          <select value={pettyId} onChange={(e) => setPettyId(e.target.value)}>
            <option value="">— select account —</option>
            {cashAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.accountCode} — {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="acct-field">
          Cash in Bank account (replenished from)
          <select value={bankId} onChange={(e) => setBankId(e.target.value)}>
            <option value="">— select account —</option>
            {cashAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.accountCode} — {a.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="acct-form-actions">
        <button className="acct-btn" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button className="acct-btn acct-btn--primary" onClick={submit} disabled={busy}>
          {mode === 'create' ? 'Create fund' : 'Save changes'}
        </button>
      </div>
    </Modal>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
function PrepareModal({
  fundId,
  vouchers,
  onClose,
  onPrepared,
}: {
  fundId: string;
  vouchers: PettyCashVoucher[];
  onClose: () => void;
  onPrepared: (id: string) => void;
}) {
  const [replDate, setReplDate] = useState(today());
  const [selected, setSelected] = useState<Set<string>>(new Set(vouchers.map((v) => v.id)));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const total = vouchers.filter((v) => selected.has(v.id)).reduce((s, v) => s + v.amount, 0);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit() {
    setErr('');
    if (selected.size === 0) {
      setErr('Select at least one voucher to replenish.');
      return;
    }
    setBusy(true);
    try {
      const rep = await preparePettyCashReplenishment({
        fundId,
        replDate,
        voucherIds: [...selected],
      });
      onPrepared(rep.id);
    } catch (e) {
      setErr(e instanceof AccountingApiError ? e.message : 'Failed to prepare replenishment.');
      setBusy(false);
    }
  }

  return (
    <Modal title="Prepare replenishment" onClose={onClose}>
      {err && <div className="acct-error">{err}</div>}
      <label className="acct-field" style={{ maxWidth: 220 }}>
        Replenishment date
        <input type="date" value={replDate} onChange={(e) => setReplDate(e.target.value)} />
      </label>
      <div style={{ overflowX: 'auto', marginTop: 10 }}>
        <table className="acct-table">
          <thead>
            <tr>
              <th></th>
              <th>PCV No.</th>
              <th>Payee</th>
              <th>Particulars</th>
              <th className="acct-text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {vouchers.map((v) => (
              <tr key={v.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={selected.has(v.id)}
                    onChange={() => toggle(v.id)}
                  />
                </td>
                <td className="acct-text-mono">{v.pcvNumber}</td>
                <td>{v.payeeName}</td>
                <td>{v.particulars}</td>
                <td className="acct-text-right acct-text-mono">{peso(v.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 700 }}>
              <td colSpan={4}>Total to replenish</td>
              <td className="acct-text-right acct-text-mono">{peso(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="acct-form-actions">
        <button className="acct-btn" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button className="acct-btn acct-btn--primary" onClick={submit} disabled={busy}>
          Prepare
        </button>
      </div>
    </Modal>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
function ReviewModal({
  id,
  canManage,
  canOperate,
  expenseAccounts,
  onClose,
  onChanged,
}: {
  id: string;
  canManage: boolean;
  canOperate: boolean;
  expenseAccounts: PettyCashAccountRef[];
  onClose: () => void;
  onChanged: (msg: string) => void;
}) {
  const [rep, setRep] = useState<PettyCashReplenishmentDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const reload = useCallback(
    () =>
      getPettyCashReplenishment(id)
        .then(setRep)
        .catch((e) => setErr(e instanceof AccountingApiError ? e.message : 'Failed to load.')),
    [id],
  );
  useEffect(() => {
    reload();
  }, [reload]);

  async function assign(voucherId: string, accountId: string) {
    if (!accountId) return;
    setErr('');
    try {
      await setPettyCashVoucherChargeAccount(voucherId, accountId);
      await reload();
    } catch (e) {
      setErr(e instanceof AccountingApiError ? e.message : 'Failed to assign account.');
    }
  }

  async function run(fn: () => Promise<unknown>, msg: string) {
    setBusy(true);
    setErr('');
    try {
      await fn();
      onChanged(msg);
    } catch (e) {
      setErr(e instanceof AccountingApiError ? e.message : 'Action failed.');
      setBusy(false);
    }
  }

  const totalDr = rep?.jeLines.reduce((s, l) => s + l.debit, 0) ?? 0;
  const totalCr = rep?.jeLines.reduce((s, l) => s + l.credit, 0) ?? 0;

  return (
    <Modal title={rep ? `Replenishment ${rep.replNumber}` : 'Replenishment'} onClose={onClose}>
      {err && <div className="acct-error">{err}</div>}
      {!rep && <div className="acct-empty">Loading…</div>}
      {rep && (
        <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', fontSize: 13 }}>
            <span className={`acct-badge acct-badge--${rep.status}`}>{rep.status}</span>
            <span>{fmtDate(rep.replDate)}</span>
            {rep.dvNumber && (
              <span>
                DV: <span className="acct-text-mono">{rep.dvNumber}</span>
              </span>
            )}
            {rep.jevNumber && (
              <span>
                JEV: <span className="acct-text-mono">{rep.jevNumber}</span>
              </span>
            )}
            <span style={{ marginLeft: 'auto' }}>
              Total: <strong>{peso(rep.totalAmount)}</strong>
            </span>
          </div>

          {rep.dvId && rep.status !== 'posted' && (
            <div className="acct-note" style={{ marginTop: 12 }}>
              A draft disbursement voucher{' '}
              <Link to={`/accounting/disbursements/${rep.dvId}`} className="acct-text-mono">
                {rep.dvNumber}
              </Link>{' '}
              was raised for this replenishment. Process it on the Disbursement Vouchers page —
              posting it records the journal entry and restores the fund.
            </div>
          )}

          <h3 style={{ fontSize: 14, margin: '14px 0 6px' }}>
            {rep.status === 'posted'
              ? 'Journal entry'
              : 'Proposed journal entry (recorded on the DV when approved)'}
          </h3>
          <table className="acct-table">
            <thead>
              <tr>
                <th>Account</th>
                <th className="acct-text-right">Debit</th>
                <th className="acct-text-right">Credit</th>
              </tr>
            </thead>
            <tbody>
              {rep.jeLines.map((l, i) => (
                <tr key={i}>
                  <td>
                    <span className="acct-text-mono">{l.account?.accountCode ?? '—'}</span>{' '}
                    {l.account?.name ?? ''}
                  </td>
                  <td className="acct-text-right acct-text-mono">{l.debit ? peso(l.debit) : ''}</td>
                  <td className="acct-text-right acct-text-mono">{l.credit ? peso(l.credit) : ''}</td>
                </tr>
              ))}
              <tr style={{ fontWeight: 700, borderTop: '2px solid var(--mswd-navy, #0b3a67)' }}>
                <td>Total</td>
                <td className="acct-text-right acct-text-mono">{peso(totalDr)}</td>
                <td className="acct-text-right acct-text-mono">{peso(totalCr)}</td>
              </tr>
            </tbody>
          </table>

          <h3 style={{ fontSize: 14, margin: '14px 0 6px' }}>Vouchers ({rep.vouchers.length})</h3>
          {rep.status === 'draft' && canManage && (
            <p style={{ fontSize: 12, color: '#667085', margin: '0 0 6px' }}>
              Assign an expense account to each voucher, then approve to raise the reimbursement
              disbursement voucher.
            </p>
          )}
          <div style={{ overflowX: 'auto' }}>
            <table className="acct-table">
              <thead>
                <tr>
                  <th>PCV No.</th>
                  <th>Payee</th>
                  <th>Particulars</th>
                  <th className="acct-text-right">Amount</th>
                  <th>Charge (expense) account</th>
                </tr>
              </thead>
              <tbody>
                {rep.vouchers.map((v) => (
                  <tr key={v.id}>
                    <td className="acct-text-mono">{v.pcvNumber}</td>
                    <td>{v.payeeName}</td>
                    <td>{v.particulars}</td>
                    <td className="acct-text-right acct-text-mono">{peso(v.amount)}</td>
                    <td>
                      {rep.status === 'draft' && canManage ? (
                        <select
                          value={v.chargeAccountId ?? ''}
                          disabled={busy}
                          onChange={(e) => assign(v.id, e.target.value)}
                          style={{ maxWidth: 260 }}
                        >
                          <option value="">— select account —</option>
                          {expenseAccounts.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.accountCode} — {a.name}
                            </option>
                          ))}
                        </select>
                      ) : v.chargeAccount ? (
                        <>
                          <span className="acct-text-mono">{v.chargeAccount.accountCode}</span>{' '}
                          {v.chargeAccount.name}
                        </>
                      ) : (
                        <span style={{ color: '#b42318' }}>unassigned</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {rep.status === 'draft' && (
            <div className="acct-form-actions" style={{ marginTop: 14, alignItems: 'center' }}>
              {(canOperate || canManage) && (
                <button
                  className="acct-btn acct-btn--danger"
                  disabled={busy}
                  onClick={() =>
                    run(() => cancelPettyCashReplenishment(rep.id), 'Replenishment cancelled — vouchers released.')
                  }
                >
                  Cancel replenishment
                </button>
              )}
              {canManage && rep.unassignedCount > 0 && (
                <span style={{ fontSize: 12, color: '#b42318' }}>
                  {rep.unassignedCount} voucher(s) still need an expense account.
                </span>
              )}
              {canManage && (
                <button
                  className="acct-btn acct-btn--primary"
                  disabled={busy || rep.unassignedCount > 0}
                  onClick={() =>
                    run(
                      () => approvePettyCashReplenishment(rep.id),
                      `Replenishment ${rep.replNumber} approved — a draft disbursement voucher was raised. Post it to record the JEV.`,
                    )
                  }
                >
                  Approve &amp; create DV
                </button>
              )}
              {!canManage && (
                <span style={{ fontSize: 12, color: '#667085', alignSelf: 'center' }}>
                  Awaiting the accountant to review &amp; approve.
                </span>
              )}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
