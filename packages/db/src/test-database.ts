// The guard of the tools that write freely to a database (the e2e and
// `bun run db:reset`), and the reset itself. They only touch a database
// marked as a test one. A Neon connection string does not say which branch
// it points to, so the mark lives in the database itself, as its comment:
//
//   COMMENT ON DATABASE neondb IS 'timecraft:dev';
//
// Run once on Neon's dev branch (or a local database). A branch is a copy of
// main taken once, so the comment never reaches main: production is refused,
// and so is any other database without the mark.
import { type SQL, sql } from "drizzle-orm";
import type { Db } from "./client";

export const TEST_DATABASE_MARK = "timecraft:dev";

// Neon and PGlite both answer raw SQL with { rows }; Db's type leaves the
// result open.
async function rowsOf<Row>(db: Db, query: SQL): Promise<Row[]> {
	const result = (await db.execute(query)) as unknown as { rows: Row[] };
	return result.rows;
}

// Host and database, never the credentials.
function describe(connectionString: string | undefined): string {
	if (connectionString === undefined) {
		return "this database";
	}
	try {
		const url = new URL(connectionString);
		return `${url.host}${url.pathname}`;
	} catch {
		return "an unparsable connection string";
	}
}

export async function assertTestDatabase(
	db: Db,
	connectionString?: string,
): Promise<void> {
	const [database] = await rowsOf<{ name: string; comment: string | null }>(
		db,
		sql`select current_database() as name,
			shobj_description(oid, 'pg_database') as comment
			from pg_database where datname = current_database()`,
	);
	if (database?.comment?.includes(TEST_DATABASE_MARK)) {
		return;
	}
	throw new Error(
		[
			`Refusing to touch ${describe(connectionString)}: it is not marked as a test database.`,
			"Only Neon's dev branch or a local database can be. If this is one, mark it once (SQL Editor, on that branch):",
			`  COMMENT ON DATABASE ${database?.name ?? "neondb"} IS '${TEST_DATABASE_MARK}';`,
			"Never mark main: it is production.",
		].join("\n"),
	);
}

// Empties a test database: drops the app's tables (and enum types, if a
// migration ever adds one) and Drizzle's record of the applied migrations,
// so they all run again from the first. The database and its mark stay.
export async function resetTestDatabase(
	db: Db,
	connectionString?: string,
): Promise<void> {
	await assertTestDatabase(db, connectionString);
	const tables = await rowsOf<{ name: string }>(
		db,
		sql`select tablename as name from pg_tables where schemaname = 'public'`,
	);
	const enums = await rowsOf<{ name: string }>(
		db,
		sql`select t.typname as name from pg_type t
			join pg_namespace n on n.oid = t.typnamespace
			where n.nspname = 'public' and t.typtype = 'e'`,
	);
	await db.transaction(async (tx) => {
		for (const { name } of tables) {
			await tx.execute(
				sql`drop table if exists public.${sql.identifier(name)} cascade`,
			);
		}
		for (const { name } of enums) {
			await tx.execute(
				sql`drop type if exists public.${sql.identifier(name)} cascade`,
			);
		}
		await tx.execute(sql`drop schema if exists drizzle cascade`);
	});
}
