import { useEffect, useState } from 'react';

import {
  getSupplyLedgerCard,
  getSupplyLedgerItems,
  getSupplyLedgerReconciliation,
  InventoryApiError,
} from '../../inventory/api';
import type {
  SupplyLedgerCard,
  SupplyLedgerItem,
  SupplyLedgerReconciliation,
} from '../../inventory/types';

import { AccountingSubNav } from './AccountingSubNav';
import './accounting.css';

const peso = (n: number) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(n);

export default function SupplyLedgerCardPage() {
  const [items, setItems] = useState<SupplyLedgerItem[]>([]);
  const [itemId, setItemId] = useState('');
  const [card, setCard] = useState<SupplyLedgerCard | null>(null);
  const [recon, setRecon] = useState<SupplyLedgerReconciliation | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([getSupplyLedgerItems(), getSupplyLedgerReconciliation()])
      .then(([its, rec]) => {
        setItems(its);
        setRecon(rec);
        if (its.length && !itemId) setItemId(its[0]!.id);
      })
      .catch((e) => setError(e instanceof InventoryApiError ? e.message : 'Failed to load.'));
  }, []);

  useEffect(() => {
    if (!itemId) return;
    getSupplyLedgerCard(itemId)
      .then(setCard)
      .catch((e) => setError(e instanceof InventoryApiError ? e.message : 'Failed to load card.'));
  }, [itemId]);

  return (
    <div className="acct-page">
      <AccountingSubNav />
      <h1>Supplies Ledger Card</h1>
      <p style={{ color: '#667085', fontSize: 13, marginTop: -6, marginBottom: 16, maxWidth: 820 }}>
        The accounting subsidiary ledger for inventory, valued in pesos and kept by the accountant.
        It mirrors the perpetual (FIFO) movements the Supply unit records on the Stock Card, and its
        control totals should reconcile to the GL Inventory account below.
      </p>

      {error && <div className="acct-error">{error}</div>}

      {recon && recon.rows.length > 0 && (
        <div style={{ marginBottom: 22, overflowX: 'auto' }}>
          <h2 style={{ fontSize: 15, margin: '0 0 8px' }}>Reconciliation to GL</h2>
          <table className="acct-table">
            <thead>
              <tr>
                <th>Inventory account</th>
                <th className="acct-text-right">Ledger (SLC)</th>
                <th className="acct-text-right">GL balance</th>
                <th className="acct-text-right">Variance</th>
              </tr>
            </thead>
            <tbody>
              {recon.rows.map((r) => (
                <tr key={r.accountCode}>
                  <td>
                    <span className="acct-text-mono">{r.accountCode}</span> — {r.accountName}
                  </td>
                  <td className="acct-text-right acct-text-mono">{peso(r.slcBalance)}</td>
                  <td className="acct-text-right acct-text-mono">{peso(r.glBalance)}</td>
                  <td
                    className="acct-text-right acct-text-mono"
                    style={{ color: Math.abs(r.variance) > 0.005 ? '#b42318' : '#027a48' }}
                  >
                    {peso(r.variance)}
                  </td>
                </tr>
              ))}
              <tr style={{ fontWeight: 700 }}>
                <td>Total</td>
                <td className="acct-text-right acct-text-mono">{peso(recon.totals.slcBalance)}</td>
                <td className="acct-text-right acct-text-mono">{peso(recon.totals.glBalance)}</td>
                <td
                  className="acct-text-right acct-text-mono"
                  style={{ color: Math.abs(recon.totals.variance) > 0.005 ? '#b42318' : '#027a48' }}
                >
                  {peso(recon.totals.variance)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginBottom: 14, maxWidth: 520 }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
          Item
        </label>
        <select
          value={itemId}
          onChange={(e) => setItemId(e.target.value)}
          style={{
            width: '100%',
            padding: '8px 10px',
            border: '1px solid #d0d5dd',
            borderRadius: 6,
          }}
        >
          {items.length === 0 && <option value="">No items</option>}
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.itemCode} — {i.description} ({i.balanceQuantity} {i.unitOfMeasure} ·{' '}
              {peso(i.balanceAmount)})
            </option>
          ))}
        </select>
      </div>

      {card && (
        <div style={{ overflowX: 'auto' }}>
          <table className="acct-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Reference</th>
                <th>Type</th>
                <th className="acct-text-right">Received</th>
                <th className="acct-text-right">Issued</th>
                <th className="acct-text-right">Balance qty</th>
                <th className="acct-text-right">Balance amount</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ color: '#667085' }}>
                <td colSpan={5}>Opening balance</td>
                <td className="acct-text-right acct-text-mono">{card.opening.quantity}</td>
                <td className="acct-text-right acct-text-mono">{peso(card.opening.amount)}</td>
              </tr>
              {card.rows.map((r, i) => (
                <tr key={i}>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {new Date(r.entryDate).toLocaleDateString()}
                  </td>
                  <td>{r.reference ?? '—'}</td>
                  <td>{r.entryType.replace('_', ' ')}</td>
                  <td className="acct-text-right acct-text-mono">
                    {r.receiptQuantity != null
                      ? `${r.receiptQuantity} / ${peso(r.receiptAmount ?? 0)}`
                      : '—'}
                  </td>
                  <td className="acct-text-right acct-text-mono">
                    {r.issueQuantity != null
                      ? `${r.issueQuantity} / ${peso(r.issueAmount ?? 0)}`
                      : '—'}
                  </td>
                  <td className="acct-text-right acct-text-mono">{r.balanceQuantity}</td>
                  <td className="acct-text-right acct-text-mono">{peso(r.balanceAmount)}</td>
                </tr>
              ))}
              {card.rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="acct-empty">
                    No movements recorded.
                  </td>
                </tr>
              )}
              <tr style={{ fontWeight: 700 }}>
                <td colSpan={5}>Closing balance</td>
                <td className="acct-text-right acct-text-mono">{card.closing.quantity}</td>
                <td className="acct-text-right acct-text-mono">{peso(card.closing.amount)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
