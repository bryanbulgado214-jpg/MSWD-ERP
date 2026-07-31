export const MODULE_GATES = {
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
  ],
} as const;

export function hasModuleAccess(permissions: Set<string>, mod: keyof typeof MODULE_GATES): boolean {
  return MODULE_GATES[mod].some((code) => permissions.has(code));
}
