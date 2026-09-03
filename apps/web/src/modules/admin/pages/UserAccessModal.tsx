import { useEffect, useMemo, useState } from 'react';

import {
  getUserPermissions,
  listPermissions,
  setUserPermissions,
  type PermissionItem,
} from '../api';

/**
 * Per-user access editor. An admin ticks exactly which features a specific
 * person may use — independent of any role/position. Saved as direct per-user
 * permission grants (unioned with any role permissions at login).
 */

// Modules shown first (finance-relevant), then the rest alphabetically.
const MODULE_ORDER = [
  'accounting',
  'budgeting',
  'billing',
  'procurement',
  'inventory',
  'asset',
  'hr',
  'workorder',
  'complaint',
  'core',
];

const MODULE_LABEL: Record<string, string> = {
  accounting: 'Accounting',
  budgeting: 'Budgeting',
  billing: 'Billing',
  procurement: 'Procurement',
  inventory: 'Inventory',
  asset: 'Fixed Assets',
  hr: 'Human Resources',
  workorder: 'Work Orders',
  complaint: 'Complaints',
  core: 'System Administration',
};

// Quick presets. `modules` = every permission in those modules; `extra`/`codes`
// = specific codes. Applying a preset replaces the current selection.
const PRESETS: {
  label: string;
  modules?: string[];
  extra?: string[];
  codes?: string[];
  readonly?: boolean;
}[] = [
  {
    // Every view/report permission across the business modules — can see
    // everything, change nothing. Ideal for a remote viewer or auditor.
    label: 'View only (read-only)',
    readonly: true,
  },
  {
    label: 'Accountant (full accounting)',
    modules: ['accounting'],
    extra: ['asset.reports', 'billing.reports'],
  },
  {
    label: 'Finance Manager (all finance)',
    modules: ['accounting', 'budgeting'],
    extra: ['procurement.read', 'billing.reports', 'asset.reports'],
  },
  {
    label: 'Data entry only',
    codes: [
      'accounting.read',
      'accounting.jev.create',
      'accounting.dv.read',
      'accounting.dv.create',
    ],
  },
  {
    label: 'Cashier',
    codes: [
      'accounting.check.read',
      'accounting.dv.read',
      'accounting.check.print',
      'accounting.check.record_release',
    ],
  },
];

