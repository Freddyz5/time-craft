// The e2e's own connection to the environment's database, only after the
// guard accepts it. The e2e writes there (a family per run, rows reset
// between tests), so it refuses any database that is not marked as a test
// one. A Neon connection string does not say which branch it points to, so
// the mark lives in the database itself, as its comment:
//
//   COMMENT ON DATABASE neondb IS 'timecraft:dev';
//
// Run once on Neon's dev branch (or a local database). A branch is a copy of
// main taken once, so the comment never reaches main: production is refused,
// and so is any other database without the mark.
import { createDb } from "@time-craft/db";
import { sql } from "drizzle-orm";

export const TEST_DATABASE_MARK = "timecraft:dev";

export type E2eDb = ReturnType<typeof createDb>;

// Host and database, never the credentials.
function describe(connectionString: string): string {
	try {
		const url = new URL(connectionString);
		return `${url.host}${url.pathname}`;
	} catch {
		return "an unparsable connection string";
	}
}

export async function assertTestDatabase(
	db: E2eDb,
	connectionString: string,
): Promise<void> {
	const { rows } = await db.execute<{ name: string; comment: string | null }>(
		sql`select current_database() as name,
			shobj_description(oid, 'pg_database') as comment
			from pg_database where datname = current_database()`,
	);
	const [database] = rows;
	if (database?.comment?.includes(TEST_DATABASE_MARK)) {
		return;
	}
	throw new Error(
		[
			`Refusing to touch ${describe(connectionString)}: it is not marked as a test database.`,
			"The e2e only runs on Neon's dev branch or a local database. If this is one, mark it once (SQL Editor, on that branch):",
			`  COMMENT ON DATABASE ${database?.name ?? "neondb"} IS '${TEST_DATABASE_MARK}';`,
			"Never mark main: it is production.",
		].join("\n"),
	);
}

export async function openTestDatabase(
	connectionString: string,
): Promise<E2eDb> {
	const db = createDb(connectionString);
	try {
		await assertTestDatabase(db, connectionString);
	} catch (error) {
		await db.$client.end();
		throw error;
	}
	return db;
}
