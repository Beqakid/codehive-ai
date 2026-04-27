import { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-d1-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(`CREATE TABLE IF NOT EXISTS "fix_attempts" (
    "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    "agent_plan_id" integer REFERENCES agent_plans(id),
    "branch_name" text,
    "pr_number" integer,
    "attempt_number" integer DEFAULT 1 NOT NULL,
    "status" text DEFAULT 'pending',
    "error_category" text,
    "failed_command" text,
    "exit_code" integer,
    "error_summary" text,
    "raw_logs" text,
    "fix_summary" text,
    "files_updated" text,
    "commit_sha" text,
    "confidence" real,
    "risk_level" text,
    "needs_human_review" integer DEFAULT 0,
    "error_fingerprint" text,
    "updated_at" text DEFAULT (datetime('now')) NOT NULL,
    "created_at" text DEFAULT (datetime('now')) NOT NULL
  )`)
  await db.run(`CREATE INDEX IF NOT EXISTS "fix_attempts_agent_plan_idx" ON "fix_attempts" ("agent_plan_id")`)
  await db.run(`CREATE INDEX IF NOT EXISTS "fix_attempts_status_idx" ON "fix_attempts" ("status")`)
  await db.run(`CREATE INDEX IF NOT EXISTS "fix_attempts_created_at_idx" ON "fix_attempts" ("created_at")`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(`DROP TABLE IF EXISTS "fix_attempts"`)
}
