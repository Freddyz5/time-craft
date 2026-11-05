// bun run db:reset (the repo root's runs this, then the seed): empties the
// database at DATABASE_URL_UNPOOLED and applies every migration again, with
// Drizzle's migrator on the same files and journal as drizzle-kit migrate.
// Only a database marked as a test one (src/test-database.ts): never
// production. The package script loads the repo root .env; the shell's
// variables win.
import { join } from "node:path";
import { migrate } from "drizzle-orm/neon-serverless/migrator";
import { createDb } from "../src/client";
import { resetTestDatabase } from "../src/test-database";

const url = process.env.DATABASE_URL_UNPOOLED?.trim();
if (!url) {
	console.error(
		"Set DATABASE_URL_UNPOOLED to the direct connection string of the database to reset.",
	);
	process.exit(1);
}

const db = createDb(url);
try {
	await resetTestDatabase(db, url);
	await migrate(db, {
		migrationsFolder: join(import.meta.dirname, "../migrations"),
	});
	console.log("The database is empty and migrated.");
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
} finally {
	await db.$client.end();
}
