// The e2e's `test`: the run's family and database (one per worker), Ana,
// Luis and the child each in their own browser context, and a clean slate
// before every test, since all of them share the family.
import {
	type Browser,
	test as base,
	expect,
	type PlaywrightWorkerArgs,
} from "@playwright/test";
import { type E2eDb, openTestDatabase } from "../../src/db";
import { databaseUrl } from "../../src/env";
import {
	createServices,
	resetTestFamily,
	type Services,
	type TestFamily,
} from "../../src/family";
import { closeOpenSession } from "./api";
import { apiAs, openAs, type Person } from "./people";
import { readFamily, type Who } from "./state";

interface WorkerFixtures {
	db: E2eDb;
	services: Services;
	family: TestFamily;
}

interface TestFixtures {
	cleanSlate: undefined;
	ana: Person;
	luis: Person;
	child: Person;
}

interface PersonArgs {
	browser: Browser;
	playwright: PlaywrightWorkerArgs["playwright"];
	db: E2eDb;
	family: TestFamily;
}

async function withPerson(
	who: Who,
	{ browser, playwright, db, family }: PersonArgs,
	use: (person: Person) => Promise<void>,
): Promise<void> {
	const opened = await openAs(browser, playwright, db, family, who);
	await use(opened);
	await opened.context.close();
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
	db: [
		// biome-ignore lint/correctness/noEmptyPattern: Playwright reads a fixture's dependencies from this pattern
		async ({}, use) => {
			const db = await openTestDatabase(databaseUrl());
			await use(db);
			await db.$client.end();
		},
		{ scope: "worker" },
	],
	services: [
		async ({ db }, use) => {
			await use(createServices(db));
		},
		{ scope: "worker" },
	],
	family: [
		// biome-ignore lint/correctness/noEmptyPattern: Playwright reads a fixture's dependencies from this pattern
		async ({}, use) => {
			await use(readFamily());
		},
		{ scope: "worker" },
	],
	cleanSlate: [
		async ({ playwright, db, family }, use) => {
			if (family.child !== null) {
				const request = await apiAs(playwright, db, family, "ana");
				await closeOpenSession(request, family.child.id);
				await request.dispose();
			}
			await resetTestFamily(db, family);
			await use(undefined);
		},
		{ auto: true },
	],
	ana: async ({ browser, playwright, db, family }, use) =>
		withPerson("ana", { browser, playwright, db, family }, use),
	luis: async ({ browser, playwright, db, family }, use) =>
		withPerson("luis", { browser, playwright, db, family }, use),
	child: async ({ browser, playwright, db, family }, use) =>
		withPerson("child", { browser, playwright, db, family }, use),
});

export { expect };
