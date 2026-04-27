import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload: _payload, req: _req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`commands\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`prompt\` text NOT NULL,
  	\`mode\` text DEFAULT 'plan_only' NOT NULL,
  	\`status\` text DEFAULT 'pending' NOT NULL,
  	\`project_id\` integer,
  	\`coding_request_id\` integer,
  	\`submitted_by_id\` integer,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`project_id\`) REFERENCES \`projects\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`coding_request_id\`) REFERENCES \`coding_requests\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`submitted_by_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`commands_project_idx\` ON \`commands\` (\`project_id\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`commands_coding_request_idx\` ON \`commands\` (\`coding_request_id\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`commands_submitted_by_idx\` ON \`commands\` (\`submitted_by_id\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`commands_status_idx\` ON \`commands\` (\`status\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`commands_updated_at_idx\` ON \`commands\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`commands_created_at_idx\` ON \`commands\` (\`created_at\`);`)

  await db.run(sql`CREATE TABLE IF NOT EXISTS \`runs\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`command_id\` integer NOT NULL,
  	\`status\` text DEFAULT 'pending' NOT NULL,
  	\`mode\` text,
  	\`logs\` text,
  	\`pr_url\` text,
  	\`plan_id\` numeric,
  	\`error\` text,
  	\`started_at\` text,
  	\`completed_at\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`command_id\`) REFERENCES \`commands\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`runs_command_idx\` ON \`runs\` (\`command_id\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`runs_status_idx\` ON \`runs\` (\`status\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`runs_updated_at_idx\` ON \`runs\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`runs_created_at_idx\` ON \`runs\` (\`created_at\`);`)

  // Add new rels to payload_locked_documents_rels (ignore if column already exists)
  try {
    await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`commands_id\` integer REFERENCES commands(id);`)
  } catch (_e) { /* column may already exist */ }
  try {
    await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`runs_id\` integer REFERENCES runs(id);`)
  } catch (_e) { /* column may already exist */ }
  try {
    await db.run(sql`CREATE INDEX IF NOT EXISTS \`payload_locked_documents_rels_commands_id_idx\` ON \`payload_locked_documents_rels\` (\`commands_id\`);`)
  } catch (_e) { /* index may already exist */ }
  try {
    await db.run(sql`CREATE INDEX IF NOT EXISTS \`payload_locked_documents_rels_runs_id_idx\` ON \`payload_locked_documents_rels\` (\`runs_id\`);`)
  } catch (_e) { /* index may already exist */ }
}

export async function down({ db, payload: _payload, req: _req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE IF EXISTS \`commands\`;`)
  await db.run(sql`DROP TABLE IF EXISTS \`runs\`;`)
}
