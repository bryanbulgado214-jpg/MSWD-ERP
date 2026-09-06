import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { useAuth } from '../../../app/auth';
import { AccountingApiError, getSupplierInvoice } from '../api';
import type { SupplierInvoiceDetail } from '../types';

import { AccountingSubNav } from './AccountingSubNav';
import './accounting.css';

function formatPeso(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return num.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
}

const STATUS_LABELS: Record<string, string> = {
  unpaid: 'Unpaid',
  partially_paid: 'Partially Paid',
  paid: 'Paid',
  cancelled: 'Cancelled',
};

const SCHEDULE_STATUS: Record<string, { label: string; bg: string; fg: string }> = {
  paid: { label: 'Paid', bg: '#e6f4ea', fg: '#12805c' },
  partially_paid: { label: 'Partially Paid', bg: '#fef7e6', fg: '#b54708' },
  due: { label: 'Due', bg: '#eff4ff', fg: '#175cd3' },
  past_due: { label: 'Past Due', bg: '#fdecec', fg: '#b42318' },
};

function ScheduleStatusChip({ status }: { status: string }) {
  const s = SCHEDULE_STATUS[status] ?? { label: status, bg: '#eef0f3', fg: '#475467' };
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 12,
        fontSize: 12,
        fontWeight: 600,
        background: s.bg,
        color: s.fg,
      }}
    >
      {s.label}
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        style={{ fontSize: 11, textTransform: 'uppercase', color: '#98a2b3', letterSpacing: 0.4 }}
      >
        {label}
      </div>
      <div style={{ fontSize: 14, marginTop: 2 }}>{children}</div>
    </div>
  );
}

