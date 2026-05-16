import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-d1-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // ── workspace_runs ───────────────────────────────────────────────────────
  await db.run(`CREATE TABLE IF NOT EXISTS workspace_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    provider TEXT DEFAULT 'github',
    status TEXT DEFAULT 'creating',
    branch_name TEXT NOT NULL,
    repo_owner TEXT NOT NULL,
    repo_name TEXT NOT NULL,
    base_branch TEXT DEFAULT 'main',
    last_heartbeat INTEGER,
    expires_at INTEGER,
    file_count INTEGER DEFAULT 0,
    metadata TEXT,
    cleanup_result TEXT,
    duration_ms INTEGER,
    error_message TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`)
  await db.run(`CREATE INDEX IF NOT EXISTS idx_workspace_runs_workspace_id ON workspace_runs(workspace_id)`)
  await db.run(`CREATE INDEX IF NOT EXISTS idx_workspace_runs_run_id ON workspace_runs(run_id)`)
  await db.run(`CREATE INDEX IF NOT EXISTS idx_workspace_runs_project_id ON workspace_runs(project_id)`)

  // ── execution_steps ──────────────────────────────────────────────────────
  await db.run(`CREATE TABLE IF NOT EXISTS execution_steps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    step TEXT NOT NULL,
    command TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    exit_code INTEGER DEFAULT -1,
    stdout TEXT,
    stderr TEXT,
    duration_ms INTEGER DEFAULT 0,
    started_at INTEGER,
    completed_at INTEGER,
    retry_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`)
  await db.run(`CREATE INDEX IF NOT EXISTS idx_execution_steps_run_id ON execution_steps(run_id)`)
  await db.run(`CREATE INDEX IF NOT EXISTS idx_execution_steps_workspace_id ON execution_steps(workspace_id)`)

  // ── artifact_records ─────────────────────────────────────────────────────
  await db.run(`CREATE TABLE IF NOT EXISTS artifact_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    artifact_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    type TEXT NOT NULL,
    r2_key TEXT NOT NULL,
    size_bytes INTEGER DEFAULT 0,
    mime_type TEXT DEFAULT 'application/octet-stream',
    expires_at INTEGER,
    metadata TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`)
  await db.run(`CREATE INDEX IF NOT EXISTS idx_artifact_records_artifact_id ON artifact_records(artifact_id)`)
  await db.run(`CREATE INDEX IF NOT EXISTS idx_artifact_records_run_id ON artifact_records(run_id)`)
  await db.run(`CREATE INDEX IF NOT EXISTS idx_artifact_records_project_id ON artifact_records(project_id)`)

  // ── replay_sessions ──────────────────────────────────────────────────────
  await db.run(`CREATE TABLE IF NOT EXISTS replay_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    status TEXT DEFAULT 'recording',
    started_at INTEGER,
    completed_at INTEGER,
    events TEXT,
    total_steps INTEGER DEFAULT 0,
    failed_steps INTEGER DEFAULT 0,
    heal_attempts INTEGER DEFAULT 0,
    metadata TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`)
  await db.run(`CREATE INDEX IF NOT EXISTS idx_replay_sessions_session_id ON replay_sessions(session_id)`)
  await db.run(`CREATE INDEX IF NOT EXISTS idx_replay_sessions_run_id ON replay_sessions(run_id)`)

  // ── healing_attempts ─────────────────────────────────────────────────────
  await db.run(`CREATE TABLE IF NOT EXISTS healing_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    attempt_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    strategy TEXT NOT NULL,
    target_file TEXT,
    error_message TEXT,
    suggested_fix TEXT,
    patch_generated TEXT,
    outcome TEXT DEFAULT 'skipped',
    duration_ms INTEGER DEFAULT 0,
    attempt_number INTEGER DEFAULT 1,
    max_attempts INTEGER DEFAULT 3,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`)
  await db.run(`CREATE INDEX IF NOT EXISTS idx_healing_attempts_attempt_id ON healing_attempts(attempt_id)`)
  await db.run(`CREATE INDEX IF NOT EXISTS idx_healing_attempts_run_id ON healing_attempts(run_id)`)

  // ── command_executions ───────────────────────────────────────────────────
  await db.run(`CREATE TABLE IF NOT EXISTS command_executions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    command TEXT NOT NULL,
    step TEXT,
    exit_code INTEGER DEFAULT -1,
    stdout TEXT,
    stderr TEXT,
    duration_ms INTEGER DEFAULT 0,
    started_at INTEGER,
    completed_at INTEGER,
    allowed INTEGER DEFAULT 1,
    metadata TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`)
  await db.run(`CREATE INDEX IF NOT EXISTS idx_command_executions_run_id ON command_executions(run_id)`)
  await db.run(`CREATE INDEX IF NOT EXISTS idx_command_executions_workspace_id ON command_executions(workspace_id)`)

  // ── workspace_snapshots ──────────────────────────────────────────────────
  await db.run(`CREATE TABLE IF NOT EXISTS workspace_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    phase TEXT NOT NULL,
    files_snapshot TEXT,
    commit_sha TEXT,
    file_count INTEGER DEFAULT 0,
    metadata TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`)
  await db.run(`CREATE INDEX IF NOT EXISTS idx_workspace_snapshots_snapshot_id ON workspace_snapshots(snapshot_id)`)
  await db.run(`CREATE INDEX IF NOT EXISTS idx_workspace_snapshots_workspace_id ON workspace_snapshots(workspace_id)`)
  await db.run(`CREATE INDEX IF NOT EXISTS idx_workspace_snapshots_run_id ON workspace_snapshots(run_id)`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(`DROP TABLE IF EXISTS workspace_snapshots`)
  await db.run(`DROP TABLE IF EXISTS command_executions`)
  await db.run(`DROP TABLE IF EXISTS healing_attempts`)
  await db.run(`DROP TABLE IF EXISTS replay_sessions`)
  await db.run(`DROP TABLE IF EXISTS artifact_records`)
  await db.run(`DROP TABLE IF EXISTS execution_steps`)
  await db.run(`DROP TABLE IF EXISTS workspace_runs`)
}
