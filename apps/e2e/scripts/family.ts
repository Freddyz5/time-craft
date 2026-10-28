// A test family on the database at DATABASE_URL_UNPOOLED, by hand: to look
// around with the e2e's data, or to clean up after a run that died halfway.
// `bun run e2e` creates and deletes its own family; this does not touch it.
//
//   bun run family:create              creates one and prints it (with passwords)
//   bun run family:delete <id> [<id>]  deletes those test families
//   bun run family:delete --all        deletes every test family
//
// The package scripts load the repo root .env; the shell's variables win.
// Both refuse a database that is not marked as a test one (src/db.ts), and
// delete refuses a family with a parent outside the e2e's email domain.

import { openTestDatabase } from "../src/db";
import { databaseUrl } from "../src/env";
import {
	createServices,
	createTestFamily,
	deleteTestFamilies,
	findTestFamilies,
} from "../src/family";

const [command, ...args] = process.argv.slice(2);
const usage = "Usage: family.ts create | delete <familyId>... | delete --all";

async function run(): Promise<void> {
	if (command !== "create" && command !== "delete") {
		throw new Error(usage);
	}
	if (command === "delete" && args.length === 0) {
		throw new Error(usage);
	}
	const url = databaseUrl();
	const db = await openTestDatabase(url);
	try {
		if (command === "create") {
			const family = await createTestFamily(createServices(db));
			console.log(JSON.stringify(family, null, 2));
			return;
		}
		const ids = args.includes("--all")
			? await findTestFamilies(db)
			: args.filter((arg) => !arg.startsWith("--"));
		const deleted = await deleteTestFamilies(db, ids);
		console.log(
			deleted === 0
				? "No test families to delete."
				: `Deleted ${deleted} test famil${deleted === 1 ? "y" : "ies"}: ${ids.join(", ")}`,
		);
	} finally {
		await db.$client.end();
	}
}

try {
	await run();
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
}
