# 05_Workflows

Business process and approval-workflow definitions — the *business*
shape of a process, kept separate from its technical implementation in
`core.workflow_templates`/`workflow_template_steps`.

## What belongs here

- Process flow diagrams for each significant business process (e.g. the
  Purchase Request → Canvass → Purchase Order → Inspection & Acceptance →
  Payment cycle; the Appropriation → Allotment → Obligation →
  Disbursement cycle).
- Approval-chain definitions per document type — who approves what, in
  what order, and under what conditions (e.g. budget-override approval
  requirements).
- Segregation-of-duties rules stated as business policy (e.g. "the
  requester of a budget override can never also approve it").

## What doesn't belong here

- The technical schema for the workflow engine tables — see
  `04_Database/`.
- API endpoints that implement these workflows — see `06_API/`.
