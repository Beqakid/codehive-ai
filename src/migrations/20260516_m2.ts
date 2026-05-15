import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-d1-sqlite'
import { sql } from '@payloadcms/db-d1-sqlite'

/**
 * Milestone 2 migration
 * Creates:
 *  - repo_intelligence    — persisted repository scans
 *  - run_risk_reports     — per-run risk analysis results
 *
 * All changes are ADDITIVE (new tables only).
 * No existing tables are modified.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  // ── repo_intelligence ────────────────────────────────────────────────────
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS repo_intelligence (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id           TEXT    NOT NULL,
      owner                TEXT    NOT NULL,
      repo                 TEXT    NOT NULL,
      framework_summary    TEXT,
      architecture_summary TEXT,
      tech_stack           TEXT,
      important_files      TEXT,
      protected_areas      TEXT,
      env_vars_detected    TEXT,
      route_structure      TEXT,
      auth_system          TEXT,
      last_indexed_at      TEXT,
      created_at           TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at           TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `)
  await db.run(sql`
    CREATE INDEX IF NOT EXISTS repo_intelligence_project_id_idx ON repo_intelligence (project_id);
  `)
  await db.run(sql`
    CREATE INDEX IF NOT EXISTS repo_intelligence_owner_repo_idx ON repo_intelligence (owner, repo);
  `)

  // ── run_risk_reports ─────────────────────────────────────────────────────
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS run_risk_reports (
      id                      INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id                  TEXT    NOT NULL,
      project_id              TEXT    NOT NULL,
      risk_level              TEXT    NOT NULL,
      risk_score              INTEGER NOT NULL DEFAULT 0,
      confidence_score        INTEGER NOT NULL DEFAULT 50,
      rollback_complexity     TEXT,
      implementation_scope    TEXT,
      affected_files          TEXT,
      protected_files_touched TEXT,
      recommendations         TEXT,
      created_at              TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at              TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `)
  await db.run(sql`
    CREATE INDEX IF NOT EXISTS run_risk_reports_run_id_idx ON run_risk_reports (run_id);
  `)
  await db.run(sql`
    CREATE INDEX IF NOT EXISTS run_risk_reports_project_id_idx ON run_risk_reports (project_id);
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE IF EXISTS run_risk_reports;`)
  await db.run(sql`DROP TABLE IF EXISTS repo_intelligence;`)
}
