// The e2e's own connection to the environment's database, only after the
// guard accepts it (@time-craft/db/test-database). The e2e writes there (a
// family per run, rows reset between tests), so it refuses any database that
// is not marked as a test one: production never is.
import { createDb } from "@time-craft/db";
import { assertTestDatabase } from "@time-craft/db/test-database";

export type E2eDb = ReturnType<typeof createDb>;

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
