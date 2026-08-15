import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { useAuth } from '../../../app/auth';
import { formatPeso } from '../../budgeting/format-peso';
import { getJev } from '../api';
import type { JevDetail } from '../types';
import '../../procurement/pages/print-forms.css';

// Fallback letterhead details used only when the District Profile is blank.
const FALLBACK_ADDRESS = 'Rizal Street, Poblacion, Sta. Barbara, Iloilo 5002';
const FALLBACK_CONTACT = 'Tel. (033) 523-0000 • sbwd@example.invalid';

function amt(v: string): string {
  return parseFloat(v) > 0 ? formatPeso(v) : '';
}

export function PrintJevPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { organization } = useAuth();
  const [jev, setJev] = useState<JevDetail | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    getJev(id)
      .then(setJev)
      .catch((e) => setError(e.message));
  }, [id]);

  if (error) return <div style={{ padding: 32, color: '#b42318' }}>{error}</div>;
  if (!jev) return <div style={{ padding: 32, color: '#667085' }}>Loading…</div>;

  const entity = (organization?.name ?? 'Sta. Barbara Water District').toUpperCase();
  const jevDate = new Date(jev.jevDate).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const fundCluster = jev.fundSource
    ? `${jev.fundSource.code} — ${jev.fundSource.name}`
    : 'General Fund';
  const rc = jev.responsibilityCenter
    ? `${jev.responsibilityCenter.code} — ${jev.responsibilityCenter.name}`
    : '';

  return (
    <div className="gov-print-page">
      <div className="gov-print-sheet">
        <div className="gov-appendix" style={{ fontSize: '9pt', color: '#444' }}>
          Appendix 36
        </div>

        {/* District letterhead — driven by the configurable District Profile */}
        <div style={{ textAlign: 'center', marginBottom: 6 }}>
          <img
            src={organization?.logoUrl || '/aquabooks-mark.png'}
            alt=""
            style={{ height: 46, marginBottom: 2 }}
          />
          <div style={{ fontSize: '9pt' }}>Republic of the Philippines</div>
          <div className="gov-entity" style={{ fontSize: '13pt', fontWeight: 700 }}>
            {entity}
          </div>
          <div className="gov-subtitle" style={{ fontSize: '8.5pt' }}>
            {organization?.address || FALLBACK_ADDRESS}
          </div>
          <div className="gov-subtitle" style={{ fontSize: '8.5pt' }}>
            {organization?.contact || FALLBACK_CONTACT}
          </div>
        </div>

        <div
          className="gov-title"
          style={{ fontSize: '13pt', letterSpacing: 2, margin: '6px 0 8px' }}
        >
          JOURNAL ENTRY VOUCHER
        </div>

        {/* Header info */}
        <table
          className="gov-table gov-table--bordered gov-table--compact"
          style={{ marginBottom: 0 }}
        >
          <tbody>
            <tr>
              <td style={{ width: '13%', fontWeight: 700, fontSize: '9pt' }}>Entity Name:</td>
              <td style={{ width: '52%', fontSize: '10pt' }}>
                {organization?.name ?? 'Sta. Barbara Water District'}
              </td>
              <td style={{ width: '15%', fontWeight: 700, fontSize: '9pt' }}>JEV No.:</td>
              <td style={{ width: '20%', fontSize: '10pt', fontWeight: 700 }}>{jev.jevNumber}</td>
            </tr>
            <tr>
              <td style={{ fontWeight: 700, fontSize: '9pt' }}>Fund Cluster:</td>
              <td style={{ fontSize: '10pt' }}>{fundCluster}</td>
              <td style={{ fontWeight: 700, fontSize: '9pt' }}>Date:</td>
              <td style={{ fontSize: '10pt' }}>{jevDate}</td>
            </tr>
          </tbody>
        </table>

        {/* Accounting entries */}
        <table
          className="gov-table gov-table--bordered gov-table--compact"
          style={{ marginBottom: 0 }}
        >
          <thead>
            <tr>
              <th rowSpan={2} style={{ width: '16%', fontSize: '8.5pt' }}>
                Responsibility Center
              </th>
              <th colSpan={4} style={{ fontSize: '9pt' }}>
                ACCOUNTING ENTRIES
              </th>
            </tr>
            <tr>
              <th style={{ width: '40%', fontSize: '8.5pt' }}>Accounts and Explanation</th>
              <th style={{ width: '16%', fontSize: '8.5pt' }}>UACS Object Code</th>
              <th style={{ width: '14%', fontSize: '8.5pt' }}>Debit</th>
              <th style={{ width: '14%', fontSize: '8.5pt' }}>Credit</th>
            </tr>
          </thead>
          <tbody>
            {jev.lines.map((line, i) => (
              <tr key={line.id}>
                {i === 0 && (
                  <td
                    rowSpan={jev.lines.length + 1}
                    style={{ fontSize: '9pt', verticalAlign: 'top' }}
                  >
                    {rc}
                  </td>
                )}
                <td
                  style={{
                    fontSize: '10pt',
                    paddingLeft: parseFloat(line.creditAmount) > 0 ? 24 : 8,
                  }}
                >
                  {line.chartOfAccount.name}
                  {line.description ? (
                    <div style={{ fontSize: '8.5pt', color: '#333' }}>{line.description}</div>
                  ) : null}
                </td>
                <td className="gov-center" style={{ fontSize: '9pt' }}>
                  {line.chartOfAccount.accountCode}
                </td>
                <td className="gov-right gov-mono" style={{ fontSize: '10pt' }}>
                  {amt(line.debitAmount)}
                </td>
                <td className="gov-right gov-mono" style={{ fontSize: '10pt' }}>
                  {amt(line.creditAmount)}
                </td>
              </tr>
            ))}
            {/* Explanation row */}
            <tr>
              <td colSpan={3} style={{ fontSize: '9pt', fontStyle: 'italic' }}>
                To record: {jev.particulars}
              </td>
              <td className="gov-right"></td>
              <td className="gov-right"></td>
            </tr>
            {/* Total */}
            <tr>
              <td colSpan={3} className="gov-right gov-bold" style={{ fontSize: '9pt' }}>
                TOTAL
              </td>
              <td className="gov-right gov-mono gov-bold" style={{ fontSize: '10pt' }}>
                {formatPeso(jev.totalDebit)}
              </td>
              <td className="gov-right gov-mono gov-bold" style={{ fontSize: '10pt' }}>
                {formatPeso(jev.totalCredit)}
              </td>
            </tr>
          </tbody>
        </table>

        {/* Signatories */}
        <div className="gov-signatures" style={{ marginTop: 28 }}>
          <div className="gov-sig-col">
            <div className="gov-sig-header" style={{ fontWeight: 700 }}>
              Prepared by:
            </div>
            <div className="gov-sig-line" style={{ width: '85%', margin: '18px auto 4px' }}></div>
            <div className="gov-sig-name">{jev.creator?.username ?? ' '}</div>
            <div className="gov-sig-title">Accounting Personnel</div>
            <div className="gov-sig-date">Date: ____________________</div>
          </div>
          <div className="gov-sig-col">
            <div className="gov-sig-header" style={{ fontWeight: 700 }}>
              Certified Correct:
            </div>
            <div className="gov-sig-line" style={{ width: '85%', margin: '18px auto 4px' }}></div>
            <div className="gov-sig-name">
              {jev.poster?.username ?? jev.reviewer?.username ?? ' '}
            </div>
            <div className="gov-sig-title">Head, Accounting Division/Unit</div>
            <div className="gov-sig-date">Date: ____________________</div>
          </div>
        </div>
      </div>

      <div className="gov-print-controls">
        <button onClick={() => window.print()}>Print</button>
        <button onClick={() => navigate(`/accounting/jev/${jev.id}`)}>Back</button>
      </div>
    </div>
  );
}
