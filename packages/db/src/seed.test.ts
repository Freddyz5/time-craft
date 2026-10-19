import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { authUser, families } from "./schema";
import { type SeedInput, seed } from "./seed";
import { createTestDb, type TestDb } from "./testing";

let db: TestDb;

beforeAll(async () => {
	db = await createTestDb();
});

const input: SeedInput = {
	familyName: "Familia Pérez",
	parents: [
		{ name: "Ana", email: " Ana@Example.com " },
		{ name: "Luis", email: "luis@example.com" },
	],
};

describe("seed", () => {
	test("creates the family, both parents and the activities, once", async () => {
		const first = await seed(db, input);
		expect(first.created).toEqual({ family: true, parents: 2, activities: 2 });

		const second = await seed(db, input);
		expect(second).toEqual({
			familyId: first.familyId,
			created: { family: false, parents: 0, activities: 0 },
		});

		const family = await db.query.families.findFirst({
			where: eq(families.id, first.familyId),
			with: {
				parents: { with: { authUser: true } },
				activities: true,
			},
		});
		expect(family?.name).toBe("Familia Pérez");
		expect(
			family?.parents.map((parent) => ({
				name: parent.name,
				email: parent.authUser.email,
				emailVerified: parent.authUser.emailVerified,
			})),
		).toEqual(
			expect.arrayContaining([
				{ name: "Ana", email: "ana@example.com", emailVerified: false },
				{ name: "Luis", email: "luis@example.com", emailVerified: false },
			]),
		);
		expect(
			family?.activities.map(({ code, name, isActive }) => ({
				code,
				name,
				isActive,
			})),
		).toEqual(
			expect.arrayContaining([
				{ code: "game", name: "Juego", isActive: true },
				{ code: "tv", name: "TV", isActive: true },
			]),
		);
		expect(await db.$count(authUser)).toBe(2);
		expect(await db.$count(families)).toBe(1);
	});

	test("rejects the same email for both parents", async () => {
		await expect(
			seed(db, {
				...input,
				parents: [
					{ name: "Ana", email: "ana@example.com" },
					{ name: "Otra", email: "ANA@example.com" },
				],
			}),
		).rejects.toThrow("Each parent needs a different email");
	});
});
