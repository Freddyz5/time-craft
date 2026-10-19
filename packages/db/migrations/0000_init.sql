CREATE TABLE "auth_account" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"password" text,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_rate_limit" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "uq_auth_rate_limit_key" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "auth_session" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_auth_session_token" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "auth_user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"username" text,
	"display_username" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_auth_user_email" UNIQUE("email"),
	CONSTRAINT "uq_auth_user_username" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "auth_verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bonus_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"name" varchar(80) NOT NULL,
	"description" varchar(255),
	"reward_minutes" integer NOT NULL,
	"max_per_week" smallint,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by_parent_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_bonus_reward" CHECK ("bonus_tasks"."reward_minutes" > 0),
	CONSTRAINT "chk_bonus_max" CHECK ("bonus_tasks"."max_per_week" IS NULL OR "bonus_tasks"."max_per_week" > 0)
);
--> statement-breakpoint
CREATE TABLE "task_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"child_id" uuid NOT NULL,
	"bonus_task_id" uuid NOT NULL,
	"note" varchar(200),
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"awarded_minutes" integer,
	"review_note" varchar(200),
	"reported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_by_parent_id" uuid,
	"reviewed_at" timestamp with time zone,
	CONSTRAINT "chk_reports_status" CHECK ("task_reports"."status" IN ('pending', 'approved', 'rejected')),
	CONSTRAINT "chk_reports_awarded" CHECK (("task_reports"."status" = 'approved' AND "task_reports"."awarded_minutes" > 0) OR ("task_reports"."status" <> 'approved' AND "task_reports"."awarded_minutes" IS NULL)),
	CONSTRAINT "chk_reports_reviewer" CHECK ("task_reports"."status" = 'pending' OR "task_reports"."reviewed_by_parent_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"code" varchar(30) NOT NULL,
	"name" varchar(60) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "uq_activities_family_code" UNIQUE("family_id","code")
);
--> statement-breakpoint
CREATE TABLE "children" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"auth_user_id" text NOT NULL,
	"name" varchar(100) NOT NULL,
	"avatar" varchar(60),
	"failed_pin_attempts" smallint DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_children_auth_user" UNIQUE("auth_user_id")
);
--> statement-breakpoint
CREATE TABLE "families" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"timezone" varchar(64) DEFAULT 'America/Guayaquil' NOT NULL,
	"week_start_day" smallint DEFAULT 1 NOT NULL,
	"request_expiry_minutes" integer DEFAULT 15 NOT NULL,
	"auto_close_after_minutes" integer DEFAULT 30 NOT NULL,
	"recovery_code_hash" text,
	"recovery_code_created_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_families_week_start" CHECK ("families"."week_start_day" BETWEEN 0 AND 6),
	CONSTRAINT "chk_families_expiry" CHECK ("families"."request_expiry_minutes" > 0),
	CONSTRAINT "chk_families_auto_close" CHECK ("families"."auto_close_after_minutes" > 0)
);
--> statement-breakpoint
CREATE TABLE "parents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"auth_user_id" text NOT NULL,
	"name" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_parents_auth_user" UNIQUE("auth_user_id")
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_user_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh_key" text NOT NULL,
	"auth_key" text NOT NULL,
	"device_label" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	CONSTRAINT "uq_push_endpoint" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "child_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"child_id" uuid NOT NULL,
	"request_type" varchar(20) NOT NULL,
	"activity_id" uuid NOT NULL,
	"requested_minutes" integer NOT NULL,
	"reason" text,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"approved_minutes" integer,
	"response_note" varchar(200),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"resolved_by_parent_id" uuid,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "chk_requests_type" CHECK ("child_requests"."request_type" IN ('start', 'extra_time')),
	CONSTRAINT "chk_requests_status" CHECK ("child_requests"."status" IN ('pending', 'approved', 'rejected', 'expired', 'cancelled')),
	CONSTRAINT "chk_requests_minutes" CHECK ("child_requests"."requested_minutes" > 0),
	CONSTRAINT "chk_requests_reason" CHECK ("child_requests"."request_type" <> 'extra_time' OR length(trim(coalesce("child_requests"."reason", ''))) > 0),
	CONSTRAINT "chk_requests_approved" CHECK (("child_requests"."status" = 'approved' AND "child_requests"."approved_minutes" > 0) OR ("child_requests"."status" <> 'approved' AND "child_requests"."approved_minutes" IS NULL)),
	CONSTRAINT "chk_requests_resolver" CHECK ("child_requests"."status" NOT IN ('approved', 'rejected') OR "child_requests"."resolved_by_parent_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "quota_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"child_id" uuid NOT NULL,
	"request_id" uuid,
	"granted_by_parent_id" uuid NOT NULL,
	"extra_minutes" integer NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_override_request" UNIQUE("request_id"),
	CONSTRAINT "chk_override_minutes" CHECK ("quota_overrides"."extra_minutes" > 0),
	CONSTRAINT "chk_override_reason" CHECK (length(trim("quota_overrides"."reason")) > 0)
);
--> statement-breakpoint
CREATE TABLE "quota_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"child_id" uuid NOT NULL,
	"activity_id" uuid,
	"daily_limit_minutes" integer NOT NULL,
	"weekly_limit_minutes" integer NOT NULL,
	"weekly_bonus_cap_minutes" integer DEFAULT 60 NOT NULL,
	"carry_over_excess" boolean DEFAULT false NOT NULL,
	"warning_minutes" integer DEFAULT 5 NOT NULL,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_to" timestamp with time zone,
	"created_by_parent_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_quota_limits" CHECK ("quota_policies"."daily_limit_minutes" > 0 AND "quota_policies"."weekly_limit_minutes" >= "quota_policies"."daily_limit_minutes"),
	CONSTRAINT "chk_quota_bonus_cap" CHECK ("quota_policies"."weekly_bonus_cap_minutes" >= 0),
	CONSTRAINT "chk_quota_warning" CHECK ("quota_policies"."warning_minutes" >= 0)
);
--> statement-breakpoint
CREATE TABLE "session_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"alert_type" varchar(20) NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"provider_message_id" varchar(100),
	"sent_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	CONSTRAINT "chk_alerts_type" CHECK ("session_alerts"."alert_type" IN ('start', 'warning', 'end', 'auto_close')),
	CONSTRAINT "chk_alerts_final" CHECK ("session_alerts"."sent_at" IS NULL OR "session_alerts"."cancelled_at" IS NULL)
);
--> statement-breakpoint
CREATE TABLE "session_pauses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"paused_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resumed_at" timestamp with time zone,
	"paused_by_parent_id" uuid NOT NULL,
	"resumed_by_parent_id" uuid,
	"reason" varchar(120),
	CONSTRAINT "chk_pauses_order" CHECK ("session_pauses"."resumed_at" IS NULL OR "session_pauses"."resumed_at" >= "session_pauses"."paused_at")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"child_id" uuid NOT NULL,
	"activity_id" uuid NOT NULL,
	"request_id" uuid,
	"override_id" uuid,
	"status" varchar(20) NOT NULL,
	"scheduled_start_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"planned_duration_seconds" integer NOT NULL,
	"ended_at" timestamp with time zone,
	"end_reason" varchar(20),
	"consumed_seconds" integer,
	"started_by_parent_id" uuid NOT NULL,
	"ended_by_parent_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_sessions_request" UNIQUE("request_id"),
	CONSTRAINT "chk_sessions_status" CHECK ("sessions"."status" IN ('scheduled', 'running', 'paused', 'finished', 'cancelled')),
	CONSTRAINT "chk_sessions_end_reason" CHECK ("sessions"."end_reason" IS NULL OR "sessions"."end_reason" IN ('completed', 'stopped_early', 'auto_closed')),
	CONSTRAINT "chk_sessions_planned" CHECK ("sessions"."planned_duration_seconds" > 0),
	CONSTRAINT "chk_sessions_start" CHECK (("sessions"."status" = 'scheduled' AND "sessions"."scheduled_start_at" IS NOT NULL AND "sessions"."started_at" IS NULL)
			OR ("sessions"."status" IN ('running', 'paused', 'finished') AND "sessions"."started_at" IS NOT NULL)
			OR ("sessions"."status" = 'cancelled' AND "sessions"."started_at" IS NULL AND "sessions"."scheduled_start_at" IS NOT NULL)),
	CONSTRAINT "chk_sessions_end" CHECK (("sessions"."status" = 'finished' AND "sessions"."ended_at" IS NOT NULL AND "sessions"."end_reason" IS NOT NULL AND "sessions"."consumed_seconds" IS NOT NULL)
			OR ("sessions"."status" = 'cancelled' AND "sessions"."ended_at" IS NOT NULL AND "sessions"."ended_by_parent_id" IS NOT NULL AND "sessions"."end_reason" IS NULL AND "sessions"."consumed_seconds" IS NULL)
			OR ("sessions"."status" IN ('scheduled', 'running', 'paused') AND "sessions"."ended_at" IS NULL AND "sessions"."end_reason" IS NULL AND "sessions"."consumed_seconds" IS NULL)),
	CONSTRAINT "chk_sessions_ender" CHECK ("sessions"."end_reason" IS NULL OR "sessions"."end_reason" = 'auto_closed' OR "sessions"."ended_by_parent_id" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "auth_account" ADD CONSTRAINT "fk_auth_account_user" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_session" ADD CONSTRAINT "fk_auth_session_user" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bonus_tasks" ADD CONSTRAINT "fk_bonus_family" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bonus_tasks" ADD CONSTRAINT "fk_bonus_created_by" FOREIGN KEY ("created_by_parent_id") REFERENCES "public"."parents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_reports" ADD CONSTRAINT "fk_reports_child" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_reports" ADD CONSTRAINT "fk_reports_task" FOREIGN KEY ("bonus_task_id") REFERENCES "public"."bonus_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_reports" ADD CONSTRAINT "fk_reports_reviewed_by" FOREIGN KEY ("reviewed_by_parent_id") REFERENCES "public"."parents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "fk_activities_family" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "children" ADD CONSTRAINT "fk_children_family" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "children" ADD CONSTRAINT "fk_children_auth_user" FOREIGN KEY ("auth_user_id") REFERENCES "public"."auth_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parents" ADD CONSTRAINT "fk_parents_family" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parents" ADD CONSTRAINT "fk_parents_auth_user" FOREIGN KEY ("auth_user_id") REFERENCES "public"."auth_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "fk_push_auth_user" FOREIGN KEY ("auth_user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_requests" ADD CONSTRAINT "fk_requests_child" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_requests" ADD CONSTRAINT "fk_requests_activity" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_requests" ADD CONSTRAINT "fk_requests_resolved_by" FOREIGN KEY ("resolved_by_parent_id") REFERENCES "public"."parents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quota_overrides" ADD CONSTRAINT "fk_override_child" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quota_overrides" ADD CONSTRAINT "fk_override_request" FOREIGN KEY ("request_id") REFERENCES "public"."child_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quota_overrides" ADD CONSTRAINT "fk_override_granted_by" FOREIGN KEY ("granted_by_parent_id") REFERENCES "public"."parents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quota_policies" ADD CONSTRAINT "fk_quota_child" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quota_policies" ADD CONSTRAINT "fk_quota_activity" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quota_policies" ADD CONSTRAINT "fk_quota_created_by" FOREIGN KEY ("created_by_parent_id") REFERENCES "public"."parents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_alerts" ADD CONSTRAINT "fk_alerts_session" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_pauses" ADD CONSTRAINT "fk_pauses_session" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_pauses" ADD CONSTRAINT "fk_pauses_paused_by" FOREIGN KEY ("paused_by_parent_id") REFERENCES "public"."parents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_pauses" ADD CONSTRAINT "fk_pauses_resumed_by" FOREIGN KEY ("resumed_by_parent_id") REFERENCES "public"."parents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "fk_sessions_child" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "fk_sessions_activity" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "fk_sessions_request" FOREIGN KEY ("request_id") REFERENCES "public"."child_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "fk_sessions_override" FOREIGN KEY ("override_id") REFERENCES "public"."quota_overrides"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "fk_sessions_started_by" FOREIGN KEY ("started_by_parent_id") REFERENCES "public"."parents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "fk_sessions_ended_by" FOREIGN KEY ("ended_by_parent_id") REFERENCES "public"."parents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_auth_account_user" ON "auth_account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_auth_session_user" ON "auth_session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_reports_child_reported" ON "task_reports" USING btree ("child_id","reported_at");--> statement-breakpoint
CREATE INDEX "idx_reports_status" ON "task_reports" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_reports_one_pending" ON "task_reports" USING btree ("child_id","bonus_task_id") WHERE "task_reports"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "idx_children_family" ON "children" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "idx_parents_family" ON "parents" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "idx_push_auth_user" ON "push_subscriptions" USING btree ("auth_user_id");--> statement-breakpoint
CREATE INDEX "idx_requests_child_status" ON "child_requests" USING btree ("child_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_requests_one_pending" ON "child_requests" USING btree ("child_id") WHERE "child_requests"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "idx_overrides_child" ON "quota_overrides" USING btree ("child_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_quota_child" ON "quota_policies" USING btree ("child_id","valid_from");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_quota_current" ON "quota_policies" USING btree ("child_id",COALESCE("activity_id", '00000000-0000-0000-0000-000000000000'::uuid)) WHERE "quota_policies"."valid_to" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_alerts_session" ON "session_alerts" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_pauses_session" ON "session_pauses" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_pauses_one_open" ON "session_pauses" USING btree ("session_id") WHERE "session_pauses"."resumed_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_sessions_child_started" ON "sessions" USING btree ("child_id","started_at");--> statement-breakpoint
CREATE INDEX "idx_sessions_status" ON "sessions" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_sessions_one_active" ON "sessions" USING btree ("child_id") WHERE "sessions"."status" IN ('scheduled', 'running', 'paused');