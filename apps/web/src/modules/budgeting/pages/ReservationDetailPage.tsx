import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import {
  approveReservation,
  BudgetSummaryApiError,
  cancelReservation,
  editReservationDraft,
  getReservation,
  rejectReservation,
  submitReservation,
} from '../api';
import type { ReservationDetail } from '../types';
import './reservation.css';

type LoadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'loaded' };

type PendingRemarks = 'reject' | 'cancel' | null;

export function ReservationDetailPage() {
  const { reservationId } = useParams<{ reservationId: string }>();
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' });
  const [reservation, setReservation] = useState<ReservationDetail | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [editAmount, setEditAmount] = useState('');
  const [editSubjectTable, setEditSubjectTable] = useState('');
  const [editSubjectId, setEditSubjectId] = useState('');

  const [pendingRemarks, setPendingRemarks] = useState<PendingRemarks>(null);
  const [remarksText, setRemarksText] = useState('');

  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionErrorStatus, setActionErrorStatus] = useState<number | undefined>(undefined);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  function load() {
    if (!reservationId) {
      setLoadState({ status: 'error', message: 'No reservation specified.' });
      return;
    }
    setLoadState({ status: 'loading' });
    getReservation(reservationId)
      .then((data) => {
        setReservation(data);
        setLoadState({ status: 'loaded' });
      })
      .catch((err: unknown) => {
        setLoadState({
          status: 'error',
          message: err instanceof BudgetSummaryApiError ? err.message : 'Something went wrong loading this reservation.',
        });
      });
  }

  useEffect(load, [reservationId]);

  function startEditing() {
    if (!reservation) return;
    setEditAmount(reservation.reservationAmount);
    setEditSubjectTable(reservation.subjectTable ?? '');
    setEditSubjectId(reservation.subjectId ?? '');
    setIsEditing(true);
    setActionError(null);
  }

  async function saveEdit() {
    if (!reservation) return;
    setActionInProgress('edit');
    setActionError(null);
    setActionErrorStatus(undefined);
    try {
      const amount = Number(editAmount);
      if (!editAmount || Number.isNaN(amount) || amount <= 0) {
        throw new Error('Enter a reservation amount greater than zero.');
      }
      const updated = await editReservationDraft(reservation.id, reservation.version, {
        reservationAmount: amount,
        ...(editSubjectTable ? { subjectTable: editSubjectTable } : {}),
        ...(editSubjectId ? { subjectId: editSubjectId } : {}),
      });
      setReservation(updated);
      setIsEditing(false);
      setSuccessMessage('Draft updated.');
    } catch (err) {
      setActionError(err instanceof BudgetSummaryApiError || err instanceof Error ? err.message : 'Could not save changes.');
      if (err instanceof BudgetSummaryApiError) setActionErrorStatus(err.status);
    } finally {
      setActionInProgress(null);
    }
  }

  async function runAction(
    name: string,
    action: () => Promise<ReservationDetail>,
    successText: string,
  ) {
    setActionInProgress(name);
    setActionError(null);
    setActionErrorStatus(undefined);
    setSuccessMessage(null);
    try {
      const updated = await action();
      setReservation(updated);
      setSuccessMessage(successText);
      setPendingRemarks(null);
      setRemarksText('');
    } catch (err) {
      setActionError(err instanceof BudgetSummaryApiError ? err.message : `Could not ${name} this reservation.`);
      if (err instanceof BudgetSummaryApiError) setActionErrorStatus(err.status);
    } finally {
      setActionInProgress(null);
    }
  }

  if (loadState.status === 'loading') {
    return (
      <div className="reservation-page">
        <p className="reservation-page__status">Loading…</p>
      </div>
    );
  }
  if (loadState.status === 'error' || !reservation) {
    return (
      <div className="reservation-page">
        <p className="reservation-page__status reservation-page__status--error">
          {loadState.status === 'error' ? loadState.message : 'Reservation not found.'}
        </p>
      </div>
    );
  }

  const { status } = reservation;
  const isBusy = actionInProgress !== null;

  return (
    <div className="reservation-page">
      <Link className="reservation-page__back" to="/budgeting">
        ← Back to Budgets
      </Link>
      <h1 className="reservation-page__heading">Reservation</h1>
      <p className="reservation-page__subheading">
        Version {reservation.version} — actions available here depend on the current status.
      </p>

      <div className="reservation-card">
        {!isEditing ? (
          <>
            <dl className="reservation-info-grid">
              <div className="reservation-info-item">
                <dt>Amount</dt>
                <dd className="reservation-amount">
                  ₱
                  {Number(reservation.reservationAmount).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </dd>
              </div>
              <div className="reservation-info-item">
                <dt>Status</dt>
                <dd>
                  <span className={`reservation-badge reservation-badge--${status}`}>{status}</span>
                </dd>
              </div>
              <div className="reservation-info-item">
                <dt>Subject Table</dt>
                <dd>{reservation.subjectTable ?? '—'}</dd>
              </div>
              <div className="reservation-info-item">
                <dt>Subject ID</dt>
                <dd>{reservation.subjectId ?? '—'}</dd>
              </div>
            </dl>

            {status === 'draft' && (
              <div className="reservation-actions">
                <button className="reservation-btn reservation-btn--ghost" onClick={startEditing} disabled={isBusy}>
                  Edit
                </button>
                <button
                  className="reservation-btn reservation-btn--primary"
                  disabled={isBusy}
                  onClick={() => runAction('submit', () => submitReservation(reservation.id, reservation.version), 'Submitted — budget has been reserved.')}
                >
                  {actionInProgress === 'submit' ? 'Submitting…' : 'Submit'}
                </button>
                <button
                  className="reservation-btn reservation-btn--danger"
                  disabled={isBusy}
                  onClick={() => setPendingRemarks('cancel')}
                >
                  Cancel
                </button>
              </div>
            )}

            {status === 'submitted' && (
              <div className="reservation-actions">
                <button
                  className="reservation-btn reservation-btn--success"
                  disabled={isBusy}
                  onClick={() => runAction('approve', () => approveReservation(reservation.id, reservation.version), 'Approved.')}
                >
                  {actionInProgress === 'approve' ? 'Approving…' : 'Approve'}
                </button>
                <button
                  className="reservation-btn reservation-btn--warning"
                  disabled={isBusy}
                  onClick={() => setPendingRemarks('reject')}
                >
                  Reject
                </button>
                <button
                  className="reservation-btn reservation-btn--danger"
                  disabled={isBusy}
                  onClick={() => setPendingRemarks('cancel')}
                >
                  Cancel
                </button>
              </div>
            )}

            {status === 'approved' && (
              <div className="reservation-actions">
                <button
                  className="reservation-btn reservation-btn--danger"
                  disabled={isBusy}
                  onClick={() => setPendingRemarks('cancel')}
                >
                  Cancel
                </button>
              </div>
            )}

            {(status === 'rejected' || status === 'cancelled' || status === 'released' || status === 'active') && (
              <p className="reservation-terminal-note">
                This reservation is in a terminal or system-managed state ("{status}") — no actions are available here.
              </p>
            )}

            {pendingRemarks && (
              <div className="reservation-remarks-box">
                <div className="reservation-field">
                  <label htmlFor="remarks">
                    {pendingRemarks === 'reject' ? 'Reason for rejection (optional)' : 'Reason for cancellation (optional)'}
                  </label>
                  <textarea
                    id="remarks"
                    rows={2}
                    value={remarksText}
                    onChange={(e) => setRemarksText(e.target.value)}
                  />
                </div>
                <div className="reservation-actions" style={{ borderTop: 'none', paddingTop: 0 }}>
                  <button
                    className={`reservation-btn ${pendingRemarks === 'reject' ? 'reservation-btn--warning' : 'reservation-btn--danger'}`}
                    disabled={isBusy}
                    onClick={() =>
                      pendingRemarks === 'reject'
                        ? runAction('reject', () => rejectReservation(reservation.id, reservation.version, remarksText || undefined), 'Rejected — the held amount was released back.')
                        : runAction('cancel', () => cancelReservation(reservation.id, reservation.version, remarksText || undefined), 'Cancelled.')
                    }
                  >
                    {isBusy ? 'Working…' : `Confirm ${pendingRemarks === 'reject' ? 'Rejection' : 'Cancellation'}`}
                  </button>
                  <button
                    className="reservation-btn reservation-btn--ghost"
                    disabled={isBusy}
                    onClick={() => {
                      setPendingRemarks(null);
                      setRemarksText('');
                    }}
                  >
                    Never mind
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="reservation-field">
              <label htmlFor="editAmount">Reservation Amount (₱)</label>
              <input
                id="editAmount"
                type="number"
                min="0.01"
                step="0.01"
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
              />
            </div>
            <div className="reservation-field">
              <label htmlFor="editSubjectTable">Subject Table</label>
              <input
                id="editSubjectTable"
                type="text"
                value={editSubjectTable}
                onChange={(e) => setEditSubjectTable(e.target.value)}
              />
            </div>
            <div className="reservation-field">
              <label htmlFor="editSubjectId">Subject ID</label>
              <input id="editSubjectId" type="text" value={editSubjectId} onChange={(e) => setEditSubjectId(e.target.value)} />
            </div>
            <div className="reservation-actions">
              <button className="reservation-btn reservation-btn--primary" disabled={isBusy} onClick={saveEdit}>
                {actionInProgress === 'edit' ? 'Saving…' : 'Save Changes'}
              </button>
              <button
                className="reservation-btn reservation-btn--ghost"
                disabled={isBusy}
                onClick={() => setIsEditing(false)}
              >
                Discard
              </button>
            </div>
          </>
        )}

        {actionError && (
          <p className="reservation-message reservation-message--error">
            {actionError}{' '}
            {actionErrorStatus === 409 && (
              <button className="reservation-btn reservation-btn--ghost" onClick={load} style={{ marginLeft: 8 }}>
                Reload
              </button>
            )}
          </p>
        )}
        {successMessage && !actionError && <p className="reservation-message reservation-message--success">{successMessage}</p>}
      </div>
    </div>
  );
}
