import { beforeEach, describe, expect, spyOn, test } from "bun:test";
import { messages } from "@time-craft/core";
import { pushSubscriptions } from "@time-craft/db";
import webpush from "web-push";
import { createTestApp, type TestApp } from "../testing/harness";
import { type SendNotification, WebPushNotifier } from "./web-push";

const vapid = {
	subject: "mailto:padres@example.com",
	publicKey: "public",
	privateKey: "private",
};

let t: TestApp;

beforeEach(async () => {
	t = await createTestApp();
	await t.db.insert(pushSubscriptions).values(
		["ok", "gone", "missing", "broken"].map((name) => ({
			authUserId: t.ids.childAuthUserId,
			endpoint: `https://push.example.com/${name}`,
			p256dhKey: `p256dh-${name}`,
			authKey: `auth-${name}`,
		})),
	);
});

const message = messages.sessionReady({
	sessionId: "session-1",
	activityName: "Juego",
	minutes: 30,
});

describe("WebPushNotifier", () => {
	test("sends to every subscription and deletes the ones that are gone", async () => {
		const sent: { endpoint: string; payload: unknown; options: unknown }[] = [];
		const send: SendNotification = async (subscription, payload, options) => {
			sent.push({
				endpoint: subscription.endpoint,
				payload: JSON.parse(String(payload)),
				options,
			});
			const name = subscription.endpoint.split("/").at(-1);
			const status = { gone: 410, missing: 404, broken: 500 }[name ?? ""];
			if (status !== undefined) {
				throw new webpush.WebPushError(
					"Received unexpected response code",
					status,
					{},
					"",
					subscription.endpoint,
				);
			}
			return { statusCode: 201, body: "", headers: {} };
		};
		const notifier = new WebPushNotifier(t.db, vapid, send);
		const logged = spyOn(console, "error").mockImplementation(() => {});

		await notifier.send([t.ids.childAuthUserId], message);

		// Only the unexpected failure is logged, with the service's host.
		expect(logged).toHaveBeenCalledTimes(1);
		expect(logged.mock.calls[0]?.[1]).toMatchObject({
			service: "push.example.com",
		});
		logged.mockRestore();

		expect(sent).toHaveLength(4);
		expect(sent[0]).toMatchObject({
			payload: {
				kind: "session_ready",
				title: "¡Ya puedes empezar!",
				url: "/nino",
			},
			options: { vapidDetails: vapid, TTL: 900, urgency: "high" },
		});
		const left = await t.db.select().from(pushSubscriptions);
		expect(left.map((row) => row.endpoint).sort()).toEqual([
			"https://push.example.com/broken",
			"https://push.example.com/ok",
		]);
		expect(
			left.find((row) => row.endpoint.endsWith("/ok"))?.lastUsedAt,
		).not.toBeNull();
	});

	test("nobody to notify, nothing sent", async () => {
		const send: SendNotification = async () => {
			throw new Error("should not send");
		};
		await new WebPushNotifier(t.db, vapid, send).send([t.ids.momId], message);
		await new WebPushNotifier(t.db, vapid, send).send([], message);
	});
});
