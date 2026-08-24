-- Per-user notepad + dated reminders for the Accounting Dashboard.
CREATE TABLE "user_notes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "content" TEXT NOT NULL DEFAULT '',
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "user_notes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "user_notes_organization_id_user_id_key" ON "user_notes" ("organization_id", "user_id");

CREATE TABLE "user_reminders" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "due_date" DATE NOT NULL,
  "done" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "user_reminders_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "user_reminders_organization_id_user_id_idx" ON "user_reminders" ("organization_id", "user_id");
