import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`projects\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`name\` text NOT NULL,
  	\`description\` text,
  	\`status\` text DEFAULT 'active',
  	\`owner_id\` integer NOT NULL,
  	\`repo_url\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`owner_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`projects_owner_idx\` ON \`projects\` (\`owner_id\`);`)
  await db.run(sql`CREATE INDEX \`projects_updated_at_idx\` ON \`projects\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`projects_created_at_idx\` ON \`projects\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`coding_requests\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`title\` text NOT NULL,
  	\`description\` text NOT NULL,
  	\`project_id\` integer NOT NULL,
  	\`requested_by_id\` integer NOT NULL,
  	\`status\` text DEFAULT 'draft',
  	\`priority\` text DEFAULT 'medium',
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`project_id\`) REFERENCES \`projects\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`requested_by_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`coding_requests_project_idx\` ON \`coding_requests\` (\`project_id\`);`)
  await db.run(sql`CREATE INDEX \`coding_requests_requested_by_idx\` ON \`coding_requests\` (\`requested_by_id\`);`)
  await db.run(sql`CREATE INDEX \`coding_requests_updated_at_idx\` ON \`coding_requests\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`coding_requests_created_at_idx\` ON \`coding_requests\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`agent_plans\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`coding_request_id\` integer NOT NULL,
  	\`product_spec\` text NOT NULL,
  	\`architecture_design\` text NOT NULL,
  	\`review_feedback\` text NOT NULL,
  	\`final_plan\` text NOT NULL,
  	\`status\` text DEFAULT 'draft',
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`coding_request_id\`) REFERENCES \`coding_requests\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`agent_plans_coding_request_idx\` ON \`agent_plans\` (\`coding_request_id\`);`)
  await db.run(sql`CREATE INDEX \`agent_plans_updated_at_idx\` ON \`agent_plans\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`agent_plans_created_at_idx\` ON \`agent_plans\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`agent_runs\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`agent_name\` text NOT NULL,
  	\`coding_request_id\` integer NOT NULL,
  	\`status\` text DEFAULT 'running',
  	\`input\` text,
  	\`output\` text,
  	\`duration_ms\` numeric,
  	\`error_message\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`coding_request_id\`) REFERENCES \`coding_requests\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`agent_runs_coding_request_idx\` ON \`agent_runs\` (\`coding_request_id\`);`)
  await db.run(sql`CREATE INDEX \`agent_runs_updated_at_idx\` ON \`agent_runs\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`agent_runs_created_at_idx\` ON \`agent_runs\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`tool_connections\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`name\` text NOT NULL,
  	\`type\` text NOT NULL,
  	\`status\` text DEFAULT 'active',
  	\`config\` text,
  	\`project_id\` integer,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`project_id\`) REFERENCES \`projects\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`tool_connections_project_idx\` ON \`tool_connections\` (\`project_id\`);`)
  await db.run(sql`CREATE INDEX \`tool_connections_updated_at_idx\` ON \`tool_connections\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`tool_connections_created_at_idx\` ON \`tool_connections\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`payload_kv\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`key\` text NOT NULL,
  	\`data\` text NOT NULL
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`payload_kv_key_idx\` ON \`payload_kv\` (\`key\`);`)
  await db.run(sql`ALTER TABLE \`users\` ADD \`role\` text DEFAULT 'viewer' NOT NULL;`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`projects_id\` integer REFERENCES projects(id);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`coding_requests_id\` integer REFERENCES coding_requests(id);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`agent_plans_id\` integer REFERENCES agent_plans(id);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`agent_runs_id\` integer REFERENCES agent_runs(id);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`tool_connections_id\` integer REFERENCES tool_connections(id);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_projects_id_idx\` ON \`payload_locked_documents_rels\` (\`projects_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_coding_requests_id_idx\` ON \`payload_locked_documents_rels\` (\`coding_requests_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_agent_plans_id_idx\` ON \`payload_locked_documents_rels\` (\`agent_plans_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_agent_runs_id_idx\` ON \`payload_locked_documents_rels\` (\`agent_runs_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_tool_connections_id_idx\` ON \`payload_locked_documents_rels\` (\`tool_connections_id\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`projects\`;`)
  await db.run(sql`DROP TABLE \`coding_requests\`;`)
  await db.run(sql`DROP TABLE \`agent_plans\`;`)
  await db.run(sql`DROP TABLE \`agent_runs\`;`)
  await db.run(sql`DROP TABLE \`tool_connections\`;`)
  await db.run(sql`DROP TABLE \`payload_kv\`;`)
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_payload_locked_documents_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`users_id\` integer,
  	\`media_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_locked_documents\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`media_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_payload_locked_documents_rels\`("id", "order", "parent_id", "path", "users_id", "media_id") SELECT "id", "order", "parent_id", "path", "users_id", "media_id" FROM \`payload_locked_documents_rels\`;`)
  await db.run(sql`DROP TABLE \`payload_locked_documents_rels\`;`)
  await db.run(sql`ALTER TABLE \`__new_payload_locked_documents_rels\` RENAME TO \`payload_locked_documents_rels\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_order_idx\` ON \`payload_locked_documents_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_parent_idx\` ON \`payload_locked_documents_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_path_idx\` ON \`payload_locked_documents_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_users_id_idx\` ON \`payload_locked_documents_rels\` (\`users_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_media_id_idx\` ON \`payload_locked_documents_rels\` (\`media_id\`);`)
  await db.run(sql`ALTER TABLE \`users\` DROP COLUMN \`role\`;`)
}
