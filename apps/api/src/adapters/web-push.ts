// Web Push with VAPID. Runs after the use case committed (core ignores its
// errors), so it logs failures, and deletes subscriptions the push service no
// longer knows (404 or 410).
import type { Notifier, PushMessage } from "@time-craft/core";
import { type Db, pushSubscriptions } from "@time-craft/db";
import { eq, inArray } from "drizzle-orm";
import webpush from "web-push";

export interface VapidConfig {
	subject: string;
	publicKey: string;
	privateKey: string;
}

// A push nobody received within 15 minutes is stale (a warning, a request
// that already expired).
const TTL_SECONDS = 15 * 60;

// What the service worker receives (JSON).
export type PushPayload = PushMessage;

// web-push's sendNotification; tests pass a fake push service.
export type SendNotification = typeof webpush.sendNotification;

export class WebPushNotifier implements Notifier {
	constructor(
		private readonly db: Db,
		private readonly vapid: VapidConfig,
		private readonly sendNotification: SendNotification = webpush.sendNotification,
	) {}

	async send(
		authUserIds: readonly string[],
		message: PushMessage,
	): Promise<void> {
		if (authUserIds.length === 0) {
			return;
		}
		const subscriptions = await this.db
			.select()
			.from(pushSubscriptions)
			.where(inArray(pushSubscriptions.authUserId, [...authUserIds]));
		const payload = JSON.stringify(message satisfies PushPayload);
		await Promise.all(
			subscriptions.map(async (subscription) => {
				try {
					await this.sendNotification(
						{
							endpoint: subscription.endpoint,
							keys: {
								p256dh: subscription.p256dhKey,
								auth: subscription.authKey,
							},
						},
						payload,
						{
							vapidDetails: this.vapid,
							TTL: TTL_SECONDS,
							urgency: "high",
						},
					);
				} catch (error) {
					await this.handleFailure(subscription.endpoint, error);
					return;
				}
				await this.db
					.update(pushSubscriptions)
					.set({ lastUsedAt: new Date() })
					.where(eq(pushSubscriptions.id, subscription.id))
					.catch((error: unknown) =>
						console.error("Could not update a push subscription", error),
					);
			}),
		);
	}

	private async handleFailure(endpoint: string, error: unknown) {
		const gone =
			error instanceof webpush.WebPushError &&
			(error.statusCode === 404 || error.statusCode === 410);
		if (!gone) {
			// The endpoint is the subscription's address: log only its host.
			console.error("Push failed", { service: new URL(endpoint).host, error });
			return;
		}
		try {
			await this.db
				.delete(pushSubscriptions)
				.where(eq(pushSubscriptions.endpoint, endpoint));
		} catch (deleteError) {
			console.error("Could not delete a stale push subscription", deleteError);
		}
	}
}
