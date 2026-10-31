import { beforeEach, describe, expect, test } from "bun:test";
import {
	createTestKit,
	type Household,
	seedHousehold,
	type TestKit,
} from "../testing";

const NOW = "2026-10-21T15:00:00-05:00";
const ENDPOINT = "https://fcm.googleapis.com/fcm/send/abc";

let kit: TestKit;
let h: Household;

beforeEach(() => {
	kit = createTestKit(NOW);
	h = seedHousehold(kit);
});

const keys = { p256dhKey: "p256dh", authKey: "auth" };

describe("push subscriptions", () => {
	test("are saved for the signed-in person", async () => {
		const subscription = await kit.core.registerSubscription(h.mom, {
			endpoint: ENDPOINT,
			...keys,
			deviceLabel: "Pixel de mamá",
		});
		expect(subscription).toMatchObject({
			authUserId: h.auth.mom,
			endpoint: ENDPOINT,
			deviceLabel: "Pixel de mamá",
		});
		expect(kit.db.all("pushSubscriptions")).toHaveLength(1);
	});

	test("a shared browser belongs to whoever registered last", async () => {
		await kit.core.registerSubscription(h.mom, { endpoint: ENDPOINT, ...keys });
		await kit.core.registerSubscription(h.child, {
			endpoint: ENDPOINT,
			...keys,
		});
		expect(kit.db.all("pushSubscriptions").map((s) => s.authUserId)).toEqual([
			h.auth.child,
		]);
	});

	test("only https endpoints", async () => {
		await expect(
			kit.core.registerSubscription(h.mom, {
				endpoint: "http://example.com/push",
				...keys,
			}),
		).rejects.toMatchObject({
			code: "invalid_input",
			details: { field: "endpoint" },
		});
	});

	test("removing someone else's subscription does nothing", async () => {
		await kit.core.registerSubscription(h.mom, { endpoint: ENDPOINT, ...keys });
		await kit.core.removeSubscription(h.child, { endpoint: ENDPOINT });
		expect(kit.db.all("pushSubscriptions")).toHaveLength(1);
		await kit.core.removeSubscription(h.mom, { endpoint: ENDPOINT });
		expect(kit.db.all("pushSubscriptions")).toHaveLength(0);
		// Idempotent.
		await kit.core.removeSubscription(h.mom, { endpoint: ENDPOINT });
	});
});

describe("app push tokens", () => {
	const TOKEN = "fcm-token-abc";

	test("are saved for the signed-in person", async () => {
		const saved = await kit.core.registerNativeToken(h.mom, {
			token: TOKEN,
			platform: "android",
			deviceLabel: "App en Pixel 8",
		});
		expect(saved).toMatchObject({
			authUserId: h.auth.mom,
			token: TOKEN,
			platform: "android",
			deviceLabel: "App en Pixel 8",
		});
		expect(kit.db.all("nativePushTokens")).toHaveLength(1);
	});

	test("an app where someone else signs in now belongs to them", async () => {
		await kit.core.registerNativeToken(h.mom, {
			token: TOKEN,
			platform: "android",
		});
		await kit.core.registerNativeToken(h.child, {
			token: TOKEN,
			platform: "android",
		});
		expect(kit.db.all("nativePushTokens").map((s) => s.authUserId)).toEqual([
			h.auth.child,
		]);
	});

	test("only android", async () => {
		await expect(
			kit.core.registerNativeToken(h.mom, {
				token: TOKEN,
				platform: "ios" as "android",
			}),
		).rejects.toMatchObject({
			code: "invalid_input",
			details: { field: "platform" },
		});
	});

	test("removing someone else's token does nothing", async () => {
		await kit.core.registerNativeToken(h.mom, {
			token: TOKEN,
			platform: "android",
		});
		await kit.core.removeNativeToken(h.child, { token: TOKEN });
		expect(kit.db.all("nativePushTokens")).toHaveLength(1);
		await kit.core.removeNativeToken(h.mom, { token: TOKEN });
		expect(kit.db.all("nativePushTokens")).toHaveLength(0);
		await kit.core.removeNativeToken(h.mom, { token: TOKEN });
	});
});
