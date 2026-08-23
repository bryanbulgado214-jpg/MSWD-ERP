import { useEffect, useState } from 'react';

import { AccountingApiError, getCollectionReconciliation } from '../api';
import type { CollectionReconciliation, ReconCard } from '../types';

import { AccountingSubNav } from './AccountingSubNav';
import './accounting.css';

function formatPeso(value: number): string {
  return (value || 0).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
}

function Recon({
  title,
  leftLabel,
  rightLabel,
  card,
}: {
  title: string;
  leftLabel: string;
  rightLabel: string;
  card: ReconCard;
}) {
  return (
    <div
      className="acct-stat"
      style={{
        borderLeft: `4px solid ${card.balanced ? '#067647' : '#b42318'}`,
        minWidth: 280,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: 700 }}>{title}</div>
        <span
          className={`acct-badge acct-badge--${card.balanced ? 'posted' : 'rejected'}`}
          style={{ fontSize: 11 }}
        >
          {card.balanced ? 'BALANCED' : `DIFFERENCE ${formatPeso(card.difference)}`}
        </span>
      </div>
      <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr auto', gap: 4 }}>
        <span style={{ color: '#475467' }}>{leftLabel}</span>
        <span className="acct-mono">{formatPeso(card.left)}</span>
        <span style={{ color: '#475467' }}>{rightLabel}</span>
        <span className="acct-mono">{formatPeso(card.right)}</span>
        {card.undeposited !== undefined && (
          <>
            <span style={{ color: '#475467' }}>Undeposited</span>
            <span
              className="acct-mono"
              style={{ color: card.undeposited > 0.005 ? '#b54708' : '#067647' }}
            >
              {formatPeso(card.undeposited)}
            </span>
          </>
        )}
      </div>
      {card.note && <div style={{ marginTop: 8, fontSize: 12, color: '#667085' }}>{card.note}</div>}
    </div>
  );
}

export default function CollectionReconciliationPage({ embedded = false }: { embedded?: boolean }) {
  const [data, setData] = useState<CollectionReconciliation | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getCollectionReconciliation()
      .then(setData)
      .catch((e) =>
        setError(e instanceof AccountingApiError ? e.message : 'Failed to load reconciliation.'),
      );
  }, []);

  const inner = (
    <>
      <p className="acct-page__intro">
        Proves — as of now — that the receivable subledger ties to GL Accounts Receivable, that
        physical collections are fully deposited, and that the collecting officer&apos;s cash
        accountability agrees with the ledger.
      </p>

      {error && <div className="acct-error">{error}</div>}
      {!data && !error && <p>Loading…</p>}

      {data && (
        <div
          className="acct-stats"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}
        >
          <Recon
            title="AR Subledger vs GL"
            leftLabel="AR subledger (bill balances)"
            rightLabel="GL Accounts Receivable"
            card={data.arSubledgerVsGl}
          />
          <Recon
            title="Collections vs Deposits"
            leftLabel="Physical collections (posted)"
            rightLabel="Deposited to bank"
            card={data.collectionsVsDeposits}
          />
          <Recon
            title="Cash in Custody"
            leftLabel="Posted collections − deposits"
            rightLabel="GL Cash - Collecting Officer"
            card={data.cashInCustody}
          />
        </div>
      )}
    </>
  );
  if (embedded) return inner;
  return (
    <div className="acct-page">
      <AccountingSubNav />
      <h1>Collections Reconciliation</h1>
      {inner}
    </div>
  );
}
