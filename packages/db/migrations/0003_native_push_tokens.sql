CREATE TABLE "native_push_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_user_id" text NOT NULL,
	"token" text NOT NULL,
	"platform" varchar(20) DEFAULT 'android' NOT NULL,
	"device_label" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	CONSTRAINT "uq_native_push_token" UNIQUE("token"),
	CONSTRAINT "chk_native_push_platform" CHECK ("native_push_tokens"."platform" in ('android'))
);
--> statement-breakpoint
ALTER TABLE "native_push_tokens" ADD CONSTRAINT "fk_native_push_auth_user" FOREIGN KEY ("auth_user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_native_push_auth_user" ON "native_push_tokens" USING btree ("auth_user_id");