import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-d1-sqlite'
import { sql } from '@payloadcms/db-d1-sqlite'

/**
 * Milestone 3 migration
 * Creates 6 new tables for controlled code generation:
 *  - patch_runs           — AI-generated patch sets
 *  - validation_results   — patch validation results
 *  - sandbox_runs         — sandbox execution results
 *  - rollback_plans       — rollback strategies per run
 *  - review_gate_events   — review gate decisions
 *  - self_heal_attempts   — self-healing repair attempts
 *
 * All changes are ADDITIVE (new tables only).
 * No existing tables are modified.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  // ── patch_runs ───────────────────────────────────────────────────────────
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS patch_runs (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id              TEXT    NOT NULL,
      project_id          TEXT    NOT NULL,
      status              TEXT    NOT NULL DEFAULT 'pending',
      patch_count         INTEGER NOT NULL DEFAULT 0,
      total_lines_changed INTEGER NOT NULL DEFAULT 0,
      patches             TEXT,
      diffs               TEXT,
      rejected_files      TEXT,
      validation_errors   TEXT,
      warnings            TEXT,
      ai_model            TEXT,
      duration_ms         INTEGER,
      error_message       TEXT,
      created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at          TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `)
  await db.run(sql`CREATE INDEX IF NOT EXISTS patch_runs_run_id_idx ON patch_runs (run_id);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS patch_runs_project_id_idx ON patch_runs (project_id);`)

  // ── validation_results ───────────────────────────────────────────────────
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS validation_results (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id          TEXT    NOT NULL,
      project_id      TEXT    NOT NULL,
      valid           INTEGER NOT NULL DEFAULT 0,
      error_count     INTEGER NOT NULL DEFAULT 0,
      warning_count   INTEGER NOT NULL DEFAULT 0,
      issues          TEXT,
      scope_results   TEXT,
      summary         TEXT,
      duration_ms     INTEGER,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `)
  await db.run(sql`CREATE INDEX IF NOT EXISTS validation_results_run_id_idx ON validation_results (run_id);`)

  // ── sandbox_runs ─────────────────────────────────────────────────────────
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS sandbox_runs (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id            TEXT    NOT NULL,
      project_id        TEXT    NOT NULL,
      provider          TEXT    NOT NULL DEFAULT 'github_actions',
      success           INTEGER NOT NULL DEFAULT 0,
      steps             TEXT,
      total_duration_ms INTEGER,
      errors            TEXT,
      summary           TEXT,
      branch            TEXT,
      created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at        TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `)
  await db.run(sql`CREATE INDEX IF NOT EXISTS sandbox_runs_run_id_idx ON sandbox_runs (run_id);`)

  // ── rollback_plans ───────────────────────────────────────────────────────
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS rollback_plans (
      id                      INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id                  TEXT    NOT NULL,
      project_id              TEXT    NOT NULL,
      files_touched           TEXT,
      reversal_strategy       TEXT,
      dependency_risks        TEXT,
      cleanup_considerations  TEXT,
      migration_risks         TEXT,
      rollback_complexity     TEXT    NOT NULL DEFAULT 'SIMPLE',
      rollback_markdown       TEXT,
      created_at              TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at              TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `)
  await db.run(sql`CREATE INDEX IF NOT EXISTS rollback_plans_run_id_idx ON rollback_plans (run_id);`)

  // ── review_gate_events ───────────────────────────────────────────────────
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS review_gate_events (
      id                       INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id                   TEXT    NOT NULL,
      project_id               TEXT    NOT NULL,
      overall_decision         TEXT    NOT NULL,
      can_proceed              INTEGER NOT NULL DEFAULT 0,
      requires_human_approval  INTEGER NOT NULL DEFAULT 0,
      checks                   TEXT,
      block_reasons            TEXT,
      warnings                 TEXT,
      summary                  TEXT,
      approved_by              TEXT,
      approved_at              TEXT,
      created_at               TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at               TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `)
  await db.run(sql`CREATE INDEX IF NOT EXISTS review_gate_events_run_id_idx ON review_gate_events (run_id);`)

  // ── self_heal_attempts ───────────────────────────────────────────────────
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS self_heal_attempts (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id           TEXT    NOT NULL,
      project_id       TEXT    NOT NULL,
      attempt_number   INTEGER NOT NULL,
      error_category   TEXT,
      error_message    TEXT,
      heal_action      TEXT,
      patch_applied    TEXT,
      success          INTEGER NOT NULL DEFAULT 0,
      result_message   TEXT,
      duration_ms      INTEGER,
      created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at       TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `)
  await db.run(sql`CREATE INDEX IF NOT EXISTS self_heal_attempts_run_id_idx ON self_heal_attempts (run_id);`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE IF EXISTS self_heal_attempts;`)
  await db.run(sql`DROP TABLE IF EXISTS review_gate_events;`)
  await db.run(sql`DROP TABLE IF EXISTS rollback_plans;`)
  await db.run(sql`DROP TABLE IF EXISTS sandbox_runs;`)
  await db.run(sql`DROP TABLE IF EXISTS validation_results;`)
  await db.run(sql`DROP TABLE IF EXISTS patch_runs;`)
}
