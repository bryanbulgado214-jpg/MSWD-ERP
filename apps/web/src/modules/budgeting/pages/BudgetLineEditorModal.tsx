import { useState } from 'react';

import { BudgetSummaryApiError, createBudgetLine, updateBudgetLine } from '../api';
import type { BudgetLineItem } from '../types';

export function BudgetLineEditorModal({
  budgetHeaderId,
  line,
  existingCodes,
  onSaved,
  onClose,
}: {
  budgetHeaderId: string;
  line: BudgetLineItem | null;
  existingCodes: string[];
  onSaved: () => void;
  onClose: () => void;
}) {
  const isEdit = line !== null;
  const [accountCode, setAccountCode] = useState(line?.accountCode ?? '');
  const [description, setDescription] = useState(line?.description ?? '');
  const [amount, setAmount] = useState(line ? line.amount : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDuplicateCode =
    accountCode.trim() !== '' &&
    existingCodes.some((c) => c === accountCode.trim() && (!isEdit || c !== line.accountCode));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (isEdit) {
        await updateBudgetLine(line.id, {
          accountCode: accountCode.trim(),
          amount: parseFloat(amount),
          ...(description.trim() ? { description: description.trim() } : {}),
        });
      } else {
        await createBudgetLine({
          budgetHeaderId,
          accountCode: accountCode.trim(),
          amount: parseFloat(amount),
          ...(description.trim() ? { description: description.trim() } : {}),
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof BudgetSummaryApiError ? err.message : 'Something went wrong saving this line.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="budget-detail__modal-backdrop" onClick={onClose}>
      <div className="budget-detail__modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="budget-detail__modal-title">{isEdit ? 'Edit Budget Line' : 'Add Budget Line'}</h2>

        {error && <p className="budget-detail__banner budget-detail__banner--error">{error}</p>}

        <form onSubmit={handleSubmit}>
          <label className="budget-detail__field">
            <span>Account Code</span>
            <input type="text" value={accountCode} onChange={(e) => setAccountCode(e.target.value)} required />
            {isDuplicateCode && (
              <span className="budget-detail__field-notice">This account code already exists on this budget.</span>
            )}
          </label>

          <label className="budget-detail__field">
            <span>Account Title (Description)</span>
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>

          <label className="budget-detail__field">
            <span>Amount</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </label>

          <div className="budget-detail__modal-actions">
            <button type="button" className="budget-detail__action-button budget-detail__action-button--secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="budget-detail__action-button budget-detail__action-button--primary" disabled={saving || !accountCode.trim() || !amount}>
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Line'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
