CREATE TABLE "hidden_rules" (
	"child_id" uuid NOT NULL,
	"rule_key" varchar(30) NOT NULL,
	"hidden_by_parent_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_hidden_rules" PRIMARY KEY("child_id","rule_key"),
	CONSTRAINT "chk_hidden_rules_key" CHECK ("hidden_rules"."rule_key" IN ('limits', 'days', 'bonus', 'warning', 'grace', 'carry_over', 'one_session', 'request_wait', 'week_change'))
);
--> statement-breakpoint
ALTER TABLE "hidden_rules" ADD CONSTRAINT "fk_hidden_rules_child" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hidden_rules" ADD CONSTRAINT "fk_hidden_rules_hidden_by" FOREIGN KEY ("hidden_by_parent_id") REFERENCES "public"."parents"("id") ON DELETE no action ON UPDATE no action;