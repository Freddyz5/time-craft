import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/pglite/migrator";
import { families } from "./schema";
import {
	assertTestDatabase,
	resetTestDatabase,
	TEST_DATABASE_MARK,
} from "./test-database";
import { createTestDb, type TestDb } from "./testing";

const migrationsFolder = join(import.meta.dirname, "../migrations");

async function mark(db: TestDb) {
	await db.execute(
		sql.raw(`comment on database postgres is '${TEST_DATABASE_MARK}'`),
	);
}

async function tablesOf(db: TestDb, schema: string) {
	const { rows } = await db.execute<{ name: string }>(
		sql`select tablename as name from pg_tables where schemaname = ${schema}`,
	);
	return rows.map((row) => row.name);
}

async function addFamily(db: TestDb) {
	await db.insert(families).values({
		name: "Familia de prueba",
		timezone: "America/Guayaquil",
	});
}

describe("the test database guard", () => {
	test("refuses a database without the mark, and leaves it as it was", async () => {
		const db = await createTestDb();
		await addFamily(db);
		await expect(
			assertTestDatabase(db, "postgres://user:secret@ep-main.neon.tech/neondb"),
		).rejects.toThrow(
			"Refusing to touch ep-main.neon.tech/neondb: it is not marked",
		);
		await expect(resetTestDatabase(db)).rejects.toThrow("not marked");
		expect(await db.select().from(families)).toHaveLength(1);
	});

	test("never echoes the credentials", async () => {
		const db = await createTestDb();
		const error = await assertTestDatabase(
			db,
			"postgres://user:secret@ep-main.neon.tech/neondb",
		).catch((caught: Error) => caught);
		expect(String(error)).not.toContain("secret");
	});

	test("accepts a marked database", async () => {
		const db = await createTestDb();
		await mark(db);
		await assertTestDatabase(db);
	});
});

describe("resetTestDatabase", () => {
	test("empties a marked database, which the migrations then rebuild", async () => {
		const db = await createTestDb();
		await mark(db);
		await addFamily(db);
		expect(await tablesOf(db, "drizzle")).toEqual(["__drizzle_migrations"]);

		await resetTestDatabase(db);
		expect(await tablesOf(db, "public")).toEqual([]);
		expect(await tablesOf(db, "drizzle")).toEqual([]);

		await migrate(db, { migrationsFolder });
		expect(await db.select().from(families)).toEqual([]);
		await addFamily(db);
		// The mark belongs to the database, so it survives the reset.
		await assertTestDatabase(db);
	});
});
