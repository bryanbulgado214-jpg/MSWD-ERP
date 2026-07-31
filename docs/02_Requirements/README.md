# 02_Requirements

What the system must do, independent of how it will be built.

## What belongs here

- Functional requirements, organized per module (Core Platform,
  Budgeting, Accounting, Procurement, Inventory & Property, Human
  Resources) as each is designed.
- Non-functional requirements — performance, security, audit/compliance
  obligations (e.g. COA/government accounting requirements), availability.
- User roles and permission requirements at a business-policy level (the
  *what* — e.g. "only the Cashier role may void a check") — the technical
  implementation of that policy belongs in `03_Architecture/` or
  `04_Database/`.

## What doesn't belong here

- Database schema or ERDs — those go in `04_Database/`.
- API contracts — those go in `06_API/`.
- Approval-chain step definitions — those go in `05_Workflows/`.
