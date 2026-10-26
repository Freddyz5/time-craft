// Limits, bonus tasks and reports, push subscriptions and the error format.
import { beforeEach, describe, expect, test } from "bun:test";
import { pushSubscriptions } from "@time-craft/db";
import { createTestApp, type TestApp } from "../testing/harness";

let t: TestApp;
let parent: string;
let child: string;

beforeEach(async () => {
	t = await createTestApp();
	parent = await t.signInParent();
	child = await t.signInChild();
});

async function body<T>(response: Response, status: number): Promise<T> {
	const text = await response.text();
	if (response.status !== status) {
		throw new Error(`Expected ${status}, got ${response.status}: ${text}`);
	}
	return (text === "" ? undefined : JSON.parse(text)) as T;
}

describe("limits", () => {
	test("parents change them; everyone sees the ones in force", async () => {
		const path = `/api/children/${t.ids.childId}/policies`;
		const initial = await body<{ policies: object[] }>(
			await t.request("GET", path, { cookie: child }),
			200,
		);
		expect(initial.policies).toMatchObject([
			{ activityId: null, dailyLimitMinutes: 60, weeklyLimitMinutes: 300 },
		]);

		// Later than the seeded policy, so the history order is certain.
		t.clock.advanceMinutes(1);
		const created = await body<{ policy: object }>(
			await t.request("POST", path, {
				cookie: parent,
				json: {
					dailyLimitMinutes: 90,
					weeklyLimitMinutes: 400,
					warningMinutes: 10,
				},
			}),
			201,
		);
		expect(created.policy).toMatchObject({
			dailyLimitMinutes: 90,
			warningMinutes: 10,
			weeklyBonusCapMinutes: 60,
		});
		const current = await body<{ policies: object[] }>(
			await t.request("GET", path, { cookie: parent }),
			200,
		);
		expect(current.policies).toMatchObject([{ dailyLimitMinutes: 90 }]);
		const history = await body<{ policies: object[] }>(
			await t.request("GET", `${path}/history`, { cookie: child }),
			200,
		);
		expect(history.policies).toMatchObject([
			{ dailyLimitMinutes: 90, validTo: null },
			{ dailyLimitMinutes: 60, validTo: expect.any(String) },
		]);

		// A limit of its own for TV, then back to the global quota.
		await body<object>(
			await t.request("POST", path, {
				cookie: parent,
				json: {
					activityId: t.ids.tvId,
					dailyLimitMinutes: 30,
					weeklyLimitMinutes: 120,
				},
			}),
			201,
		);
		const cleared = await body<{ policy: object | null }>(
			await t.request("DELETE", `${path}/${t.ids.tvId}`, { cookie: parent }),
			200,
		);
		expect(cleared.policy).toMatchObject({
			activityId: t.ids.tvId,
			validTo: expect.any(String),
		});
		const afterClear = await body<{ policies: object[] }>(
			await t.request("GET", path, { cookie: parent }),
			200,
		);
		expect(afterClear.policies).toMatchObject([{ activityId: null }]);

		const invalid = await t.request("POST", path, {
			cookie: parent,
			json: { dailyLimitMinutes: 90, weeklyLimitMinutes: 60 },
		});
		expect(await body<object>(invalid, 400)).toMatchObject({
			error: {
				code: "invalid_input",
				details: { field: "weeklyLimitMinutes" },
			},
		});
	});
});

describe("bonus tasks", () => {
	test("catalog, report, review, and the bonus in the balance", async () => {
		const { task } = await body<{ task: { id: string } }>(
			await t.request("POST", "/api/bonus-tasks", {
				cookie: parent,
				json: { name: "Deberes", rewardMinutes: 15, maxPerWeek: 3 },
			}),
			201,
		);
		const updated = await body<{ task: object }>(
			await t.request("PUT", `/api/bonus-tasks/${task.id}`, {
				cookie: parent,
				json: {
					name: "Deberes completos",
					description: "Todos",
					rewardMinutes: 20,
					maxPerWeek: null,
				},
			}),
			200,
		);
		expect(updated.task).toMatchObject({
			name: "Deberes completos",
			rewardMinutes: 20,
			maxPerWeek: null,
		});
		const seen = await body<{ tasks: { id: string }[] }>(
			await t.request("GET", "/api/bonus-tasks", { cookie: child }),
			200,
		);
		expect(seen.tasks.map((seenTask) => seenTask.id)).toEqual([task.id]);

		t.notifier.clear();
		const { report } = await body<{ report: { id: string } }>(
			await t.request("POST", "/api/task-reports", {
				cookie: child,
				json: { bonusTaskId: task.id, note: "Mate y lengua" },
			}),
			201,
		);
		expect(t.notifier.kinds()).toEqual(["report_created"]);
		const duplicate = await t.request("POST", "/api/task-reports", {
			cookie: child,
			json: { bonusTaskId: task.id },
		});
		expect(await body<object>(duplicate, 409)).toMatchObject({
			error: { code: "report_already_pending" },
		});

		const pending = await body<{ reports: { id: string }[] }>(
			await t.request("GET", "/api/task-reports", { cookie: parent }),
			200,
		);
		expect(pending.reports.map((pendingReport) => pendingReport.id)).toEqual([
			report.id,
		]);
		const reviewed = await body<{ report: object }>(
			await t.request("POST", `/api/task-reports/${report.id}/review`, {
				cookie: parent,
				json: { decision: "approve" },
			}),
			200,
		);
		expect(reviewed.report).toMatchObject({
			status: "approved",
			awardedMinutes: 20,
		});

		const balance = await body<{ balances: { bonusSeconds: number }[] }>(
			await t.request("GET", `/api/children/${t.ids.childId}/balance`, {
				cookie: child,
			}),
			200,
		);
		expect(balance.balances[0]?.bonusSeconds).toBe(20 * 60);

		await body<object>(
			await t.request("POST", `/api/bonus-tasks/${task.id}/deactivate`, {
				cookie: parent,
			}),
			200,
		);
		const after = await body<{ tasks: object[] }>(
			await t.request("GET", "/api/bonus-tasks", { cookie: child }),
			200,
		);
		expect(after.tasks).toEqual([]);
	});

	test("a review is approve or reject", async () => {
		const response = await t.request(
			"POST",
			`/api/task-reports/${crypto.randomUUID()}/review`,
			{ cookie: parent, json: { decision: "maybe" } },
		);
		expect(await body<object>(response, 400)).toMatchObject({
			error: { code: "invalid_input" },
		});
	});
});

