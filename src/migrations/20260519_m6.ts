import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-d1-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // ── async_runs ───────────────────────────────────────────────────────
  await db.run(`CREATE TABLE IF NOT EXISTS async_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    project_name TEXT NOT NULL,
    repo_owner TEXT NOT NULL,
    repo_name TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    branch TEXT DEFAULT 'main',
    status TEXT DEFAULT 'queued',
    current_step TEXT,
    total_steps INTEGER DEFAULT 12,
    completed_steps INTEGER DEFAULT 0,
    failed_steps INTEGER DEFAULT 0,
    heartbeat_at TEXT,
    started_at TEXT,
    completed_at TEXT,
    duration_ms INTEGER DEFAULT 0,
    error TEXT,
    metadata TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`)
  await db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_async_runs_run_id ON async_runs(run_id)`)
  await db.run(`CREATE INDEX IF NOT EXISTS idx_async_runs_project_id ON async_runs(project_id)`)
  await db.run(`CREATE INDEX IF NOT EXISTS idx_async_runs_status ON async_runs(status)`)

  // ── async_run_steps ──────────────────────────────────────────────────
  await db.run(`CREATE TABLE IF NOT EXISTS async_run_steps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL,
    step_name TEXT NOT NULL,
    step_index INTEGER NOT NULL,
    status TEXT DEFAULT 'pending',
    model TEXT,
    output TEXT,
    markdown TEXT,
    error TEXT,
    started_at TEXT,
    completed_at TEXT,
    duration_ms INTEGER DEFAULT 0,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`)
  await db.run(`CREATE INDEX IF NOT EXISTS idx_async_run_steps_run_id ON async_run_steps(run_id)`)
  await db.run(`CREATE INDEX IF NOT EXISTS idx_async_run_steps_status ON async_run_steps(status)`)

  // ── run_events ───────────────────────────────────────────────────────
  await db.run(`CREATE TABLE IF NOT EXISTS run_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL,
    step_name TEXT,
    event_type TEXT NOT NULL,
    message TEXT NOT NULL,
    data TEXT,
    emitted_at TEXT DEFAULT (datetime('now')),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`)
  await db.run(`CREATE INDEX IF NOT EXISTS idx_run_events_run_id ON run_events(run_id)`)
  await db.run(`CREATE INDEX IF NOT EXISTS idx_run_events_emitted_at ON run_events(emitted_at)`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(`DROP TABLE IF EXISTS run_events`)
  await db.run(`DROP TABLE IF EXISTS async_run_steps`)
  await db.run(`DROP TABLE IF EXISTS async_runs`)
}
