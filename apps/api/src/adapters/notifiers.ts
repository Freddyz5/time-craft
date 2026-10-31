// Sends each message through every channel: Web Push for browsers and
// Firebase Cloud Messaging for the Android app. One failing channel does not
// stop the others (core ignores the notifier's errors anyway).
import type { Notifier, PushMessage } from "@time-craft/core";

export class FanOutNotifier implements Notifier {
	constructor(private readonly notifiers: readonly Notifier[]) {}

	async send(
		authUserIds: readonly string[],
		message: PushMessage,
	): Promise<void> {
		await Promise.all(
			this.notifiers.map((notifier) =>
				notifier
					.send(authUserIds, message)
					.catch((error: unknown) => console.error("A notifier failed", error)),
			),
		);
	}
}
