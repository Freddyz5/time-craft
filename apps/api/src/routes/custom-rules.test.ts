// Allowed days and grace on the limits, and the rules parents write, against
// the real migrations.
import { beforeEach, describe, expect, test } from "bun:test";
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

describe("allowed days and grace", () => {
	test("are saved with the limits and reach the balance", async () => {
		const path = `/api/children/${t.ids.childId}/policies`;
		const today = new Date(t.clock.now()).getUTCDay();
		const otherDay = (today + 3) % 7;
		const created = await body<{ policy: object }>(
			await t.request("POST", path, {
				cookie: parent,
				json: {
					dailyLimitMinutes: 60,
					weeklyLimitMinutes: 300,
					allowedDays: [otherDay],
					graceMinutes: 2,
				},
			}),
			201,
		);
		expect(created.policy).toMatchObject({
			allowedDays: [otherDay],
			graceMinutes: 2,
		});

		const view = await body<{ balances: object[] }>(
			await t.request("GET", `/api/children/${t.ids.childId}/balance`, {
				cookie: child,
			}),
			200,
		);
		expect(view.balances).toMatchObject([
			{ dayAllowed: false, availableSeconds: 0, allowedDays: [otherDay] },
		]);

		const asked = await t.request("POST", "/api/requests", {
			cookie: child,
			json: {
				requestType: "start",
				activityId: t.ids.gameId,
				requestedMinutes: 10,
			},
		});
		expect(asked.status).toBe(422);
		expect(await asked.json()).toMatchObject({
			error: { code: "day_not_allowed" },
		});
	});
});

describe("grace", () => {
	test("a session keeps its grace and the balance leaves it out", async () => {
		await body<object>(
			await t.request("POST", `/api/children/${t.ids.childId}/policies`, {
				cookie: parent,
				json: {
					dailyLimitMinutes: 60,
					weeklyLimitMinutes: 300,
					graceMinutes: 2,
				},
			}),
			201,
		);
		const { session } = await body<{
			session: { id: string; graceSeconds: number };
		}>(
			await t.request("POST", "/api/sessions", {
				cookie: parent,
				json: { childId: t.ids.childId, activityId: t.ids.gameId, minutes: 30 },
			}),
			201,
		);
		expect(session.graceSeconds).toBe(120);

		t.clock.advanceMinutes(31);
		await body<object>(
			await t.request("POST", `/api/sessions/${session.id}/stop`, {
				cookie: parent,
			}),
			200,
		);
		const view = await body<{ balances: { availableSeconds: number }[] }>(
			await t.request("GET", `/api/children/${t.ids.childId}/balance`, {
				cookie: child,
			}),
			200,
		);
		// 31 min used, the minute within the grace does not count.
		expect(view.balances[0]?.availableSeconds).toBe(30 * 60);
	});
});

describe("custom rules", () => {
	test("parents write both lists; the child reads only theirs", async () => {
		const path = `/api/children/${t.ids.childId}/custom-rules`;
		const { rule: homework } = await body<{ rule: { id: string } }>(
			await t.request("POST", path, {
				cookie: parent,
				json: { text: "Primero los deberes" },
			}),
			201,
		);
		const { rule: food } = await body<{ rule: { id: string } }>(
			await t.request("POST", path, {
				cookie: parent,
				json: { text: "Solo después de comer", parentsOnly: true },
			}),
			201,
		);
		const { rule: table } = await body<{ rule: { id: string } }>(
			await t.request("POST", path, {
				cookie: parent,
				json: { text: "Nada de pantallas en la mesa" },
			}),
			201,
		);

		const forChild = await body<{ rules: object[] }>(
			await t.request("GET", path, { cookie: child }),
			200,
		);
		expect(forChild.rules).toMatchObject([
			{ text: "Primero los deberes", parentsOnly: false },
			{ text: "Nada de pantallas en la mesa", parentsOnly: false },
		]);

		await body<object>(
			await t.request("PUT", `${path}/order`, {
				cookie: parent,
				json: { ruleIds: [table.id, homework.id] },
			}),
			200,
		);
		await body<object>(
			await t.request("PATCH", `/api/custom-rules/${food.id}`, {
				cookie: parent,
				json: { text: "Solo después del almuerzo" },
			}),
			200,
		);
		await body<object>(
			await t.request("DELETE", `/api/custom-rules/${homework.id}`, {
				cookie: parent,
			}),
			200,
		);
		const forParents = await body<{ rules: object[] }>(
			await t.request("GET", path, { cookie: parent }),
			200,
		);
		expect(forParents.rules).toMatchObject([
			{ text: "Nada de pantallas en la mesa", parentsOnly: false },
			{ text: "Solo después del almuerzo", parentsOnly: true },
		]);
	});

	test("the child cannot write them", async () => {
		const response = await t.request(
			"POST",
			`/api/children/${t.ids.childId}/custom-rules`,
			{ cookie: child, json: { text: "Jugar siempre" } },
		);
		expect(response.status).toBe(403);
	});
});

describe("hidden automatic rules", () => {
	test("parents hide and show them; the child reads the list", async () => {
		const path = `/api/children/${t.ids.childId}/hidden-rules`;
		await body<object>(
			await t.request("PUT", `${path}/one_session`, { cookie: parent }),
			200,
		);
		// Twice is the same.
		await body<object>(
			await t.request("PUT", `${path}/one_session`, { cookie: parent }),
			200,
		);
		await body<object>(
			await t.request("PUT", `${path}/week_change`, { cookie: parent }),
			200,
		);
		const shown = await body<{ ruleKeys: string[] }>(
			await t.request("DELETE", `${path}/week_change`, { cookie: parent }),
			200,
		);
		expect(shown.ruleKeys).toEqual(["one_session"]);
		const forChild = await body<{ ruleKeys: string[] }>(
			await t.request("GET", path, { cookie: child }),
			200,
		);
		expect(forChild.ruleKeys).toEqual(["one_session"]);

		const unknown = await t.request("PUT", `${path}/anything`, {
			cookie: parent,
		});
		expect(unknown.status).toBe(400);
		const byChild = await t.request("PUT", `${path}/limits`, { cookie: child });
		expect(byChild.status).toBe(403);
	});
});
