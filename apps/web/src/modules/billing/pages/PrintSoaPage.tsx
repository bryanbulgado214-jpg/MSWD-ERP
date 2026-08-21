import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { GovLetterhead } from '../../../app/GovLetterhead';
import { getConsumerLedger } from '../api';
import './print-billing.css';

function formatPeso(val: string | number) {
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(num)) return '—';
  return num.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
}

export default function PrintSoaPage() {
  const [searchParams] = useSearchParams();
  const consumerId = searchParams.get('consumerId');
  const navigate = useNavigate();
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!consumerId) {
      setError('No consumer specified.');
      return;
    }
    getConsumerLedger(consumerId)
      .then((d) => setData(d as Record<string, unknown>))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load.'));
  }, [consumerId]);

  if (error) return <div style={{ padding: 32, color: '#b42318' }}>{error}</div>;
  if (!data) return <div style={{ padding: 32, color: '#667085' }}>Loading...</div>;

  const d = data as {
    consumer: {
      accountNumber: string;
      firstName: string;
      middleName?: string;
      lastName: string;
      address: string;
      barangay?: string;
      consumerType: string;
      status: string;
    };
    totalBilled: number;
    totalPaid: number;
    balance: number;
    ledger: Array<{
      date: string;
      reference: string;
      particulars: string;
      charges: number;
      payments: number;
      balance: number;
    }>;
  };

  const today = new Date().toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const fullName = [d.consumer.lastName, d.consumer.firstName, d.consumer.middleName]
    .filter(Boolean)
    .join(', ');

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
          <p className="bill-print-header__title">Statement of Account</p>
        </div>

        <hr className="bill-print-divider" />

        <div className="bill-print-info">
          <div className="bill-print-info__group">
            <span className="bill-print-info__label">Date:</span>
            <span>{today}</span>
          </div>
        </div>

        <div className="bill-print-info">
          <div className="bill-print-info__group">
            <span className="bill-print-info__label">Account No:</span>
            <span>{d.consumer.accountNumber}</span>
          </div>
          <div className="bill-print-info__group">
            <span className="bill-print-info__label">Type:</span>
            <span style={{ textTransform: 'capitalize' }}>{d.consumer.consumerType}</span>
          </div>
        </div>

        <div className="bill-print-info">
          <div className="bill-print-info__group">
            <span className="bill-print-info__label">Name:</span>
            <span>{fullName}</span>
          </div>
        </div>

        <div className="bill-print-info">
          <div className="bill-print-info__group">
            <span className="bill-print-info__label">Address:</span>
            <span>{[d.consumer.address, d.consumer.barangay].filter(Boolean).join(', ')}</span>
          </div>
        </div>

        <hr className="bill-print-divider" />

        <p style={{ fontWeight: 700, margin: '0 0 4px' }}>Account Ledger</p>
        <table className="bill-print-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Reference</th>
              <th>Particulars</th>
              <th>Charges</th>
              <th>Payments</th>
              <th>Balance</th>
            </tr>
          </thead>
          <tbody>
            {d.ledger.length === 0 && (
              <tr>
                <td colSpan={6} className="bp-center">
                  No transactions yet.
                </td>
              </tr>
            )}
            {d.ledger.map((e, i) => (
              <tr key={i}>
                <td className="bp-center">
                  {new Date(e.date).toLocaleDateString('en-PH', {
                    month: '2-digit',
                    day: '2-digit',
                    year: 'numeric',
                  })}
                </td>
                <td className="bp-center">{e.reference}</td>
                <td>{e.particulars}</td>
                <td className="bp-right">{e.charges > 0 ? formatPeso(e.charges) : ''}</td>
                <td className="bp-right">{e.payments > 0 ? formatPeso(e.payments) : ''}</td>
                <td className="bp-right bp-bold">{formatPeso(e.balance)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} style={{ textAlign: 'right' }}>
                TOTALS
              </td>
              <td className="bp-right">{formatPeso(d.totalBilled)}</td>
              <td className="bp-right">{formatPeso(d.totalPaid)}</td>
              <td className="bp-right bp-bold">{formatPeso(d.balance)}</td>
            </tr>
          </tfoot>
        </table>

        <div className="bill-print-summary" style={{ marginTop: 24 }}>
          <div className="bill-print-summary__row">
            <span>Total Billed</span>
            <span>{formatPeso(d.totalBilled)}</span>
          </div>
          <div className="bill-print-summary__row">
            <span>Total Paid</span>
            <span>{formatPeso(d.totalPaid)}</span>
          </div>
          <div className="bill-print-summary__row bill-print-summary__row--total">
            <span>Balance Due</span>
            <span>{formatPeso(d.balance)}</span>
          </div>
        </div>

        <div className="bill-print-sig">
          <div className="bill-print-sig__col">
            <p style={{ fontSize: '10pt', marginBottom: 4 }}>Prepared by:</p>
            <div className="bill-print-sig__line"></div>
            <div className="bill-print-sig__title">Billing Clerk</div>
          </div>
          <div className="bill-print-sig__col">
            <p style={{ fontSize: '10pt', marginBottom: 4 }}>Noted by:</p>
            <div className="bill-print-sig__line"></div>
            <div className="bill-print-sig__title">General Manager</div>
          </div>
        </div>

        <div className="bill-print-footer">
          This is a computer-generated statement. For questions, contact MSWD Billing Section.
        </div>
      </div>
    </div>
  );
}
