import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload: _payload, req: _req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`commands\` (
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
  await db.run(sql`CREATE INDEX \`commands_project_idx\` ON \`commands\` (\`project_id\`);`)
  await db.run(sql`CREATE INDEX \`commands_coding_request_idx\` ON \`commands\` (\`coding_request_id\`);`)
  await db.run(sql`CREATE INDEX \`commands_submitted_by_idx\` ON \`commands\` (\`submitted_by_id\`);`)
  await db.run(sql`CREATE INDEX \`commands_status_idx\` ON \`commands\` (\`status\`);`)
  await db.run(sql`CREATE INDEX \`commands_updated_at_idx\` ON \`commands\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`commands_created_at_idx\` ON \`commands\` (\`created_at\`);`)

  await db.run(sql`CREATE TABLE \`runs\` (
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
  await db.run(sql`CREATE INDEX \`runs_command_idx\` ON \`runs\` (\`command_id\`);`)
  await db.run(sql`CREATE INDEX \`runs_status_idx\` ON \`runs\` (\`status\`);`)
  await db.run(sql`CREATE INDEX \`runs_updated_at_idx\` ON \`runs\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`runs_created_at_idx\` ON \`runs\` (\`created_at\`);`)

  // Add new rels to payload_locked_documents_rels
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`commands_id\` integer REFERENCES commands(id);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`runs_id\` integer REFERENCES runs(id);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_commands_id_idx\` ON \`payload_locked_documents_rels\` (\`commands_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_runs_id_idx\` ON \`payload_locked_documents_rels\` (\`runs_id\`);`)
}

export async function down({ db, payload: _payload, req: _req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`commands\`;`)
  await db.run(sql`DROP TABLE \`runs\`;`)
}
