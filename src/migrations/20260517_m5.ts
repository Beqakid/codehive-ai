import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-d1-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // ── repo_memories ────────────────────────────────────────────────────────
  await db.run(`CREATE TABLE IF NOT EXISTS repo_memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL,
    repo_name TEXT NOT NULL,
    memory_type TEXT NOT NULL,
    content TEXT NOT NULL,
    confidence INTEGER,
    source_run_id TEXT,
    tags TEXT,
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`)
  await db.run(`CREATE INDEX IF NOT EXISTS idx_repo_memories_project_id ON repo_memories(project_id)`)
  await db.run(`CREATE INDEX IF NOT EXISTS idx_repo_memories_repo_name ON repo_memories(repo_name)`)

  // ── project_rules ────────────────────────────────────────────────────────
  await db.run(`CREATE TABLE IF NOT EXISTS project_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL,
    repo_name TEXT NOT NULL,
    rule TEXT NOT NULL,
    rule_type TEXT NOT NULL,
    severity TEXT NOT NULL,
    active INTEGER DEFAULT 1,
    source_run_id TEXT,
    added_by TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`)
  await db.run(`CREATE INDEX IF NOT EXISTS idx_project_rules_project_id ON project_rules(project_id)`)
  await db.run(`CREATE INDEX IF NOT EXISTS idx_project_rules_repo_name ON project_rules(repo_name)`)

  // ── learned_fixes ────────────────────────────────────────────────────────
  await db.run(`CREATE TABLE IF NOT EXISTS learned_fixes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL,
    repo_name TEXT NOT NULL,
    error_pattern TEXT NOT NULL,
    fix_description TEXT NOT NULL,
    fix_strategy TEXT NOT NULL,
    success_count INTEGER DEFAULT 0,
    fail_count INTEGER DEFAULT 0,
    confidence INTEGER,
    last_used TEXT,
    source_run_id TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`)
  await db.run(`CREATE INDEX IF NOT EXISTS idx_learned_fixes_project_id ON learned_fixes(project_id)`)
  await db.run(`CREATE INDEX IF NOT EXISTS idx_learned_fixes_repo_name ON learned_fixes(repo_name)`)

  // ── failure_patterns ─────────────────────────────────────────────────────
  await db.run(`CREATE TABLE IF NOT EXISTS failure_patterns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL,
    repo_name TEXT NOT NULL,
    fingerprint TEXT NOT NULL,
    category TEXT NOT NULL,
    pattern TEXT NOT NULL,
    occurrence_count INTEGER DEFAULT 1,
    last_seen TEXT,
    resolved INTEGER DEFAULT 0,
    resolution TEXT,
    source_run_id TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`)
  await db.run(`CREATE INDEX IF NOT EXISTS idx_failure_patterns_project_id ON failure_patterns(project_id)`)
  await db.run(`CREATE INDEX IF NOT EXISTS idx_failure_patterns_repo_name ON failure_patterns(repo_name)`)
  await db.run(`CREATE INDEX IF NOT EXISTS idx_failure_patterns_fingerprint ON failure_patterns(fingerprint)`)

  // ── agent_verdicts ───────────────────────────────────────────────────────
  await db.run(`CREATE TABLE IF NOT EXISTS agent_verdicts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL UNIQUE,
    project_id TEXT NOT NULL,
    implementation_confidence INTEGER,
    risk_score INTEGER,
    test_confidence INTEGER,
    reviewer_approval TEXT,
    production_readiness INTEGER,
    recommended_action TEXT,
    reviewer_reasons TEXT,
    risky_files TEXT,
    missing_tests TEXT,
    rollback_concerns TEXT,
    agent_scores TEXT,
    pipeline_duration_ms INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`)
  await db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_verdicts_run_id ON agent_verdicts(run_id)`)
  await db.run(`CREATE INDEX IF NOT EXISTS idx_agent_verdicts_project_id ON agent_verdicts(project_id)`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(`DROP TABLE IF EXISTS agent_verdicts`)
  await db.run(`DROP TABLE IF EXISTS failure_patterns`)
  await db.run(`DROP TABLE IF EXISTS learned_fixes`)
  await db.run(`DROP TABLE IF EXISTS project_rules`)
  await db.run(`DROP TABLE IF EXISTS repo_memories`)
}
