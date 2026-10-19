import { beforeEach, describe, expect, test } from "bun:test";
import { authAccount, authUser } from "@time-craft/db";
import { eq } from "drizzle-orm";
import { createTestApp, people, type TestApp } from "../testing/harness";

let t: TestApp;
let mom: string;

beforeEach(async () => {
	t = await createTestApp();
	mom = await t.signInParent();
});

async function body<T>(response: Response, status: number): Promise<T> {
	const text = await response.text();
	if (response.status !== status) {
		throw new Error(`Expected ${status}, got ${response.status}: ${text}`);
	}
	return (text === "" ? undefined : JSON.parse(text)) as T;
}

const signInEmail = (email: string, password: string) =>
	t.request("POST", "/api/auth/sign-in/email", { json: { email, password } });

describe("the child's account", () => {
	test("a parent creates it with a username and a PIN", async () => {
		const created = await body<{ child: { id: string; familyId: string } }>(
			await t.request("POST", "/api/children", {
				cookie: mom,
				json: { name: "Lucía", username: " Lucia_9 ", pin: "246810" },
			}),
			201,
		);
		expect(created.child.familyId).toBe(t.ids.familyId);

		const [user] = await t.db
			.select()
			.from(authUser)
			.where(eq(authUser.username, "lucia_9"));
		expect(user).toMatchObject({
			email: "lucia_9@hijos.timecraft.local",
			displayUsername: "lucia_9",
		});
		// No session was opened for her on creation.
		const signIn = await t.request("POST", "/api/auth/sign-in/username", {
			json: { username: "lucia_9", password: "246810" },
		});
		expect(signIn.status).toBe(200);
	});

	test("the username is unique and the PIN is 6 to 12 digits", async () => {
		const taken = await t.request("POST", "/api/children", {
			cookie: mom,
			json: { name: "Otro", username: "Mateo", pin: "246810" },
		});
		expect(await body<object>(taken, 409)).toMatchObject({
			error: { code: "username_taken" },
		});
		const badPin = await t.request("POST", "/api/children", {
			cookie: mom,
			json: { name: "Otro", username: "otro", pin: "12ab" },
		});
		expect(await body<object>(badPin, 400)).toMatchObject({
			error: { code: "invalid_input", details: { field: "pin" } },
		});
		// Nothing was left behind by the failed attempts.
		const users = await t.db
			.select()
			.from(authUser)
			.where(eq(authUser.username, "otro"));
		expect(users).toEqual([]);
	});
});

describe("resetting a password", () => {
	test("a parent sets the other parent's password", async () => {
		const reset = await t.request(
			"PUT",
			`/api/parents/${t.ids.dadId}/password`,
			{ cookie: mom, json: { newPassword: "nueva-clave-de-luis" } },
		);
		expect(reset.status).toBe(204);
		expect(
			(await signInEmail(people.dad.email, "nueva-clave-de-luis")).status,
		).toBe(200);
		expect(
			(await signInEmail(people.dad.email, people.dad.password)).status,
		).toBe(401);
	});

	test("not their own, and not a weak one", async () => {
		const own = await t.request("PUT", `/api/parents/${t.ids.momId}/password`, {
			cookie: mom,
			json: { newPassword: "otra-clave-larga" },
		});
		expect(await body<object>(own, 403)).toMatchObject({
			error: { code: "cannot_reset_own_password" },
		});
		const weak = await t.request(
			"PUT",
			`/api/parents/${t.ids.dadId}/password`,
			{
				cookie: mom,
				json: { newPassword: "corta" },
			},
		);
		expect(await body<object>(weak, 400)).toMatchObject({
			error: { code: "invalid_input" },
		});
	});

	test("a parent who only used Google gets a password", async () => {
		await t.db
			.delete(authAccount)
			.where(eq(authAccount.providerId, "credential"));
		const dad = await t.request("PUT", `/api/parents/${t.ids.dadId}/password`, {
			cookie: mom,
			json: { newPassword: "primera-clave-de-luis" },
		});
		expect(dad.status).toBe(204);
		expect(
			(await signInEmail(people.dad.email, "primera-clave-de-luis")).status,
		).toBe(200);
	});
});

