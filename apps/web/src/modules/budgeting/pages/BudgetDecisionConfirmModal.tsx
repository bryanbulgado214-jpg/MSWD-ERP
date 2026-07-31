import { formatPeso } from '../format-peso';
import type { BudgetCycleSummary, BudgetVersionSummary } from '../types';

export function BudgetDecisionConfirmModal({
  title,
  confirmLabel,
  confirmingLabel,
  message,
  cycle,
  version,
  totalAmount,
  lineCount,
  submitting,
  onConfirm,
  onCancel,
}: {
  title: string;
  confirmLabel: string;
  confirmingLabel: string;
  message: string;
  cycle: BudgetCycleSummary;
  version: BudgetVersionSummary;
  totalAmount: string;
  lineCount: number;
  submitting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="budget-detail__modal-backdrop" onClick={onCancel}>
      <div className="budget-detail__modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="budget-detail__modal-title">{title}</h2>
        <p>{message}</p>

        <dl className="budget-detail__info-grid" style={{ marginTop: '1rem' }}>
          <div className="budget-detail__info-item">
            <dt>Budget Cycle</dt>
            <dd>{cycle.name}</dd>
          </div>
          <div className="budget-detail__info-item">
            <dt>Version</dt>
            <dd>{version.name} (v{version.versionNumber})</dd>
          </div>
          <div className="budget-detail__info-item">
            <dt>Total Amount</dt>
            <dd className="budget-detail__amount">{formatPeso(totalAmount)}</dd>
          </div>
          <div className="budget-detail__info-item">
            <dt>Budget Lines</dt>
            <dd>{lineCount}</dd>
          </div>
        </dl>

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
            className="budget-detail__action-button budget-detail__action-button--primary"
            onClick={onConfirm}
            disabled={submitting}
          >
            {submitting ? confirmingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
