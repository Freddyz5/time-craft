// Notifications: Web Push subscriptions.
import {
	foreignKey,
	index,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
	varchar,
} from "drizzle-orm/pg-core";
import { authUser } from "./auth";

// Web Push subscriptions of anyone signed in (parent or child). A
// notification goes to the auth_user_id of the family's parents and of the
// child.
export const pushSubscriptions = pgTable(
	"push_subscriptions",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		authUserId: text("auth_user_id").notNull(),
		endpoint: text("endpoint").notNull(),
		p256dhKey: text("p256dh_key").notNull(),
		authKey: text("auth_key").notNull(),
		deviceLabel: varchar("device_label", { length: 100 }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
	},
	(t) => [
		unique("uq_push_endpoint").on(t.endpoint),
		foreignKey({
			name: "fk_push_auth_user",
			columns: [t.authUserId],
			foreignColumns: [authUser.id],
		}).onDelete("cascade"),
		index("idx_push_auth_user").on(t.authUserId),
	],
);

export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type NewPushSubscription = typeof pushSubscriptions.$inferInsert;
