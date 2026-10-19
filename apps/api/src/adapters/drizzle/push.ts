// Web Push subscriptions, one per browser (endpoint).
import type { PushSubscriptionRepository } from "@time-craft/core";
import { type Db, pushSubscriptions } from "@time-craft/db";
import { eq } from "drizzle-orm";

export function pushSubscriptionRepository(db: Db): PushSubscriptionRepository {
	return {
		async findByEndpoint(endpoint) {
			const [row] = await db
				.select()
				.from(pushSubscriptions)
				.where(eq(pushSubscriptions.endpoint, endpoint));
			return row ?? null;
		},
		async upsertByEndpoint(subscription) {
			const { id: _, endpoint: __, ...changes } = subscription;
			await db
				.insert(pushSubscriptions)
				.values(subscription)
				.onConflictDoUpdate({
					target: pushSubscriptions.endpoint,
					set: changes,
				});
		},
		async deleteByEndpoint(endpoint) {
			await db
				.delete(pushSubscriptions)
				.where(eq(pushSubscriptions.endpoint, endpoint));
		},
	};
}
