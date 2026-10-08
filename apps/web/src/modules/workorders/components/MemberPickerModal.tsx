import { useState } from 'react';

import { STAFF_STATUS_LABELS, type StaffAvailabilityStatus, type WorkOrderPersonnel } from '../types';

const STATUS_COLOR: Record<StaffAvailabilityStatus, string> = {
  available: '#067647',
  on_field: '#175cd3',
  on_leave: '#b54708',
  unavailable: '#b42318',
};

/**
 * Floating panel for adding crew members to a work order. Lists the personnel
 * roster with each person's current availability (from the Staff list) and an
 * "Available only" filter. The leader is always shown and locked in.
 */
export default function MemberPickerModal({
  open,
  onClose,
  personnel,
  leaderId,
  selectedIds,
  onToggle,
  statusByPersonnel,
}: {
  open: boolean;
  onClose: () => void;
  personnel: WorkOrderPersonnel[];
  leaderId: string;
  selectedIds: string[];
  onToggle: (id: string) => void;
  statusByPersonnel: Map<string, StaffAvailabilityStatus>;
}) {
  const [availableOnly, setAvailableOnly] = useState(false);
  if (!open) return null;

  // Keep the leader and already-selected members visible; filter the rest by
  // availability (personnel with no linked staff record are treated as unknown
  // and kept visible).
  const rows = personnel.filter((p) => {
    if (p.id === leaderId || selectedIds.includes(p.id)) return true;
    if (!availableOnly) return true;
    const st = statusByPersonnel.get(p.id);
    return !st || st === 'available';
  });

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(16,24,40,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 12,
          width: 'min(640px, 94vw)',
          maxHeight: '82vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 10px 40px rgba(0,0,0,0.25)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '14px 18px',
            borderBottom: '1px solid #eaecf0',
          }}
        >
          <h3 style={{ margin: 0, fontSize: 16 }}>Add Members</h3>
          <button type="button" className="wo-btn wo-btn--sm" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div style={{ padding: '10px 18px', borderBottom: '1px solid #f2f4f7' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
            <input
              type="checkbox"
              checked={availableOnly}
              onChange={(e) => setAvailableOnly(e.target.checked)}
            />
            Available only
          </label>
        </div>

        <div style={{ overflowY: 'auto', padding: '4px 0' }}>
          <table className="wo-table" style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#667085' }}>
                <th style={{ padding: '6px 18px', width: 40 }} />
                <th style={{ padding: '6px 10px' }}>Name</th>
                <th style={{ padding: '6px 10px' }}>Designation</th>
                <th style={{ padding: '6px 10px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const st = statusByPersonnel.get(p.id);
                const isLeader = p.id === leaderId;
                const isSelected = selectedIds.includes(p.id);
                const checked = isLeader || isSelected;
                const unavailable = !!st && st !== 'available';
                // Can't add someone who isn't available; the leader is locked; an
                // already-added person can still be unchecked (removed).
                const lockedOut = isLeader || (unavailable && !isSelected);
                return (
                  <tr key={p.id} style={{ borderTop: '1px solid #f2f4f7', opacity: lockedOut && !isLeader ? 0.6 : 1 }}>
                    <td style={{ padding: '6px 18px' }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={lockedOut}
                        onChange={() => onToggle(p.id)}
                      />
                    </td>
                    <td style={{ padding: '6px 10px', fontWeight: 600 }}>
                      {p.name}
                      {isLeader ? ' (leader)' : ''}
                    </td>
                    <td style={{ padding: '6px 10px' }}>{p.designation ?? '—'}</td>
                    <td style={{ padding: '6px 10px' }}>
                      {st ? (
                        <span style={{ color: STATUS_COLOR[st], fontWeight: 600 }}>
                          {STAFF_STATUS_LABELS[st]}
                        </span>
                      ) : (
                        <span style={{ color: '#98a2b3' }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ padding: 14, color: '#667085' }}>
                    No one to show.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            padding: '12px 18px',
            borderTop: '1px solid #eaecf0',
          }}
        >
          <button type="button" className="wo-btn wo-btn--primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
