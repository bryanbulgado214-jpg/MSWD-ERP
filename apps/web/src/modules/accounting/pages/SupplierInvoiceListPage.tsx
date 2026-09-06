import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../../../app/auth';
import { AccountingApiError, getSupplierInvoices } from '../api';
import { matchesQuery } from '../search';
import type { SupplierInvoiceSummary } from '../types';

import { AccountingSubNav } from './AccountingSubNav';
import './accounting.css';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: SupplierInvoiceSummary[] };

function formatPeso(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return num.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
}

const STATUS_LABELS: Record<string, string> = {
  unpaid: 'Unpaid',
  partial: 'Partially Paid',
  paid: 'Paid',
};

/** Earliest still-upcoming (or any) due date from the payment schedule. */
function nextDue(inv: SupplierInvoiceSummary): string | null {
  if (!inv.dueSchedule || inv.dueSchedule.length === 0) return null;
  const dates = inv.dueSchedule.map((d) => d.dueDate).sort();
  const todayStr = new Date().toISOString().slice(0, 10);
  return dates.find((d) => d >= todayStr) ?? dates[dates.length - 1] ?? null;
}

export default function SupplierInvoiceListPage() {
  const { permissions } = useAuth();
  const navigate = useNavigate();
  const canCreate = permissions.has('accounting.jev.create');
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await getSupplierInvoices();
      setState({ status: 'loaded', data });
    } catch (e) {
      setState({
        status: 'error',
        message: e instanceof AccountingApiError ? e.message : 'Failed to load supplier invoices.',
      });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function matches(inv: SupplierInvoiceSummary): boolean {
    return matchesQuery(
      [inv.invoiceNumber, inv.supplierName, inv.particulars, inv.term ?? ''].join(' '),
      search,
    );
  }

  return (
    <div className="acct-page">
      <AccountingSubNav />
      <h1>Supplier's Invoices</h1>
      <p style={{ color: '#667085', fontSize: 13, marginTop: -6, marginBottom: 18, maxWidth: 720 }}>
        Bills received from suppliers. Recording an invoice posts the payable to the ledger (Dr
        charges / Cr Accounts Payable). Payment is made later from this module.
      </p>

      <div className="acct-toolbar">
        <input
          type="search"
          placeholder="Search invoice #, supplier, particulars, or term…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ minWidth: 260, flex: '1 1 260px' }}
          aria-label="Search supplier invoices"
        />
        {canCreate && (
          <button
            type="button"
            className="acct-btn acct-btn--primary"
            onClick={() => navigate('/accounting/supplier-invoices/new')}
          >
            + New Supplier's Invoice
          </button>
        )}
      </div>

      {state.status === 'loading' && <div className="acct-empty">Loading supplier invoices…</div>}
      {state.status === 'error' && <div className="acct-error">{state.message}</div>}
      {state.status === 'loaded' && state.data.length === 0 && (
        <div className="acct-empty">No supplier invoices yet.</div>
      )}
      {state.status === 'loaded' && state.data.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="acct-table">
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Supplier</th>
                <th>Invoice Date</th>
                <th>Term</th>
                <th>Net Amount</th>
                <th>Next Due</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {state.data.filter(matches).map((inv) => {
                const nd = nextDue(inv);
                return (
                  <tr
                    key={inv.id}
                    className="acct-row--click"
                    onClick={() => navigate(`/accounting/supplier-invoices/${inv.id}`)}
                  >
                    <td className="acct-text-mono">{inv.invoiceNumber}</td>
                    <td>{inv.supplierName}</td>
                    <td>{new Date(inv.invoiceDate).toLocaleDateString('en-PH')}</td>
                    <td>{inv.term || '—'}</td>
                    <td className="acct-text-right acct-text-mono">{formatPeso(inv.netAmount)}</td>
                    <td>{nd ? new Date(nd).toLocaleDateString('en-PH') : '—'}</td>
                    <td>
                      <span className="acct-badge">{STATUS_LABELS[inv.status] ?? inv.status}</span>
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
