// Who may call what. The child only reads and asks; parents only see their
// own family (anything else does not exist for them).
import { beforeEach, describe, expect, test } from "bun:test";
import { seedHousehold } from "../seed";
import { createTestApp, type TestApp } from "../testing/harness";

let t: TestApp;
let child: string;

beforeEach(async () => {
	t = await createTestApp();
	child = await t.signInChild();
});

async function errorCode(response: Response) {
	const body = (await response.json()) as { error?: { code?: string } };
	return [response.status, body.error?.code];
}

describe("the child", () => {
	test("cannot do what only parents do", async () => {
		const { childId, gameId } = t.ids;
		const attempts: [string, string, object?][] = [
			["POST", "/api/sessions", { childId, activityId: gameId, minutes: 10 }],
			[
				"POST",
				"/api/overrides",
				{ childId, activityId: gameId, extraMinutes: 10, reason: "Por favor" },
			],
			[
				"POST",
				`/api/children/${childId}/policies`,
				{ dailyLimitMinutes: 600, weeklyLimitMinutes: 1000 },
			],
			["DELETE", `/api/children/${childId}/policies/${t.ids.tvId}`],
			["POST", "/api/bonus-tasks", { name: "Nada", rewardMinutes: 60 }],
			["POST", "/api/children", { name: "Yo", username: "yo2", pin: "123456" }],
			["PUT", `/api/children/${childId}/pin`, { pin: "111111" }],
			["GET", `/api/children/${childId}/logins`],
			["POST", "/api/recovery-code"],
		];
		for (const [method, path, json] of attempts) {
			const response = await t.request(method, path, { cookie: child, json });
			expect([path, ...(await errorCode(response))]).toEqual([
				path,
				403,
				"forbidden",
			]);
		}
	});

	test("cannot approve, review or command sessions", async () => {
		const parent = await t.signInParent();
		const session = (await (
			await t.request("POST", "/api/sessions", {
				cookie: parent,
				json: { childId: t.ids.childId, activityId: t.ids.gameId, minutes: 10 },
			})
		).json()) as { session: { id: string } };
		for (const command of ["pause", "stop"]) {
			const response = await t.request(
				"POST",
				`/api/sessions/${session.session.id}/${command}`,
				{ cookie: child, json: {} },
			);
			expect(await errorCode(response)).toEqual([403, "forbidden"]);
		}
		const approve = await t.request(
			"POST",
			`/api/requests/${crypto.randomUUID()}/approve`,
			{ cookie: child, json: { approvedMinutes: 10 } },
		);
		expect(await errorCode(approve)).toEqual([403, "forbidden"]);
	});

	test("reads their own balance, timer, limits, tasks and history", async () => {
		for (const path of [
			`/api/children/${t.ids.childId}/balance`,
			`/api/children/${t.ids.childId}/live-session`,
			`/api/children/${t.ids.childId}/policies`,
			`/api/children/${t.ids.childId}/history`,
			"/api/bonus-tasks",
			"/api/task-reports",
			"/api/requests",
		]) {
			const response = await t.request("GET", path, { cookie: child });
			expect([path, response.status]).toEqual([path, 200]);
		}
	});

	test("does not see a sibling", async () => {
		const parent = await t.signInParent();
		const created = await t.request("POST", "/api/children", {
			cookie: parent,
			json: { name: "Lucía", username: "lucia", pin: "246810" },
		});
		const { child: sibling } = (await created.json()) as {
			child: { id: string };
		};
		const response = await t.request(
			"GET",
			`/api/children/${sibling.id}/balance`,
			{ cookie: child },
		);
		expect(await errorCode(response)).toEqual([403, "forbidden"]);
	});
});

describe("parents", () => {
	test("cannot ask in the child's name", async () => {
		const parent = await t.signInParent();
		const response = await t.request("POST", "/api/requests", {
			cookie: parent,
			json: {
				requestType: "start",
				activityId: t.ids.gameId,
				requestedMinutes: 10,
			},
		});
		expect(await errorCode(response)).toEqual([403, "forbidden"]);
	});

	test("another family's child does not exist for them", async () => {
		await seedHousehold(
			{ db: t.db, auth: t.auth, core: t.core },
			{
				familyName: "Otra familia",
				parents: [
					{ name: "Eva", email: "eva@example.com" },
					{ name: "Raúl", email: "raul@example.com" },
				],
				parentPasswords: ["clave-de-eva", undefined],
				policy: { dailyLimitMinutes: 60, weeklyLimitMinutes: 300 },
			},
		);
		const response = await t.request("POST", "/api/auth/sign-in/email", {
			json: { email: "eva@example.com", password: "clave-de-eva" },
		});
		const cookie = response.headers.getSetCookie()[0]?.split(";")[0] ?? "";
		const balance = await t.request(
			"GET",
			`/api/children/${t.ids.childId}/balance`,
			{ cookie },
		);
		expect(await errorCode(balance)).toEqual([404, "child_not_found"]);
		const session = await t.request("POST", "/api/sessions", {
			cookie,
			json: { childId: t.ids.childId, activityId: t.ids.gameId, minutes: 10 },
		});
		expect(await errorCode(session)).toEqual([404, "child_not_found"]);
	});
});

describe("a login without a role", () => {
	test("is signed in but gets 403 everywhere", async () => {
		const ctx = await t.auth.$context;
		const user = await ctx.internalAdapter.createUser(
			{
				name: "Huérfano",
				email: "huerfano@hijos.timecraft.local",
				emailVerified: false,
				username: "huerfano",
				displayUsername: "huerfano",
			},
			{ method: "admin" },
		);
		await ctx.internalAdapter.linkAccount({
			userId: user?.id ?? "",
			providerId: "credential",
			accountId: user?.id ?? "",
			password: await ctx.password.hash("123456"),
		});
		const signIn = await t.request("POST", "/api/auth/sign-in/username", {
			json: { username: "huerfano", password: "123456" },
		});
		const cookie = signIn.headers.getSetCookie()[0]?.split(";")[0] ?? "";
		const response = await t.request("GET", "/api/me", { cookie });
		expect(await errorCode(response)).toEqual([403, "no_role"]);
	});
});
