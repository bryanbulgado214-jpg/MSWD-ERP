# 04_Database

The database design itself — given its own folder, separate from general
architecture, because for an ERP the data model *is* most of the
architecture, and it evolves through its own review/revision cycle.

## What belongs here

- The current, approved database architecture document (schema
  organization, table inventory, relationships, naming standards,
  indexing recommendations).
- ERD diagrams, per domain (Core, Budgeting/Accounting,
  Procurement/Inventory, HR, and any future module's ERD as it's
  designed).
- Migration strategy notes (once migrations exist) — how schema changes
  are reviewed and rolled out.

## Versioning convention

Database architecture goes through real revisions (e.g. Revision 1 →
Revision 2 after a critical review). Keep only the **current, approved**
version's documents at the top level of this folder. When a revision is
superseded, move the old version into `../Archive/` rather than deleting
it — the corrections list in a later revision often references what
changed from the prior one, so the prior one stays useful as a reference.

## What doesn't belong here

- Prisma schema files or SQL migrations themselves — those live in
  `apps/api/prisma/`, not in documentation. This folder documents the
  *design*, not the implementation.
