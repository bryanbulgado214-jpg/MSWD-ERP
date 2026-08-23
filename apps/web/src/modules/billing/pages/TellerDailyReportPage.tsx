import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { GovLetterhead } from '../../../app/GovLetterhead';
import { getTellerSession } from '../api';
import type { TellerSessionDetail } from '../types';
import './print-billing.css';

function peso(v: string | number) {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  if (isNaN(n)) return '—';
  return n.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
}

const METHOD: Record<string, string> = {
  cash: 'Cash',
  check: 'Check',
  online: 'Online',
  bank_deposit: 'Bank Deposit',
};

export default function TellerDailyReportPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<TellerSessionDetail | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    getTellerSession(id)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load.'));
  }, [id]);

  if (error) return <div style={{ padding: 32, color: '#b42318' }}>{error}</div>;
  if (!data) return <div style={{ padding: 32, color: '#667085' }}>Loading…</div>;

  const { session: s, live, tellerName, cashierName, payments } = data;
  const so = parseFloat(s.shortageOverage);

  return (
    <div className="bill-print-page">
      <div className="bill-print-controls">
        <button type="button" onClick={() => window.print()}>
          Print
        </button>
        <button type="button" onClick={() => navigate(-1)}>
          Back
        </button>
      </div>

      <div className="bill-print-sheet">
        <div className="bill-print-header">
          <GovLetterhead
            entityClass="bill-print-header__entity"
            subClass="bill-print-header__sub"
          />
          <p className="bill-print-header__title">Teller&apos;s Daily Collection Report</p>
        </div>

        <hr className="bill-print-divider" />

        <div className="bill-print-info">
          <div className="bill-print-info__group">
            <span className="bill-print-info__label">Session No:</span>
            <span>{s.sessionNumber}</span>
          </div>
          <div className="bill-print-info__group">
            <span className="bill-print-info__label">Date:</span>
            <span>
              {new Date(s.collectionDate).toLocaleDateString('en-PH', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </span>
          </div>
        </div>
        <div className="bill-print-info">
          <div className="bill-print-info__group">
            <span className="bill-print-info__label">Teller:</span>
            <span>{tellerName}</span>
          </div>
          <div className="bill-print-info__group">
            <span className="bill-print-info__label">OR Range:</span>
            <span>
              {live.beginningOrNumber
                ? `${live.beginningOrNumber} – ${live.endingOrNumber ?? ''}`
                : '—'}
            </span>
          </div>
        </div>

        {/* Collection by tender */}
        <table className="bill-print-table" style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th>Collection Summary</th>
              <th style={{ textAlign: 'right' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Cash</td>
              <td className="bp-right">{peso(live.cashAmount)}</td>
            </tr>
            <tr>
              <td>Check</td>
              <td className="bp-right">{peso(live.checkAmount)}</td>
            </tr>
            <tr>
              <td>Electronic (online / bank)</td>
              <td className="bp-right">{peso(live.electronicAmount)}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td style={{ fontWeight: 700 }}>
                TOTAL COLLECTIONS ({live.transactionCount} receipt
                {live.transactionCount === 1 ? '' : 's'})
              </td>
              <td className="bp-right" style={{ fontWeight: 700 }}>
                {peso(live.totalCollections)}
              </td>
            </tr>
          </tfoot>
        </table>

        {/* Receipts */}
        <table className="bill-print-table" style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th>OR No.</th>
              <th>Payer</th>
              <th>Method</th>
              <th style={{ textAlign: 'right' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {payments.length === 0 ? (
              <tr>
                <td colSpan={4} className="bp-center">
                  No receipts.
                </td>
              </tr>
            ) : (
              payments.map((p) => {
                const payer = p.consumer
                  ? `${p.consumer.lastName}, ${p.consumer.firstName}`
                  : (p.payerName ?? 'Walk-in');
                return (
                  <tr key={p.id} style={p.status === 'voided' ? { opacity: 0.5 } : undefined}>
                    <td className="bp-center">{p.orNumber}</td>
                    <td>{payer}</td>
                    <td>{METHOD[p.paymentMethod] ?? p.paymentMethod}</td>
                    <td className="bp-right">
                      {p.status === 'voided' ? 'VOID' : peso(p.totalAmount)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* Remittance */}
        <table className="bill-print-table" style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th>Remittance</th>
              <th style={{ textAlign: 'right' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Expected (cash + checks)</td>
              <td className="bp-right">{peso(s.expectedRemittance)}</td>
            </tr>
            <tr>
              <td>Actual cash remitted</td>
              <td className="bp-right">{peso(s.actualCashRemitted)}</td>
            </tr>
            <tr>
              <td>Actual checks remitted</td>
              <td className="bp-right">{peso(s.actualChecksRemitted)}</td>
            </tr>
            <tr>
              <td style={{ fontWeight: 700 }}>Total remitted</td>
              <td className="bp-right" style={{ fontWeight: 700 }}>
                {peso(s.totalActualRemittance)}
              </td>
            </tr>
            <tr>
              <td style={{ fontWeight: 700 }}>
                {so > 0 ? 'Overage' : so < 0 ? 'Shortage' : 'Shortage / Overage'}
              </td>
              <td className="bp-right" style={{ fontWeight: 700 }}>
                {peso(Math.abs(so))}
              </td>
            </tr>
          </tbody>
        </table>

        <div className="bill-print-sig">
          <div className="bill-print-sig__col">
            <p style={{ fontSize: '10pt', marginBottom: 4 }}>Prepared / Remitted by:</p>
            <div className="bill-print-sig__line"></div>
            <div className="bill-print-sig__name">{tellerName}</div>
            <div className="bill-print-sig__title">Teller</div>
          </div>
          <div className="bill-print-sig__col">
            <p style={{ fontSize: '10pt', marginBottom: 4 }}>Received by:</p>
            <div className="bill-print-sig__line"></div>
            <div className="bill-print-sig__name">{cashierName}</div>
            <div className="bill-print-sig__title">Cashier</div>
          </div>
        </div>

        <div className="bill-print-footer">
          Status: {s.status.toUpperCase()} · This is a computer-generated report.
        </div>
      </div>
    </div>
  );
}
