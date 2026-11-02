CREATE TABLE "custom_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"child_id" uuid NOT NULL,
	"text" varchar(200) NOT NULL,
	"parents_only" boolean DEFAULT false NOT NULL,
	"position" integer NOT NULL,
	"created_by_parent_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_custom_rules_text" CHECK (length(trim("custom_rules"."text")) > 0),
	CONSTRAINT "chk_custom_rules_position" CHECK ("custom_rules"."position" >= 0)
);
--> statement-breakpoint
ALTER TABLE "quota_policies" ADD COLUMN "allowed_days" smallint[] DEFAULT '{0,1,2,3,4,5,6}' NOT NULL;--> statement-breakpoint
ALTER TABLE "quota_policies" ADD COLUMN "grace_minutes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "grace_seconds" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "custom_rules" ADD CONSTRAINT "fk_custom_rules_child" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_rules" ADD CONSTRAINT "fk_custom_rules_created_by" FOREIGN KEY ("created_by_parent_id") REFERENCES "public"."parents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_custom_rules_child" ON "custom_rules" USING btree ("child_id","position");--> statement-breakpoint
ALTER TABLE "quota_policies" ADD CONSTRAINT "chk_quota_allowed_days" CHECK (cardinality("quota_policies"."allowed_days") BETWEEN 1 AND 7 AND "quota_policies"."allowed_days" <@ '{0,1,2,3,4,5,6}'::smallint[]);--> statement-breakpoint
ALTER TABLE "quota_policies" ADD CONSTRAINT "chk_quota_grace" CHECK ("quota_policies"."grace_minutes" >= 0);--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "chk_sessions_grace" CHECK ("sessions"."grace_seconds" >= 0);