import { beforeEach, describe, expect, test } from "bun:test";
import { families } from "@time-craft/db";
import { createTestDb } from "@time-craft/db/testing";
import { type HouseholdSeedInput, seedHousehold } from "./seed";
import { createTestServices } from "./testing/harness";

let services: ReturnType<typeof createTestServices>;

beforeEach(async () => {
	services = createTestServices(await createTestDb());
});

const input: HouseholdSeedInput = {
	familyName: "Familia Pérez",
	parents: [
		{ name: "Ana", email: "Ana@Example.com" },
		{ name: "Luis", email: "luis@example.com" },
	],
	parentPasswords: ["clave-de-ana", undefined],
	child: { name: "Mateo", username: "Mateo", pin: "123456" },
	policy: { dailyLimitMinutes: 45, weeklyLimitMinutes: 240 },
};

async function canSignIn(path: string, json: object) {
	const response = await services.app.request(path, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(json),
	});
	return response.status === 200;
}

describe("seedHousehold", () => {
	test("creates the household, the logins, the policy and the recovery code", async () => {
		const result = await seedHousehold(services, input);
		expect(result.created).toEqual({
			family: true,
			parents: 2,
			activities: 2,
			parentPasswords: 1,
			child: true,
			policy: true,
		});
		expect(result.recoveryCode).toMatch(/^([0-9A-Z]{5}-){4}[0-9A-Z]{5}$/);

		expect(
			await canSignIn("/api/auth/sign-in/email", {
				email: "ana@example.com",
				password: "clave-de-ana",
			}),
		).toBe(true);
		expect(
			await canSignIn("/api/auth/sign-in/username", {
				username: "mateo",
				password: "123456",
			}),
		).toBe(true);
		const [family] = await services.db.select().from(families);
		expect(family?.recoveryCodeHash).toStartWith("scrypt$");
	});

	test("is idempotent and never changes what exists", async () => {
		const first = await seedHousehold(services, input);
		const second = await seedHousehold(services, {
			...input,
			parentPasswords: ["otra-clave-de-ana", "clave-de-luis"],
			child: { name: "Mateo", username: "mateo", pin: "999999" },
			policy: { dailyLimitMinutes: 90, weeklyLimitMinutes: 400 },
		});
		expect(second).toEqual({
			familyId: first.familyId,
			created: {
				family: false,
				parents: 0,
				activities: 0,
				// Luis had none yet.
				parentPasswords: 1,
				child: false,
				policy: false,
			},
			recoveryCode: null,
		});
		expect(
			await canSignIn("/api/auth/sign-in/email", {
				email: "ana@example.com",
				password: "clave-de-ana",
			}),
		).toBe(true);
		expect(
			await canSignIn("/api/auth/sign-in/username", {
				username: "mateo",
				password: "123456",
			}),
		).toBe(true);
	});

	test("without a child, the parents create it from the app", async () => {
		const { child: _, ...withoutChild } = input;
		const result = await seedHousehold(services, withoutChild);
		expect(result.created).toMatchObject({ child: false, policy: false });
	});

	test("a weak parent password fails before writing anything", async () => {
		await expect(
			seedHousehold(services, {
				...input,
				parentPasswords: ["corta", undefined],
			}),
		).rejects.toMatchObject({ code: "invalid_input" });
		expect(await services.db.select().from(families)).toEqual([]);
	});
});