describe("the child's devices", () => {
	test("a parent lists them and signs the child out", async () => {
		const tablet = await t.signInChild();
		const pc = await t.signInChild();
		const listed = await body<{ logins: Record<string, unknown>[] }>(
			await t.request("GET", `/api/children/${t.ids.childId}/logins`, {
				cookie: mom,
			}),
			200,
		);
		expect(listed.logins).toHaveLength(2);
		for (const login of listed.logins) {
			expect(Object.keys(login).sort()).toEqual([
				"createdAt",
				"expiresAt",
				"id",
				"ipAddress",
				"updatedAt",
				"userAgent",
			]);
		}

		const stillSignedIn = async () => {
			const statuses = await Promise.all(
				[tablet, pc].map(
					async (cookie) =>
						(await t.request("GET", "/api/me", { cookie })).status,
				),
			);
			return statuses.filter((status) => status === 200).length;
		};

		const [first] = listed.logins;
		const one = await t.request(
			"DELETE",
			`/api/children/${t.ids.childId}/logins/${first?.id}`,
			{ cookie: mom },
		);
		expect(await body<object>(one, 200)).toEqual({ revoked: 1 });
		expect(await stillSignedIn()).toBe(1);

		const missing = await t.request(
			"DELETE",
			`/api/children/${t.ids.childId}/logins/${first?.id}`,
			{ cookie: mom },
		);
		expect(await body<object>(missing, 404)).toMatchObject({
			error: { code: "login_not_found" },
		});

		const all = await t.request(
			"DELETE",
			`/api/children/${t.ids.childId}/logins`,
			{ cookie: mom },
		);
		expect(await body<object>(all, 200)).toEqual({ revoked: 1 });
		expect(await stillSignedIn()).toBe(0);
	});
});

describe("the recovery code", () => {
	const useCode = (code: string, newPassword = "clave-recuperada") =>
		t.request("POST", "/api/recovery-code/use", {
			json: { email: people.mom.email, code, newPassword },
		});

	test("resets a parent's password once and returns a new code", async () => {
		expect(t.recoveryCode).toMatch(/^([0-9A-Z]{5}-){4}[0-9A-Z]{5}$/);
		const code = t.recoveryCode ?? "";
		// Typed loosely: lowercase, no dashes.
		const used = await body<{ recoveryCode: string }>(
			await useCode(code.toLowerCase().replaceAll("-", " ")),
			200,
		);
		expect(used.recoveryCode).not.toBe(code);
		expect(
			(await signInEmail(people.mom.email, "clave-recuperada")).status,
		).toBe(200);

		const again = await useCode(code, "otra-clave-larga");
		expect(await body<object>(again, 401)).toMatchObject({
			error: { code: "invalid_recovery_code" },
		});
		expect((await useCode(used.recoveryCode, "otra-clave-larga")).status).toBe(
			200,
		);
	});

	test("is rate limited per IP", async () => {
		for (let attempt = 1; attempt <= 5; attempt++) {
			expect((await useCode("WRONG-CODE")).status).toBe(401);
		}
		const limited = await useCode(t.recoveryCode ?? "");
		expect(limited.status).toBe(429);
		expect(limited.headers.get("retry-after")).toBe("3600");
		expect(await body<object>(limited, 429)).toMatchObject({
			error: { code: "rate_limited" },
		});
	});

	test("a parent replaces it; the old one stops working", async () => {
		const created = await body<{ recoveryCode: string; createdAt: string }>(
			await t.request("POST", "/api/recovery-code", { cookie: mom }),
			201,
		);
		expect(created.createdAt).toBe("2026-10-21T20:00:00.000Z");
		const me = await body<{ family: { recoveryCodeCreatedAt: string } }>(
			await t.request("GET", "/api/me", { cookie: mom }),
			200,
		);
		expect(me.family.recoveryCodeCreatedAt).toBe(created.createdAt);
		expect((await useCode(t.recoveryCode ?? "")).status).toBe(401);
		expect((await useCode(created.recoveryCode)).status).toBe(200);
	});
});
