import { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-d1-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // Create project_memory table
  await db.run(`CREATE TABLE IF NOT EXISTS "project_memory" (
    "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    "project_id" integer REFERENCES projects(id),
    "type" text DEFAULT 'context',
    "summary" text NOT NULL,
    "content" text NOT NULL,
    "importance" text DEFAULT 'medium',
    "tags" text,
    "source" text DEFAULT 'agent',
    "updated_at" text DEFAULT (datetime('now')) NOT NULL,
    "created_at" text DEFAULT (datetime('now')) NOT NULL
  )`)

  // Indexes
  await db.run(`CREATE INDEX IF NOT EXISTS "project_memory_project_idx" ON "project_memory" ("project_id")`)
  await db.run(`CREATE INDEX IF NOT EXISTS "project_memory_importance_idx" ON "project_memory" ("importance")`)
  await db.run(`CREATE INDEX IF NOT EXISTS "project_memory_created_at_idx" ON "project_memory" ("created_at")`)

  // Add project_memory_id column to payload_locked_documents_rels (required by Payload)
  await db.run(`ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "project_memory_id" integer REFERENCES project_memory(id)`)
  await db.run(`CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_project_memory_id_idx" ON "payload_locked_documents_rels" ("project_memory_id")`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(`DROP TABLE IF EXISTS "project_memory"`)
}
