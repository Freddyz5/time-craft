import { beforeEach, describe, expect, test } from "bun:test";
import { createTestApp, people, type TestApp } from "../testing/harness";

let t: TestApp;

beforeEach(async () => {
	t = await createTestApp();
});

const signInChildWith = (pin: string) =>
	t.request("POST", "/api/auth/sign-in/username", {
		json: { username: people.child.username, password: pin },
	});

describe("sign-in", () => {
	test("a parent signs in with email and password", async () => {
		const cookie = await t.signInParent();
		const response = await t.request("GET", "/api/me", { cookie });
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			me: { kind: "parent", parentId: t.ids.momId, name: "Ana" },
			family: { id: t.ids.familyId, name: "Familia Pérez" },
			children: [{ id: t.ids.childId, name: "Mateo" }],
		});
	});

	test("the child signs in with username and PIN", async () => {
		const cookie = await t.signInChild();
		const response = await t.request("GET", "/api/me", { cookie });
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			me: { kind: "child", childId: t.ids.childId, name: "Mateo" },
		});
	});

	test("the username is not case sensitive", async () => {
		const response = await t.request("POST", "/api/auth/sign-in/username", {
			json: { username: "MATEO", password: people.child.pin },
		});
		expect(response.status).toBe(200);
	});

	test("a wrong password does not sign in", async () => {
		const response = await t.request("POST", "/api/auth/sign-in/email", {
			json: { email: people.mom.email, password: "wrong-password" },
		});
		expect(response.status).toBe(401);
	});

	test("without a session the api answers 401 in the common format", async () => {
		const response = await t.request("GET", "/api/me");
		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({
			error: { code: "unauthenticated", message: "Sign in first" },
		});
	});

	test("signing out ends the session", async () => {
		const cookie = await t.signInParent();
		const out = await t.request("POST", "/api/auth/sign-out", { cookie });
		expect(out.status).toBe(200);
		expect((await t.request("GET", "/api/me", { cookie })).status).toBe(401);
	});
});

describe("the child's PIN lockout", () => {
	const lockedChild = async () => {
		for (let attempt = 1; attempt <= 4; attempt++) {
			expect((await signInChildWith("000000")).status).toBe(401);
		}
		return signInChildWith("000000");
	};

	test("the fifth wrong PIN in a row locks the child out for 15 minutes", async () => {
		const fifth = await lockedChild();
		expect(fifth.status).toBe(403);
		expect(await fifth.json()).toMatchObject({
			code: "child_locked",
			lockedUntil: "2026-10-21T20:15:00.000Z",
		});

		// Not even the right PIN gets in while locked.
		const locked = await signInChildWith(people.child.pin);
		expect(locked.status).toBe(403);
		expect(await locked.json()).toMatchObject({ code: "child_locked" });

		t.clock.advanceMinutes(15);
		expect((await signInChildWith(people.child.pin)).status).toBe(200);
	});

	test("a right PIN clears the count", async () => {
		for (let attempt = 1; attempt <= 4; attempt++) {
			await signInChildWith("000000");
		}
		expect((await signInChildWith(people.child.pin)).status).toBe(200);
		// Four more wrong ones do not lock: the count started again.
		for (let attempt = 1; attempt <= 4; attempt++) {
			expect((await signInChildWith("000000")).status).toBe(401);
		}
	});

	test("a parent resetting the PIN lifts the lockout", async () => {
		await lockedChild();
		const cookie = await t.signInParent();
		const reset = await t.request("PUT", `/api/children/${t.ids.childId}/pin`, {
			cookie,
			json: { pin: "654321" },
		});
		expect(reset.status).toBe(204);
		expect((await signInChildWith("654321")).status).toBe(200);
	});
});

describe("changing one's own password", () => {
	const changePassword = (cookie: string, json: Record<string, string>) =>
		t.request("POST", "/api/auth/change-password", { cookie, json });

	test("parents need at least 8 characters", async () => {
		const cookie = await t.signInParent();
		const weak = await changePassword(cookie, {
			currentPassword: people.mom.password,
			newPassword: "123456",
		});
		expect(weak.status).toBe(400);
		expect(await weak.json()).toMatchObject({
			code: "invalid_input",
			field: "password",
		});

		const strong = await changePassword(cookie, {
			currentPassword: people.mom.password,
			newPassword: "una-clave-nueva",
		});
		expect(strong.status).toBe(200);
		const again = await t.request("POST", "/api/auth/sign-in/email", {
			json: { email: people.mom.email, password: "una-clave-nueva" },
		});
		expect(again.status).toBe(200);
	});

	test("the child cannot change the PIN", async () => {
		const cookie = await t.signInChild();
		const response = await changePassword(cookie, {
			currentPassword: people.child.pin,
			newPassword: "999999",
		});
		expect(response.status).toBe(403);
	});
});

describe("Better Auth endpoints this app does not use", () => {
	test("there is no sign-up", async () => {
		const response = await t.request("POST", "/api/auth/sign-up/email", {
			json: {
				name: "Intruso",
				email: "intruso@example.com",
				password: "una-clave-larga",
			},
		});
		expect(response.status).toBe(400);
	});

	test("profile changes are disabled", async () => {
		const cookie = await t.signInChild();
		const response = await t.request("POST", "/api/auth/update-user", {
			cookie,
			json: { name: "Otro nombre" },
		});
		expect(response.status).toBe(404);
	});
});

describe("Google", () => {
	test("is offered only when configured", async () => {
		const body = { provider: "google", callbackURL: "/padres" };
		const without = await t.request("POST", "/api/auth/sign-in/social", {
			json: body,
		});
		expect(without.status).toBe(404);

		const google = await createTestApp({
			google: { clientId: "client-id", clientSecret: "client-secret" },
		});
		const response = await google.request("POST", "/api/auth/sign-in/social", {
			json: body,
		});
		expect(response.status).toBe(200);
		const { url } = (await response.json()) as { url: string };
		expect(new URL(url).host).toBe("accounts.google.com");
	});
});

describe("rate limit", () => {
	test("five sign-in attempts a minute per IP, then 429", async () => {
		const limited = await createTestApp({ rateLimit: true });
		const attempt = () =>
			limited.request("POST", "/api/auth/sign-in/email", {
				json: { email: people.mom.email, password: "wrong-password" },
				headers: { "x-forwarded-for": "203.0.113.7" },
			});
		for (let count = 1; count <= 5; count++) {
			expect((await attempt()).status).toBe(401);
		}
		expect((await attempt()).status).toBe(429);
	});
});

describe("trusted origins", () => {
	test("the web's preview URLs may call the api through a pattern", async () => {
		const preview = await createTestApp({
			trustedOrigins: ["https://time-craft-web-*-familia.vercel.app"],
		});
		const context = await preview.auth.$context;
		for (const origin of [
			"http://localhost",
			"https://time-craft-web-git-feat-f6-cicd-familia.vercel.app",
			"https://time-craft-web-4f9a2c1b-familia.vercel.app",
		]) {
			expect(context.isTrustedOrigin(origin)).toBe(true);
		}
		for (const origin of [
			"https://time-craft-web-familia.vercel.app.evil.com",
			"https://other-app-familia.vercel.app",
			"http://time-craft-web-git-dev-familia.vercel.app",
		]) {
			expect(context.isTrustedOrigin(origin)).toBe(false);
		}
	});
});
