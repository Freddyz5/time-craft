// The web talks to the api with hc<AppType>: the routes and their JSON are
// typed end to end (this file fails to typecheck if they are not).
import { describe, expect, test } from "bun:test";
import { hc } from "hono/client";
import pkg from "../package.json" with { type: "json" };
import type { AppType } from "./app";
import { createTestApp } from "./testing/harness";

describe("AppType", () => {
	test("drives a typed client", async () => {
		const t = await createTestApp();
		const cookie = await t.signInParent();
		const client = hc<AppType>("http://localhost", {
			fetch: ((input, init) => t.app.request(input, init)) as typeof fetch,
			headers: { cookie },
		});

		const balance = await client.api.children[":childId"].balance.$get({
			param: { childId: t.ids.childId },
		});
		const view = await balance.json();
		expect(view.balances[0]?.availableSeconds).toBe(60 * 60);

		const started = await client.api.sessions.$post({
			json: { childId: t.ids.childId, activityId: t.ids.gameId, minutes: 15 },
		});
		expect(started.status).toBe(201);
		if (started.status === 201) {
			const { serverTime, session } = await started.json();
			expect(serverTime).toBe("2026-10-21T20:00:00.000Z");
			expect(session.plannedDurationSeconds).toBe(15 * 60);
		}
	});

	test("/health answers without a session, with the api's version", async () => {
		const t = await createTestApp();
		const response = await t.app.request("/health");
		expect(await response.json()).toEqual({
			ok: true,
			app: { name: "Time Craft", version: pkg.version },
		});
	});
});
