import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-d1-sqlite'
import { sql } from '@payloadcms/db-d1-sqlite'

/**
 * Milestone 1 migration
 * - Adds repo_owner, repo_name, default_branch to projects
 * - Adds run_type, branch_name, pr_url, plan_markdown to agent_runs
 * - Creates agent_logs table
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  // ── projects: new columns ───────────────────────────────────────────────
  await db.run(sql`
    ALTER TABLE projects ADD COLUMN repo_owner TEXT;
  `)
  await db.run(sql`
    ALTER TABLE projects ADD COLUMN repo_name TEXT;
  `)
  await db.run(sql`
    ALTER TABLE projects ADD COLUMN default_branch TEXT DEFAULT 'main';
  `)

  // ── agent_runs: new columns ─────────────────────────────────────────────
  await db.run(sql`
    ALTER TABLE agent_runs ADD COLUMN run_type TEXT DEFAULT 'codegen';
  `)
  await db.run(sql`
    ALTER TABLE agent_runs ADD COLUMN branch_name TEXT;
  `)
  await db.run(sql`
    ALTER TABLE agent_runs ADD COLUMN pr_url TEXT;
  `)
  await db.run(sql`
    ALTER TABLE agent_runs ADD COLUMN plan_markdown TEXT;
  `)

  // ── agent_logs: new table ───────────────────────────────────────────────
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS agent_logs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id      TEXT    NOT NULL,
      level       TEXT    NOT NULL DEFAULT 'info',
      event       TEXT    NOT NULL,
      message     TEXT    NOT NULL,
      metadata    TEXT,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `)
  await db.run(sql`
    CREATE INDEX IF NOT EXISTS agent_logs_run_id_idx ON agent_logs (run_id);
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // D1 / SQLite does not support DROP COLUMN — recreate tables if needed.
  // For now just drop agent_logs (the only fully new table).
  await db.run(sql`DROP TABLE IF EXISTS agent_logs;`)
  // Note: columns added to projects and agent_runs cannot be removed via SQLite ALTER.
  // They are inert empty columns and do not affect existing functionality.
}
