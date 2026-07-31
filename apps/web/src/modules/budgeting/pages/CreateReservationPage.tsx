import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { BudgetSummaryApiError, createReservation } from '../api';
import './reservation.css';

export function CreateReservationPage() {
  const { budgetReleaseId } = useParams<{ budgetReleaseId: string }>();
  const navigate = useNavigate();

  const [reservationAmount, setReservationAmount] = useState('');
  const [subjectTable, setSubjectTable] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!budgetReleaseId) return;

    const amount = Number(reservationAmount);
    if (!reservationAmount || Number.isNaN(amount) || amount <= 0) {
      setError('Enter a reservation amount greater than zero.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const created = await createReservation({
        budgetReleaseId,
        reservationAmount: amount,
        ...(subjectTable ? { subjectTable } : {}),
        ...(subjectId ? { subjectId } : {}),
      });
      navigate(`/budgeting/reservations/${created.id}`);
    } catch (err) {
      setError(err instanceof BudgetSummaryApiError ? err.message : 'Something went wrong creating this reservation.');
      setSubmitting(false);
    }
  }

  if (!budgetReleaseId) {
    return (
      <div className="reservation-page">
        <p className="reservation-page__status reservation-page__status--error">No budget release specified.</p>
      </div>
    );
  }

  return (
    <div className="reservation-page">
      <Link className="reservation-page__back" to="/budgeting">
        ← Back to Budgets
      </Link>
      <h1 className="reservation-page__heading">New Reservation</h1>
      <p className="reservation-page__subheading">
        Creates a draft — no budget is held until you submit it (see the Reservation Detail page after creating).
      </p>

      <form className="reservation-card" onSubmit={handleSubmit}>
        <div className="reservation-field">
          <label htmlFor="reservationAmount">Reservation Amount (₱)</label>
          <input
            id="reservationAmount"
            type="number"
            min="0.01"
            step="0.01"
            value={reservationAmount}
            onChange={(e) => setReservationAmount(e.target.value)}
            placeholder="0.00"
            required
          />
        </div>

        <div className="reservation-field">
          <label htmlFor="subjectTable">Subject Table (optional)</label>
          <input
            id="subjectTable"
            type="text"
            value={subjectTable}
            onChange={(e) => setSubjectTable(e.target.value)}
            placeholder="e.g. procurement.purchase_orders"
          />
        </div>

        <div className="reservation-field">
          <label htmlFor="subjectId">Subject ID (optional)</label>
          <input
            id="subjectId"
            type="text"
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            placeholder="UUID of the document this backs"
          />
        </div>

        {error && <p className="reservation-message reservation-message--error">{error}</p>}

        <div className="reservation-actions">
          <button type="submit" className="reservation-btn reservation-btn--primary" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create Draft'}
          </button>
        </div>
      </form>
    </div>
  );
}
