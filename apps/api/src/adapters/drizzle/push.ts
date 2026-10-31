// Web Push subscriptions, one per browser (endpoint).
import type {
	NativePushTokenRepository,
	PushSubscriptionRepository,
} from "@time-craft/core";
import { type Db, nativePushTokens, pushSubscriptions } from "@time-craft/db";
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

// The Android app's push tokens, one per installed app.
export function nativePushTokenRepository(db: Db): NativePushTokenRepository {
	return {
		async findByToken(token) {
			const [row] = await db
				.select()
				.from(nativePushTokens)
				.where(eq(nativePushTokens.token, token));
			return row ?? null;
		},
		async upsertByToken(saved) {
			const { id: _, token: __, ...changes } = saved;
			await db
				.insert(nativePushTokens)
				.values(saved)
				.onConflictDoUpdate({ target: nativePushTokens.token, set: changes });
		},
		async deleteByToken(token) {
			await db
				.delete(nativePushTokens)
				.where(eq(nativePushTokens.token, token));
		},
	};
}
