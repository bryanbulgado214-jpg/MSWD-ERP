import type { WorkOrderType, WorkOrderNature } from '@prisma/client';

// Which task types are technical — Technical Services must assign the crew — vs
// purely commercial, which Commercial Services can carry out on its own. The
// nature is DERIVED from the type so it can't be mis-set to bypass the rule.
const TECHNICAL_TYPES = new Set<WorkOrderType>([
  'installation',
  'relocation',
  'reconnection',
  'disconnection',
  'repair',
  'maintenance',
  'replacement',
  'leak_repair',
  'inspection',
]);

export function natureOfType(type: WorkOrderType): WorkOrderNature {
  return TECHNICAL_TYPES.has(type) ? 'technical' : 'commercial';
}

// Tasks performed for an identifiable customer default to requiring the client's
// signature on the printout; the creator can still override per order.
const SIGNATURE_DEFAULT_TYPES = new Set<WorkOrderType>([
  'installation',
  'relocation',
  'reconnection',
  'disconnection',
]);

export function signatureRequiredByDefault(type: WorkOrderType): boolean {
  return SIGNATURE_DEFAULT_TYPES.has(type);
}

// The permission needed to assign the crew for a given nature.
export function assignPermissionFor(nature: WorkOrderNature): string {
  return nature === 'technical'
    ? 'workorder.assign.technical'
    : 'workorder.assign.commercial';
}
