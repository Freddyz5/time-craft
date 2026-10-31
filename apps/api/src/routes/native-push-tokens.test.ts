import { beforeEach, describe, expect, test } from "bun:test";
import { nativePushTokens } from "@time-craft/db";
import { createTestApp, type TestApp } from "../testing/harness";

let t: TestApp;
let mom: string;

beforeEach(async () => {
	t = await createTestApp();
	mom = await t.signInParent();
});

describe("/api/native-push-tokens", () => {
	test("registers and removes the app's token", async () => {
		const created = await t.request("POST", "/api/native-push-tokens", {
			cookie: mom,
			json: { token: "fcm-1", platform: "android", deviceLabel: "Pixel 8" },
		});
		expect(created.status).toBe(201);
		expect((await created.json()).token.deviceLabel).toBe("Pixel 8");
		expect(await t.db.select().from(nativePushTokens)).toHaveLength(1);

		const removed = await t.request("DELETE", "/api/native-push-tokens", {
			cookie: mom,
			json: { token: "fcm-1" },
		});
		expect(removed.status).toBe(204);
		expect(await t.db.select().from(nativePushTokens)).toHaveLength(0);
	});

	test("needs a session and an android token", async () => {
		const anonymous = await t.request("POST", "/api/native-push-tokens", {
			json: { token: "fcm-1", platform: "android" },
		});
		expect(anonymous.status).toBe(401);
		const ios = await t.request("POST", "/api/native-push-tokens", {
			cookie: mom,
			json: { token: "fcm-1", platform: "ios" },
		});
		expect(ios.status).toBe(400);
	});
});
