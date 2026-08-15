import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '../../../app/auth';
import {
  BillingApiError,
  applyPenalties,
  createDisconnectionOrder,
  getConsumersInArrears,
  getDisconnectionOrders,
  transitionDisconnection,
} from '../api';
import type { ConsumerArrears, DisconnectionOrderListItem } from '../types';

import BillingSubNav from './BillingSubNav';
import './billing.css';

type LoadState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: T };

function formatPeso(val: string | number) {
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(num)) return '--';
  return num.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
}

export default function DisconnectionPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('billing.disconnect.manage');

  const [tab, setTab] = useState<'orders' | 'arrears'>('orders');
  const [orders, setOrders] = useState<LoadState<DisconnectionOrderListItem[]>>({ status: 'idle' });
  const [statusFilter, setStatusFilter] = useState('');
  const [arrears, setArrears] = useState<LoadState<ConsumerArrears[]>>({ status: 'idle' });
  const [showCreate, setShowCreate] = useState(false);
  const [createConsumerId, setCreateConsumerId] = useState('');
  const [noticeDate, setNoticeDate] = useState(new Date().toISOString().slice(0, 10));
  const [scheduledDate, setScheduledDate] = useState('');
  const [createRemarks, setCreateRemarks] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [actionId, setActionId] = useState('');
  const [actionType, setActionType] = useState('');
  const [actionReason, setActionReason] = useState('');
  const [reconnFee, setReconnFee] = useState('');
  const [penaltyResult, setPenaltyResult] = useState('');

  useEffect(() => {
    if (tab === 'orders') loadOrders();
    else loadArrears();
  }, [tab, statusFilter]);

  async function loadOrders() {
    setOrders({ status: 'loading' });
    try {
      const data = await getDisconnectionOrders(
        statusFilter ? `status=${statusFilter}` : undefined,
      );
      setOrders({ status: 'loaded', data });
    } catch (err) {
      setOrders({
        status: 'error',
        message: err instanceof BillingApiError ? err.message : 'Failed.',
      });
    }
  }

  async function loadArrears() {
    setArrears({ status: 'loading' });
    try {
      const data = await getConsumersInArrears();
      setArrears({ status: 'loaded', data });
    } catch (err) {
      setArrears({
        status: 'error',
        message: err instanceof BillingApiError ? err.message : 'Failed.',
      });
    }
  }

  function openCreate(consumerId: string) {
    setCreateConsumerId(consumerId);
    setNoticeDate(new Date().toISOString().slice(0, 10));
    const sched = new Date();
    sched.setDate(sched.getDate() + 15);
    setScheduledDate(sched.toISOString().slice(0, 10));
    setCreateRemarks('');
    setFormError('');
    setShowCreate(true);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      await createDisconnectionOrder({
        consumerId: createConsumerId,
        noticeDate,
        scheduledDate,
        ...(createRemarks ? { remarks: createRemarks } : {}),
      });
      setShowCreate(false);
      setSuccessMsg('Disconnection order created.');
      setTab('orders');
      loadOrders();
    } catch (err) {
      setFormError(err instanceof BillingApiError ? err.message : 'Failed.');
    } finally {
      setSaving(false);
    }
  }

  async function handleAction(order: DisconnectionOrderListItem) {
    try {
      await transitionDisconnection(order.id, {
        expectedVersion: order.version,
        action: actionType,
        ...(actionType === 'cancel' && actionReason ? { reason: actionReason } : {}),
        ...(actionType === 'reconnect' && reconnFee ? { reconnectionFee: Number(reconnFee) } : {}),
      });
      setActionId('');
      setActionType('');
      loadOrders();
    } catch (err) {
      alert(err instanceof BillingApiError ? err.message : 'Failed.');
    }
  }

  async function handleApplyPenalties() {
    if (!confirm('Apply 10% late payment penalty to all overdue unpaid bills?')) return;
    setPenaltyResult('');
    try {
      const result = await applyPenalties();
      setPenaltyResult(`Penalties applied to ${result.applied} bill(s).`);
    } catch (err) {
      setPenaltyResult(err instanceof BillingApiError ? err.message : 'Failed.');
    }
  }

  function getActionButtons(order: DisconnectionOrderListItem) {
    if (!canManage) return null;
    const actions: Array<{ action: string; label: string; cls: string }> = [];
    if (order.status === 'notice_issued')
      actions.push({ action: 'serve', label: 'Mark Served', cls: '' });
    if (order.status === 'served')
      actions.push({ action: 'disconnect', label: 'Disconnect', cls: 'bill-btn--danger' });
    if (order.status === 'disconnected')
      actions.push({ action: 'reconnect', label: 'Reconnect', cls: 'bill-btn--success' });
    if (order.status !== 'cancelled' && order.status !== 'reconnected')
      actions.push({ action: 'cancel', label: 'Cancel', cls: '' });
    return actions;
  }

  return (
    <div className="bill-page">
      <BillingSubNav />
      <h1>Arrears & Disconnection</h1>

      <div className="bill-toolbar">
        <button
          type="button"
          className={`bill-btn${tab === 'orders' ? ' bill-btn--primary' : ''}`}
          onClick={() => setTab('orders')}
        >
          Disconnection Orders
        </button>
        <button
          type="button"
          className={`bill-btn${tab === 'arrears' ? ' bill-btn--primary' : ''}`}
          onClick={() => setTab('arrears')}
        >
          Consumers in Arrears
        </button>
        {canManage && (
          <button
            type="button"
            className="bill-btn bill-btn--danger"
            onClick={handleApplyPenalties}
            style={{ marginLeft: 'auto' }}
          >
            Apply Penalties
          </button>
        )}
      </div>

      {successMsg && (
        <div className="bill-success" style={{ marginBottom: '12px' }}>
          {successMsg}
        </div>
      )}
      {penaltyResult && (
        <div
          className={penaltyResult.startsWith('Penalties') ? 'bill-success' : 'bill-error'}
          style={{ marginBottom: '12px' }}
        >
          {penaltyResult}
        </div>
      )}

      {showCreate && (
        <form className="bill-form" onSubmit={handleCreate}>
          <h3 style={{ margin: '0 0 16px', color: '#0a2540', fontSize: '16px' }}>
            Create Disconnection Notice
          </h3>
          {formError && <div className="bill-error">{formError}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="bill-field">
              <label>Notice Date *</label>
              <input
                type="date"
                required
                value={noticeDate}
                onChange={(e) => setNoticeDate(e.target.value)}
              />
            </div>
            <div className="bill-field">
              <label>Scheduled Disconnection *</label>
              <input
                type="date"
                required
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
              />
            </div>
          </div>
          <div className="bill-field" style={{ maxWidth: '400px' }}>
            <label>Remarks</label>
            <input
              value={createRemarks}
              onChange={(e) => setCreateRemarks(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="bill-form-actions">
            <button type="button" className="bill-btn" onClick={() => setShowCreate(false)}>
              Cancel
            </button>
            <button type="submit" className="bill-btn bill-btn--primary" disabled={saving}>
              {saving ? 'Creating...' : 'Issue Notice'}
            </button>
          </div>
        </form>
      )}

      {tab === 'orders' && (
        <>
          <div style={{ marginBottom: '12px' }}>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                padding: '6px 10px',
                borderRadius: '6px',
                border: '1.5px solid #d0d5dd',
                fontSize: '13px',
              }}
            >
              <option value="">All statuses</option>
              <option value="notice_issued">Notice Issued</option>
              <option value="served">Served</option>
              <option value="disconnected">Disconnected</option>
              <option value="reconnected">Reconnected</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          {orders.status === 'loading' && <p>Loading...</p>}
          {orders.status === 'error' && <div className="bill-error">{orders.message}</div>}
          {orders.status === 'loaded' && orders.data.length === 0 && (
            <div className="bill-empty">No disconnection orders found.</div>
          )}
          {orders.status === 'loaded' && orders.data.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table className="bill-table">
                <thead>
                  <tr>
                    <th>Order #</th>
                    <th>Consumer</th>
                    <th>Notice Date</th>
                    <th>Scheduled</th>
                    <th>Arrears</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {orders.data.map((o) => (
                    <tr key={o.id}>
                      <td>
                        <Link
                          to={`/billing/disconnections/${o.id}`}
                          className="bill-table__link bill-text-mono"
                        >
                          {o.orderNumber}
                        </Link>
                      </td>
                      <td>
                        <Link
                          to={`/billing/consumers/${o.consumerId}`}
                          className="bill-table__link"
                        >
                          {o.consumer.accountNumber} — {o.consumer.lastName}, {o.consumer.firstName}
                        </Link>
                      </td>
                      <td>{new Date(o.noticeDate).toLocaleDateString()}</td>
                      <td>{new Date(o.scheduledDate).toLocaleDateString()}</td>
                      <td className="bill-text-mono" style={{ fontWeight: 600 }}>
                        {formatPeso(o.totalArrears)}
                      </td>
                      <td>
                        <span className={`bill-badge bill-badge--${o.status}`}>
                          {o.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td>
                        {actionId === o.id ? (
                          <div
                            style={{
                              display: 'flex',
                              gap: '4px',
                              alignItems: 'center',
                              flexWrap: 'wrap',
                            }}
                          >
                            {actionType === 'cancel' && (
                              <input
                                placeholder="Reason..."
                                value={actionReason}
                                onChange={(e) => setActionReason(e.target.value)}
                                style={{ width: '120px', padding: '3px 6px', fontSize: '12px' }}
                              />
                            )}
                            {actionType === 'reconnect' && (
                              <input
                                placeholder="Reconn. fee"
                                type="number"
                                value={reconnFee}
                                onChange={(e) => setReconnFee(e.target.value)}
                                style={{ width: '100px', padding: '3px 6px', fontSize: '12px' }}
                              />
                            )}
                            <button
                              type="button"
                              className="bill-btn bill-btn--primary"
                              style={{ padding: '3px 8px', fontSize: '11px' }}
                              onClick={() => handleAction(o)}
                            >
                              Confirm
                            </button>
                            <button
                              type="button"
                              className="bill-btn"
                              style={{ padding: '3px 8px', fontSize: '11px' }}
                              onClick={() => setActionId('')}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', gap: '4px' }}>
                            {getActionButtons(o)?.map((a) => (
                              <button
                                key={a.action}
                                type="button"
                                className={`bill-btn ${a.cls}`}
                                style={{ padding: '3px 8px', fontSize: '11px' }}
                                onClick={() => {
                                  setActionId(o.id);
                                  setActionType(a.action);
                                  setActionReason('');
                                  setReconnFee('');
                                }}
                              >
                                {a.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === 'arrears' && (
        <>
          {arrears.status === 'loading' && <p>Loading...</p>}
          {arrears.status === 'error' && <div className="bill-error">{arrears.message}</div>}
          {arrears.status === 'loaded' && arrears.data.length === 0 && (
            <div className="bill-empty">No consumers with outstanding arrears.</div>
          )}
          {arrears.status === 'loaded' && arrears.data.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table className="bill-table">
                <thead>
                  <tr>
                    <th>Account #</th>
                    <th>Consumer</th>
                    <th>Type</th>
                    <th>Unpaid Bills</th>
                    <th>Total Arrears</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {arrears.data.map((c) => (
                    <tr key={c.id}>
                      <td className="bill-text-mono">{c.accountNumber}</td>
                      <td>
                        {c.lastName}, {c.firstName}
                      </td>
                      <td>
                        <span className={`bill-badge bill-badge--${c.consumerType}`}>
                          {c.consumerType}
                        </span>
                      </td>
                      <td className="bill-text-mono">{c.unpaidCount}</td>
                      <td className="bill-text-mono" style={{ fontWeight: 600, color: '#d92d20' }}>
                        {formatPeso(c.totalArrears)}
                      </td>
                      <td>
                        {canManage && (
                          <button
                            type="button"
                            className="bill-btn bill-btn--danger"
                            style={{ padding: '3px 8px', fontSize: '11px' }}
                            onClick={() => openCreate(c.id)}
                          >
                            Issue Notice
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