export function UserAccessModal({
  userId,
  username,
  onClose,
  onSaved,
}: {
  userId: string;
  username: string;
  onClose: () => void;
  onSaved: (count: number) => void;
}) {
  const [perms, setPerms] = useState<PermissionItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([listPermissions(), getUserPermissions(userId)])
      .then(([catalog, current]) => {
        setPerms(catalog);
        setSelected(new Set(current));
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load access.'))
      .finally(() => setLoading(false));
  }, [userId]);

  const grouped = useMemo(() => {
    const byModule = new Map<string, PermissionItem[]>();
    for (const p of perms) {
      if (!byModule.has(p.module)) byModule.set(p.module, []);
      byModule.get(p.module)!.push(p);
    }
    const modules = [...byModule.keys()].sort((a, b) => {
      const ia = MODULE_ORDER.indexOf(a);
      const ib = MODULE_ORDER.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
    });
    return modules.map((m) => ({
      module: m,
      label: MODULE_LABEL[m] ?? m.charAt(0).toUpperCase() + m.slice(1),
      items: byModule.get(m)!.sort((a, b) => a.name.localeCompare(b.name)),
    }));
  }, [perms]);

  const allCodes = useMemo(() => new Set(perms.map((p) => p.code)), [perms]);

  function toggle(code: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  function toggleModule(items: PermissionItem[], on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const p of items) {
        if (on) next.add(p.code);
        else next.delete(p.code);
      }
      return next;
    });
  }

  function applyPreset(preset: (typeof PRESETS)[number]) {
    const next = new Set<string>();
    if (preset.readonly) {
      // All read/view/report permissions, but nothing under `core.` (keeps the
      // viewer out of the admin area) and no create/update/delete/post/print.
      for (const p of perms) {
        if (!p.code.startsWith('core.') && /\.(read|reports?|view)$/.test(p.code)) {
          next.add(p.code);
        }
      }
    }
    for (const p of perms) {
      if (preset.modules?.includes(p.module)) next.add(p.code);
    }
    for (const c of [...(preset.extra ?? []), ...(preset.codes ?? [])]) {
      if (allCodes.has(c)) next.add(c);
    }
    setSelected(next);
  }

  async function save() {
    setSaving(true);
    setError('');
    try {
      const res = await setUserPermissions(userId, [...selected]);
      onSaved(res.codes.length);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save access.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(16,24,40,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 16,
      }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 12,
          width: 'min(760px, 100%)',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 48px rgba(16,24,40,0.28)',
        }}
      >
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #eaecf0' }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>
            Access for <span style={{ color: '#175cd3' }}>{username}</span>
          </h2>
          <p style={{ margin: '4px 0 0', color: '#667085', fontSize: 12 }}>
            Tick each feature this person may use. Access is per-person, not per-position.
          </p>
        </div>

        <div style={{ padding: '12px 20px', overflowY: 'auto' }}>
          {error && (
            <div className="admin-error" style={{ marginBottom: 12 }}>
              {error}
            </div>
          )}
          {loading ? (
            <div style={{ color: '#667085', fontSize: 13 }}>Loading permissions…</div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: '#475467', alignSelf: 'center' }}>
                  Quick presets:
                </span>
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    className="admin-btn admin-btn--sm"
                    onClick={() => applyPreset(p)}
                  >
                    {p.label}
                  </button>
                ))}
                <button
                  type="button"
                  className="admin-btn admin-btn--sm"
                  onClick={() => setSelected(new Set())}
                >
                  Clear all
                </button>
              </div>
              <div style={{ fontSize: 12, color: '#667085', marginBottom: 10 }}>
                {selected.size} feature{selected.size === 1 ? '' : 's'} selected
              </div>

              {grouped.map((g) => {
                const on = g.items.filter((i) => selected.has(i.code)).length;
                const allOn = on === g.items.length;
                return (
                  <div key={g.module} style={{ marginBottom: 16 }}>
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontWeight: 700,
                        fontSize: 13,
                        color: 'var(--mswd-navy, #10233f)',
                        borderBottom: '1px solid #eaecf0',
                        paddingBottom: 4,
                        marginBottom: 8,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={allOn}
                        ref={(el) => {
                          if (el) el.indeterminate = on > 0 && !allOn;
                        }}
                        onChange={(e) => toggleModule(g.items, e.target.checked)}
                      />
                      {g.label}
                      <span style={{ fontWeight: 400, color: '#98a2b3', fontSize: 12 }}>
                        ({on}/{g.items.length})
                      </span>
                    </label>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                        gap: '4px 16px',
                      }}
                    >
                      {g.items.map((p) => (
                        <label
                          key={p.code}
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 8,
                            fontSize: 12.5,
                            padding: '2px 0',
                            cursor: 'pointer',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={selected.has(p.code)}
                            onChange={() => toggle(p.code)}
                            style={{ marginTop: 2 }}
                          />
                          <span>
                            {p.name}
                            <br />
                            <span
                              style={{ color: '#98a2b3', fontFamily: 'monospace', fontSize: 11 }}
                            >
                              {p.code}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>

        <div
          style={{
            padding: '14px 20px',
            borderTop: '1px solid #eaecf0',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10,
          }}
        >
          <button className="admin-btn" type="button" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            className="admin-btn admin-btn--primary"
            type="button"
            onClick={save}
            disabled={saving || loading}
          >
            {saving ? 'Saving…' : 'Save access'}
          </button>
        </div>
      </div>
    </div>
  );
}
