import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-d1-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // Create the lessons_learned table
  await db.run(`
    CREATE TABLE IF NOT EXISTS lessons_learned (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      error_category TEXT NOT NULL,
      error_pattern TEXT NOT NULL,
      fix_applied TEXT NOT NULL,
      files_changed TEXT,
      confidence REAL,
      success_count INTEGER DEFAULT 1,
      tags TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  await db.run(`
    CREATE INDEX IF NOT EXISTS idx_lessons_learned_project_id
    ON lessons_learned(project_id)
  `)

  await db.run(`
    CREATE INDEX IF NOT EXISTS idx_lessons_learned_error_category
    ON lessons_learned(error_category)
  `)

  // Add lessons_learned_id to the locked-documents relations table
  await db.run(`
    ALTER TABLE payload_locked_documents_rels
    ADD COLUMN lessons_learned_id INTEGER REFERENCES lessons_learned(id) ON DELETE CASCADE
  `)

  await db.run(`
    CREATE INDEX IF NOT EXISTS payload_locked_documents_rels_lessons_learned_id_idx
    ON payload_locked_documents_rels(lessons_learned_id)
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(`DROP TABLE IF EXISTS lessons_learned`)
}
