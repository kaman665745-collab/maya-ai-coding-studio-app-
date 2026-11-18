CREATE TABLE "agent_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" integer,
	"project_id" integer NOT NULL,
	"owner_uid" text NOT NULL,
	"agent_role" text NOT NULL,
	"model_id" text NOT NULL,
	"thinking_level" text DEFAULT 'MEDIUM' NOT NULL,
	"grounding_used" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'completed' NOT NULL,
	"input_summary" text NOT NULL,
	"output_summary" text DEFAULT '' NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"conversation_id" integer,
	"owner_uid" text NOT NULL,
	"agent_role" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"status" text DEFAULT 'awaiting_approval' NOT NULL,
	"plan_steps_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"proposal_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"checkpoint_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" integer NOT NULL,
	"project_id" integer,
	"actor_uid" text NOT NULL,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text NOT NULL,
	"details_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip_address" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "build_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"owner_uid" text NOT NULL,
	"command" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"exit_code" integer,
	"logs" text DEFAULT '' NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "checkpoints" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"owner_uid" text NOT NULL,
	"label" text NOT NULL,
	"reason" text DEFAULT 'Manual checkpoint' NOT NULL,
	"snapshot_json" jsonb NOT NULL,
	"storage_key" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"owner_uid" text NOT NULL,
	"title" text NOT NULL,
	"active_role" text DEFAULT 'coder' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "environments" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"owner_uid" text NOT NULL,
	"name" text NOT NULL,
	"runtime" text DEFAULT 'node-22-sandbox' NOT NULL,
	"cpu_limit_millicores" integer DEFAULT 500 NOT NULL,
	"memory_limit_mb" integer DEFAULT 256 NOT NULL,
	"timeout_ms" integer DEFAULT 15000 NOT NULL,
	"network_policy" text DEFAULT 'isolated-egress-deny' NOT NULL,
	"status" text DEFAULT 'stopped' NOT NULL,
	"preview_url" text,
	"last_active_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "file_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"file_id" integer NOT NULL,
	"path" text NOT NULL,
	"version_number" integer NOT NULL,
	"content" text NOT NULL,
	"sha256" text NOT NULL,
	"commit_message" text DEFAULT 'Snapshot' NOT NULL,
	"author_uid" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "git_connections" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"owner_uid" text NOT NULL,
	"provider" text DEFAULT 'local-git' NOT NULL,
	"repo_url" text DEFAULT '' NOT NULL,
	"default_branch" text DEFAULT 'main' NOT NULL,
	"current_branch" text DEFAULT 'main' NOT NULL,
	"last_commit_sha" text,
	"last_sync_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"project_id" integer NOT NULL,
	"role" text NOT NULL,
	"agent_role" text DEFAULT 'coder' NOT NULL,
	"model_id" text DEFAULT 'gemini-4-hydrogen' NOT NULL,
	"content" text NOT NULL,
	"metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_configs" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" integer NOT NULL,
	"owner_uid" text NOT NULL,
	"agent_role" text NOT NULL,
	"provider" text DEFAULT 'gemini' NOT NULL,
	"model_id" text NOT NULL,
	"thinking_level" text DEFAULT 'MEDIUM' NOT NULL,
	"search_grounding" boolean DEFAULT false NOT NULL,
	"is_default" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plugins" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" integer NOT NULL,
	"owner_uid" text NOT NULL,
	"manifest_id" text NOT NULL,
	"name" text NOT NULL,
	"version" text DEFAULT '1.0.0' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"permissions_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"config_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_files" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"path" text NOT NULL,
	"language" text DEFAULT 'typescript' NOT NULL,
	"content" text NOT NULL,
	"sha256" text NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"is_entry" boolean DEFAULT false NOT NULL,
	"updated_by_uid" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" integer NOT NULL,
	"owner_uid" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"template" text DEFAULT 'react-vite-ts' NOT NULL,
	"framework" text DEFAULT 'react' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"active_branch" text DEFAULT 'main' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_findings" (
	"id" serial PRIMARY KEY NOT NULL,
	"report_id" integer NOT NULL,
	"project_id" integer NOT NULL,
	"file_path" text NOT NULL,
	"line_start" integer DEFAULT 1 NOT NULL,
	"line_end" integer DEFAULT 1 NOT NULL,
	"severity" text DEFAULT 'medium' NOT NULL,
	"category" text DEFAULT 'quality' NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"suggested_patch" text,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"owner_uid" text NOT NULL,
	"target_path" text DEFAULT '*' NOT NULL,
	"model_id" text DEFAULT 'gemini-4-hydrogen' NOT NULL,
	"summary" text NOT NULL,
	"overall_status" text DEFAULT 'warnings' NOT NULL,
	"finding_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "test_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"owner_uid" text NOT NULL,
	"suite_name" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"total_count" integer DEFAULT 0 NOT NULL,
	"passed_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"logs" text DEFAULT '' NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "usage_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" integer NOT NULL,
	"project_id" integer,
	"owner_uid" text NOT NULL,
	"provider" text DEFAULT 'gemini' NOT NULL,
	"model_id" text NOT NULL,
	"agent_role" text NOT NULL,
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"latency_ms" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"uid" text NOT NULL,
	"email" text NOT NULL,
	"display_name" text DEFAULT 'Developer' NOT NULL,
	"avatar_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_uid_unique" UNIQUE("uid")
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_uid" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"plan" text DEFAULT 'standard' NOT NULL,
	"feature_flags_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_task_id_agent_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."agent_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_tasks" ADD CONSTRAINT "agent_tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_tasks" ADD CONSTRAINT "agent_tasks_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_tasks" ADD CONSTRAINT "agent_tasks_checkpoint_id_checkpoints_id_fk" FOREIGN KEY ("checkpoint_id") REFERENCES "public"."checkpoints"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "build_runs" ADD CONSTRAINT "build_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkpoints" ADD CONSTRAINT "checkpoints_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "environments" ADD CONSTRAINT "environments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_versions" ADD CONSTRAINT "file_versions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_versions" ADD CONSTRAINT "file_versions_file_id_project_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."project_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "git_connections" ADD CONSTRAINT "git_connections_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_configs" ADD CONSTRAINT "model_configs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plugins" ADD CONSTRAINT "plugins_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_files" ADD CONSTRAINT "project_files_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_uid_users_uid_fk" FOREIGN KEY ("owner_uid") REFERENCES "public"."users"("uid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_findings" ADD CONSTRAINT "review_findings_report_id_review_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."review_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_findings" ADD CONSTRAINT "review_findings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_reports" ADD CONSTRAINT "review_reports_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_owner_uid_users_uid_fk" FOREIGN KEY ("owner_uid") REFERENCES "public"."users"("uid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_agent_runs_project" ON "agent_runs" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_agent_tasks_project" ON "agent_tasks" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_agent_tasks_status" ON "agent_tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_workspace" ON "audit_logs" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_actor" ON "audit_logs" USING btree ("actor_uid");--> statement-breakpoint
CREATE INDEX "idx_build_runs_project" ON "build_runs" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_checkpoints_project" ON "checkpoints" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_conversations_project" ON "conversations" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_environments_project" ON "environments" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_file_versions_file" ON "file_versions" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "idx_file_versions_project" ON "file_versions" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_git_connections_project" ON "git_connections" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_messages_conversation" ON "messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "idx_messages_project" ON "messages" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_model_configs_workspace" ON "model_configs" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_model_configs_ws_role" ON "model_configs" USING btree ("workspace_id","agent_role");--> statement-breakpoint
CREATE INDEX "idx_plugins_workspace" ON "plugins" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_plugins_ws_manifest" ON "plugins" USING btree ("workspace_id","manifest_id");--> statement-breakpoint
CREATE INDEX "idx_project_files_project" ON "project_files" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_project_files_path" ON "project_files" USING btree ("project_id","path");--> statement-breakpoint
CREATE INDEX "idx_projects_workspace" ON "projects" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "idx_projects_owner_uid" ON "projects" USING btree ("owner_uid");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_projects_ws_slug" ON "projects" USING btree ("workspace_id","slug");--> statement-breakpoint
CREATE INDEX "idx_review_findings_report" ON "review_findings" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "idx_review_findings_project" ON "review_findings" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_review_reports_project" ON "review_reports" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_test_runs_project" ON "test_runs" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_usage_records_workspace" ON "usage_records" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "idx_usage_records_owner" ON "usage_records" USING btree ("owner_uid");--> statement-breakpoint
CREATE INDEX "idx_workspaces_owner_uid" ON "workspaces" USING btree ("owner_uid");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_workspaces_owner_slug" ON "workspaces" USING btree ("owner_uid","slug");