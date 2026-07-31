# src/database

The single connection point between the API and PostgreSQL, via Prisma.

## What lives here

- `prisma.service.ts` — wraps `PrismaClient` as a Nest-managed singleton,
  connecting on app startup and disconnecting on shutdown.
- `database.module.ts` — a global Nest module exporting `PrismaService`, so
  any future business module can inject it directly:

  ```ts
  constructor(private readonly prisma: PrismaService) {}
  ```

## Where the actual schema lives

The Prisma schema itself is at `apps/api/prisma/schema.prisma` (Prisma's
required location, outside `src/`). No business tables exist yet — only
the datasource/generator configuration. Each business module will add its
own models there as it's designed, followed by a migration
(`npm run prisma:migrate --workspace=@mswd-erp/api`).

## Do not

- Do not instantiate `PrismaClient` directly anywhere else in the app —
  always inject `PrismaService`, so connections stay centrally managed.
- Do not put business query logic here — this folder is strictly
  infrastructure. Module-specific repositories/queries belong inside each
  module under `src/modules/<module-name>/`.
