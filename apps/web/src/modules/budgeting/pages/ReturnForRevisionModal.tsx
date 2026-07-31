import { useState } from 'react';

/**
 * budget_headers has no remarks column, so the return reason can't be
 * persisted anywhere by the current backend — it's captured here
 * purely as a transient UX aid (shown once on the detail page, lost on
 * reload). A real remarks column would require a schema change.
 */
export function ReturnForRevisionModal({
  submitting,
  onConfirm,
  onCancel,
}: {
  submitting: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState('');

  return (
    <div className="budget-detail__modal-backdrop" onClick={onCancel}>
      <div className="budget-detail__modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="budget-detail__modal-title">Return Budget for Revision</h2>
        <p>
          You are about to return this budget to draft status. The budget officer will be able to edit and resubmit it.
        </p>

        <label className="budget-detail__field">
          <span>Reason for Return</span>
          <textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Explain why this budget needs revision…"
          />
          <span className="budget-detail__field-notice">
            Note: this reason is shown once on the detail page but cannot be saved — the current schema has no remarks
            column on budget headers.
          </span>
        </label>

        <div className="budget-detail__modal-actions">
          <button
            type="button"
            className="budget-detail__action-button budget-detail__action-button--secondary"
            onClick={onCancel}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="budget-detail__action-button budget-detail__action-button--danger"
            onClick={() => onConfirm(reason.trim() || '(no reason given)')}
            disabled={submitting}
          >
            {submitting ? 'Returning…' : 'Return for Revision'}
          </button>
        </div>
      </div>
    </div>
  );
}
