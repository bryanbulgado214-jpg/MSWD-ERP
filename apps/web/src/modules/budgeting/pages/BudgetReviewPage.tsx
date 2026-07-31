import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { BudgetSummaryApiError, getBudgetHeader, getBudgetHeaderSummary, listBudgetLinesForHeader } from '../api';
import { checkBudgetValidation, type ValidationWarning } from '../budget-validation-checks';
import { formatPeso } from '../format-peso';
import type { BudgetAmountSummary, BudgetHeaderListItem, BudgetLineItem } from '../types';
import './budget-detail.css';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; header: BudgetHeaderListItem; summary: BudgetAmountSummary; lines: BudgetLineItem[]; warnings: ValidationWarning[] };

export function BudgetReviewPage() {
  const { budgetHeaderId } = useParams<{ budgetHeaderId: string }>();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    if (!budgetHeaderId) {
      setState({ status: 'error', message: 'No budget selected.' });
      return;
    }

    let cancelled = false;
    setState({ status: 'loading' });

    (async () => {
      try {
        const [header, summary, lines] = await Promise.all([
          getBudgetHeader(budgetHeaderId),
          getBudgetHeaderSummary(budgetHeaderId),
          listBudgetLinesForHeader(budgetHeaderId),
        ]);
        const warnings = checkBudgetValidation(lines, summary);
        if (!cancelled) setState({ status: 'loaded', header, summary, lines, warnings });
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof BudgetSummaryApiError ? error.message : 'Something went wrong.';
        setState({ status: 'error', message });
      }
    })();

    return () => { cancelled = true; };
  }, [budgetHeaderId]);

  return (
    <div className="budget-detail">
      <Link className="budget-detail__back" to={`/budgeting/budget-headers/${budgetHeaderId}`}>
        ← Back to Budget Detail
      </Link>
      <h1 className="budget-detail__heading">Budget Review</h1>
      <p className="budget-detail__subheading">Pre-submission validation check for this budget.</p>

      {state.status === 'loading' && <p className="budget-detail__status">Loading…</p>}
      {state.status === 'error' && <p className="budget-detail__status budget-detail__status--error">{state.message}</p>}

      {state.status === 'loaded' && (
        <>
          <section className="budget-detail__section">
            <div className="budget-detail__section-header">Budget Summary</div>
            <div className="budget-detail__section-body">
              <dl className="budget-detail__info-grid">
                <div className="budget-detail__info-item">
                  <dt>Responsibility Center</dt>
                  <dd>{state.header.responsibilityCenter.name}</dd>
                </div>
                <div className="budget-detail__info-item">
                  <dt>Fund Source</dt>
                  <dd>{state.header.fundSource.name}</dd>
                </div>
                <div className="budget-detail__info-item">
                  <dt>Total Approved Budget</dt>
                  <dd className="budget-detail__amount">{formatPeso(state.header.totalAmount)}</dd>
                </div>
                <div className="budget-detail__info-item">
                  <dt>Number of Lines</dt>
                  <dd>{state.lines.length}</dd>
                </div>
              </dl>
            </div>
          </section>

          <section className="budget-detail__section">
            <div className="budget-detail__section-header">Validation Results</div>
            <div className="budget-detail__section-body">
              {state.warnings.length === 0 ? (
                <p style={{ color: 'var(--mswd-teal)', fontWeight: 600 }}>
                  All checks passed — this budget is ready for submission.
                </p>
              ) : (
                <ul className="budget-detail__validation-list">
                  {state.warnings.map((w) => (
                    <li key={w.label}>
                      <strong>{w.label}:</strong> {w.detail}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="budget-detail__section">
            <div className="budget-detail__section-header">Budget Lines</div>
            {state.lines.length === 0 ? (
              <p className="budget-detail__empty">No budget lines recorded.</p>
            ) : (
              <div className="budget-detail__table-wrap">
                <table className="budget-detail__table">
                  <thead>
                    <tr>
                      <th>Account Code</th>
                      <th>Account Title</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.lines.map((line) => (
                      <tr key={line.id}>
                        <td>{line.accountCode}</td>
                        <td>{line.description ?? '—'}</td>
                        <td className="budget-detail__amount">{formatPeso(line.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
