import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

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
  partial: 'Partially Paid',
  paid: 'Paid',
};

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
        {je && (
          <Link
            to={`/accounting/jev/${je.id}`}
            style={{
              color: 'var(--mswd-blue)',
              textDecoration: 'none',
              fontSize: 13,
              marginLeft: 'auto',
            }}
            title="The posted payable journal entry"
          >
            {je.jevNumber} &rarr;
          </Link>
        )}
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

      {inv.dueSchedule.length > 0 && (
        <>
          <h3
            style={{ fontSize: 14, fontWeight: 700, color: 'var(--mswd-navy)', margin: '0 0 8px' }}
          >
            Payment Schedule
          </h3>
          <div style={{ overflowX: 'auto', maxWidth: 420 }}>
            <table className="acct-table">
              <thead>
                <tr>
                  <th>Due Date</th>
                  <th className="acct-text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {inv.dueSchedule.map((d, i) => (
                  <tr key={i}>
                    <td>{new Date(d.dueDate).toLocaleDateString('en-PH')}</td>
                    <td className="acct-text-right acct-text-mono">{formatPeso(d.amount)}</td>
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
