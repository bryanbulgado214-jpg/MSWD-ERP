export const MODULE_GATES = {
  admin: [
    'core.user.manage',
    'core.role.manage',
  ],
  budgeting: [
    'budgeting.cycle.manage',
    'budgeting.header.manage',
    'budgeting.header.approve',
    'budgeting.release.create',
    'budgeting.reservation.create',
    'budgeting.reservation.approve',
  ],
  procurement: [
    'procurement.read',
    'procurement.pr.create',
    'procurement.caf.create',
    'procurement.caf.certify',
    'procurement.ors.create',
    'procurement.ors.requesting_certify',
    'procurement.ors.budget_certify',
    'procurement.po.create',
    'procurement.po.approve',
    'procurement.delegation.manage',
    'procurement.inspection.create',
    'procurement.inspection.accept',
    'procurement.dv.create',
    'procurement.dv.certify',
    'procurement.dv.approve',
    'procurement.dv.release',
  ],
  inventory: [
    'inventory.read',
    'inventory.item.manage',
    'inventory.receipt.manage',
    'inventory.ris.manage',
    'inventory.ris.approve',
    'inventory.ris.issue',
    'inventory.property.manage',
    'inventory.accountability.manage',
    'inventory.physical_count.manage',
    'inventory.dispose.manage',
    'inventory.reports',
  ],
  accounting: [
    'accounting.read',
    'accounting.coa.manage',
    'accounting.bank.manage',
    'accounting.jev.create',
    'accounting.jev.post',
    'accounting.jev.void',
    'accounting.period.manage',
    'accounting.reports',
    'accounting.reconcile',
  ],
  reports: [
    'procurement.read',
    'budgeting.read',
  ],
} as const;

export function hasModuleAccess(permissions: Set<string>, mod: keyof typeof MODULE_GATES): boolean {
  return MODULE_GATES[mod].some((code) => permissions.has(code));
}