describe("push subscriptions", () => {
	const subscription = {
		endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
		expirationTime: null,
		keys: { p256dh: "BKey", auth: "secret" },
		deviceLabel: "Teléfono de Ana",
	};

	test("a browser subscribes and unsubscribes", async () => {
		const created = await body<{ subscription: object }>(
			await t.request("POST", "/api/push-subscriptions", {
				cookie: parent,
				json: subscription,
			}),
			201,
		);
		expect(created.subscription).toMatchObject({
			deviceLabel: "Teléfono de Ana",
		});
		// The same browser, now signed in as the child, belongs to the child.
		await body<object>(
			await t.request("POST", "/api/push-subscriptions", {
				cookie: child,
				json: { ...subscription, deviceLabel: "Tablet" },
			}),
			201,
		);
		const rows = await t.db.select().from(pushSubscriptions);
		expect(rows).toMatchObject([
			{ authUserId: t.ids.childAuthUserId, deviceLabel: "Tablet" },
		]);

		const removed = await t.request("DELETE", "/api/push-subscriptions", {
			cookie: child,
			json: { endpoint: subscription.endpoint },
		});
		expect(removed.status).toBe(204);
		expect(await t.db.select().from(pushSubscriptions)).toEqual([]);
	});

	test("the endpoint must be https", async () => {
		const response = await t.request("POST", "/api/push-subscriptions", {
			cookie: parent,
			json: { ...subscription, endpoint: "http://insecure.example.com" },
		});
		expect(await body<object>(response, 400)).toMatchObject({
			error: { code: "invalid_input", details: { field: "endpoint" } },
		});
	});
});

describe("history", () => {
	test("an explicit period, both ends or none", async () => {
		const path = `/api/children/${t.ids.childId}/history`;
		const day = await body<{ period: object }>(
			await t.request(
				"GET",
				`${path}?from=2026-10-21T00:00:00-05:00&to=2026-10-22T00:00:00-05:00`,
				{ cookie: child },
			),
			200,
		);
		expect(day.period).toEqual({
			start: "2026-10-21T05:00:00.000Z",
			end: "2026-10-22T05:00:00.000Z",
		});
		const half = await t.request("GET", `${path}?from=2026-10-21T00:00:00Z`, {
			cookie: child,
		});
		expect(await body<object>(half, 400)).toMatchObject({
			error: { code: "invalid_input", details: { field: "period" } },
		});
	});
});

describe("the error format", () => {
	test("bad ids and bodies are 400 with the issues", async () => {
		const badId = await t.request("GET", "/api/children/not-a-uuid/balance", {
			cookie: parent,
		});
		expect(await body<object>(badId, 400)).toEqual({
			error: {
				code: "invalid_input",
				message: "The request is not valid",
				details: {
					target: "param",
					issues: [{ path: "childId", message: expect.any(String) }],
				},
			},
		});

		const notJson = await t.app.request("/api/sessions", {
			method: "POST",
			headers: { cookie: parent, "content-type": "application/json" },
			body: "{nope",
		});
		expect(await body<object>(notJson, 400)).toMatchObject({
			error: { code: "invalid_request" },
		});
	});

	test("unknown ids are 404, unknown routes too", async () => {
		const missing = await t.request(
			"POST",
			`/api/requests/${crypto.randomUUID()}/reject`,
			{ cookie: parent, json: {} },
		);
		expect(await body<object>(missing, 404)).toMatchObject({
			error: { code: "request_not_found" },
		});
		const route = await t.request("GET", "/api/nothing-here", {
			cookie: parent,
		});
		expect(await body<object>(route, 404)).toEqual({
			error: { code: "route_not_found", message: "No such route" },
		});
	});
});
