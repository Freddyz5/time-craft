// In-memory Postgres (PGlite) with the real migrations applied, plus fixtures,
// for tests.
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Db } from "./client";
import * as schema from "./schema";

const migrationsFolder = join(import.meta.dirname, "../migrations");

export async function createTestDb() {
	const db = drizzle({ client: new PGlite(), schema });
	await migrate(db, { migrationsFolder });
	return db;
}

export type TestDb = Awaited<ReturnType<typeof createTestDb>>;

export function first<T>(rows: T[]): T {
	const [row] = rows;
	if (row === undefined) {
		throw new Error("Expected at least one row");
	}
	return row;
}

async function insertAuthUser(db: Db, name: string) {
	return first(
		await db
			.insert(schema.authUser)
			.values({
				id: randomUUID(),
				name,
				email: `${randomUUID()}@example.com`,
			})
			.returning(),
	);
}

// A family with two parents, a child, both activities and two bonus tasks.
// Each call creates a new family, so tests sharing a database do not collide.
export async function createFamily(db: Db) {
	const family = first(
		await db.insert(schema.families).values({ name: "Familia" }).returning(),
	);
	const familyId = family.id;

	const insertParent = async (name: string) =>
		first(
			await db
				.insert(schema.parents)
				.values({
					familyId,
					authUserId: (await insertAuthUser(db, name)).id,
					name,
				})
				.returning(),
		);
	const mom = await insertParent("Mamá");
	const dad = await insertParent("Papá");

	const child = first(
		await db
			.insert(schema.children)
			.values({
				familyId,
				authUserId: (await insertAuthUser(db, "Niño")).id,
				name: "Niño",
			})
			.returning(),
	);

	const insertActivity = async (code: string, name: string) =>
		first(
			await db
				.insert(schema.activities)
				.values({ familyId, code, name })
				.returning(),
		);
	const game = await insertActivity("game", "Juego");
	const tv = await insertActivity("tv", "TV");

	const insertBonusTask = async (name: string) =>
		first(
			await db
				.insert(schema.bonusTasks)
				.values({
					familyId,
					name,
					rewardMinutes: 15,
					createdByParentId: mom.id,
				})
				.returning(),
		);
	const homework = await insertBonusTask("Deberes");
	const reading = await insertBonusTask("Leer 20 min");

	return { family, mom, dad, child, game, tv, homework, reading };
}

export type FamilyFixture = Awaited<ReturnType<typeof createFamily>>;