export default function SupplierInvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { permissions } = useAuth();
  const canPay = permissions.has('accounting.dv.create');
  const [inv, setInv] = useState<SupplierInvoiceDetail | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setInv(await getSupplierInvoice(id));
    } catch (e) {
      setError(e instanceof AccountingApiError ? e.message : 'Failed to load the invoice.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading)
    return (
      <div className="acct-page">
        <AccountingSubNav />
        <div className="acct-empty">Loading…</div>
      </div>
    );
  if (!inv)
    return (
      <div className="acct-page">
        <AccountingSubNav />
        <div className="acct-error">{error || 'Invoice not found.'}</div>
      </div>
    );

  const je = inv.journalEntry;
  const balance = Number(inv.balance);

  return (
    <div className="acct-page">
      <AccountingSubNav />
      <div style={{ marginBottom: 16 }}>
        <Link
          to="/accounting/supplier-invoices"
          style={{ color: 'var(--mswd-blue)', textDecoration: 'none', fontSize: 13 }}
        >
          &larr; Back to Supplier's Invoices
        </Link>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <h1 style={{ margin: 0 }}>{inv.invoiceNumber}</h1>
        <span className="acct-badge">{STATUS_LABELS[inv.status] ?? inv.status}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14 }}>
          {je && (
            <Link
              to={`/accounting/jev/${je.id}`}
              style={{ color: 'var(--mswd-blue)', textDecoration: 'none', fontSize: 13 }}
              title="The posted payable journal entry"
            >
              {je.jevNumber} &rarr;
            </Link>
          )}
          {canPay && balance > 0.01 && (
            <button
              type="button"
              className="acct-btn acct-btn--primary"
              onClick={() => navigate(`/accounting/disbursements/new?supplierInvoiceId=${inv.id}`)}
              title="Pay this invoice — records a disbursement voucher and raises a check"
            >
              Record Payment
            </button>
          )}
        </div>
      </div>

      {error && <div className="acct-error">{error}</div>}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 16,
          background: '#f8fafc',
          border: '1px solid #eaecf0',
          borderRadius: 8,
          padding: 16,
          marginBottom: 20,
        }}
      >
        <Field label="Supplier">{inv.supplierName}</Field>
        <Field label="Supplier TIN">{inv.supplierTin || '—'}</Field>
        <Field label="Invoice Date">{new Date(inv.invoiceDate).toLocaleDateString('en-PH')}</Field>
        <Field label="Term">{inv.term || '—'}</Field>
        <Field label="Gross">{formatPeso(inv.grossAmount)}</Field>
        <Field label="Tax Withheld">{formatPeso(inv.taxAmount)}</Field>
        <Field label="Net Payable">
          <strong>{formatPeso(inv.netAmount)}</strong>
        </Field>
        <Field label="Amount Paid">{formatPeso(inv.amountPaid)}</Field>
        <Field label="Balance">
          <strong style={{ color: balance > 0.01 ? '#b42318' : '#12805c' }}>
            {formatPeso(inv.balance)}
          </strong>
        </Field>
        {inv.supplierAddress && <Field label="Address">{inv.supplierAddress}</Field>}
      </div>

      <div style={{ marginBottom: 20 }}>
        <Field label="Particulars">{inv.particulars}</Field>
      </div>

      <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--mswd-navy)', margin: '0 0 8px' }}>
        Journal Entry {je ? `(${je.jevNumber})` : ''}
      </h3>
      <div style={{ overflowX: 'auto', marginBottom: 24 }}>
        <table className="acct-table">
          <thead>
            <tr>
              <th>Account</th>
              <th>Description</th>
              <th className="acct-text-right">Debit</th>
              <th className="acct-text-right">Credit</th>
            </tr>
          </thead>
          <tbody>
            {(je?.lines ?? []).map((l, i) => (
              <tr key={i}>
                <td>
                  <span className="acct-text-mono">{l.accountCode}</span> {l.accountName}
                </td>
                <td>{l.description || '—'}</td>
                <td className="acct-text-right acct-text-mono">
                  {Number(l.debitAmount) > 0 ? formatPeso(l.debitAmount) : ''}
                </td>
                <td className="acct-text-right acct-text-mono">
                  {Number(l.creditAmount) > 0 ? formatPeso(l.creditAmount) : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--mswd-navy)', margin: '0 0 8px' }}>
        Payments
      </h3>
      {inv.payments.length === 0 ? (
        <p style={{ color: '#667085', fontSize: 13, margin: '0 0 24px' }}>
          No payments recorded yet.{' '}
          {canPay && balance > 0.01 && 'Use “Record Payment” above to pay this invoice.'}
        </p>
      ) : (
        <div style={{ overflowX: 'auto', marginBottom: 24 }}>
          <table className="acct-table">
            <thead>
              <tr>
                <th>DV #</th>
                <th>Date</th>
                {inv.schedule.length > 1 && <th>For</th>}
                <th>Check</th>
                <th className="acct-text-right">Applied to A/P</th>
                <th className="acct-text-right">Tax Withheld</th>
                <th className="acct-text-right">Cash Paid</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {inv.payments.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link
                      to={`/accounting/disbursements/${p.id}`}
                      className="acct-table__link acct-text-mono"
                    >
                      {p.dvNumber}
                    </Link>
                  </td>
                  <td>{new Date(p.dvDate).toLocaleDateString('en-PH')}</td>
                  {inv.schedule.length > 1 && (
                    <td>{p.installment ? `Installment ${p.installment}` : '—'}</td>
                  )}
                  <td className="acct-text-mono">{p.checkNumber || '—'}</td>
                  <td className="acct-text-right acct-text-mono">{formatPeso(p.applied)}</td>
                  <td className="acct-text-right acct-text-mono">
                    {Number(p.taxWithheld) > 0 ? formatPeso(p.taxWithheld) : '—'}
                  </td>
                  <td className="acct-text-right acct-text-mono">{formatPeso(p.cashPaid)}</td>
                  <td>
                    <span className="acct-badge">{p.checkStatus ?? p.dvStatus}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {inv.schedule.length > 0 && (
        <>
          <h3
            style={{ fontSize: 14, fontWeight: 700, color: 'var(--mswd-navy)', margin: '0 0 8px' }}
          >
            Payment Schedule
          </h3>
          <div style={{ overflowX: 'auto', maxWidth: 640 }}>
            <table className="acct-table">
              <thead>
                <tr>
                  {inv.schedule.length > 1 && <th>Installment</th>}
                  <th>Due Date</th>
                  <th className="acct-text-right">Amount</th>
                  <th className="acct-text-right">Paid</th>
                  <th className="acct-text-right">Balance</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {inv.schedule.map((d) => (
                  <tr key={d.installment}>
                    {inv.schedule.length > 1 && <td>{d.installment}</td>}
                    <td>{new Date(d.dueDate).toLocaleDateString('en-PH')}</td>
                    <td className="acct-text-right acct-text-mono">{formatPeso(d.amount)}</td>
                    <td className="acct-text-right acct-text-mono">
                      {Number(d.paid) > 0 ? formatPeso(d.paid) : '—'}
                    </td>
                    <td className="acct-text-right acct-text-mono">{formatPeso(d.balance)}</td>
                    <td>
                      <ScheduleStatusChip status={d.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
