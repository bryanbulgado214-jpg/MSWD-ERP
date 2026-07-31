# 09_Deployment

Deployment, environment, and operations documentation.

## What belongs here

- Environment setup guides (development, staging, production) beyond
  what's already in each app's own `README.md`.
- Deployment procedure/runbook — how a new version actually gets released,
  including database migration sequencing and rollback steps.
- Backup and disaster-recovery procedures for the database.
- Infrastructure/hosting decisions and their rationale, once made.

## What doesn't belong here

- One-time historical setup notes for a specific past incident — those
  belong in `../Archive/` once no longer current guidance.
- `.env.example` files themselves — those live in each app's own folder.
