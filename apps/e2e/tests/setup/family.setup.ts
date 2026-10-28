// Before the e2e project: a fresh family for this run (and away with the one
// a crashed run may have left), then Ana, Luis and the child signed in once,
// their sessions saved for the tests' browser contexts.
import { test as setup } from "@playwright/test";
import { openTestDatabase } from "../../src/db";
import {
	baseUrl,
	bypassCookieHeaders,
	bypassHeaders,
	databaseUrl,
} from "../../src/env";
import {
	clearSignInLimits,
	createServices,
	createTestFamily,
	deleteTestFamilies,
} from "../../src/family";
import { credentialsOf, signIn } from "../support/people";
import { authFile, hasFamily, readFamily, writeFamily } from "../support/state";

setup(
	"create the run's family and sign everyone in",
	async ({ playwright }) => {
		const db = await openTestDatabase(databaseUrl());
		try {
			if (hasFamily()) {
				// Best effort: it may live in another database.
				await deleteTestFamilies(db, [readFamily().id]).catch(() => undefined);
			}
			const family = await createTestFamily(createServices(db));
			writeFamily(family);
			await clearSignInLimits(db);
			for (const who of ["ana", "luis", "child"] as const) {
				const request = await playwright.request.newContext({
					baseURL: baseUrl(),
					extraHTTPHeaders: bypassHeaders(),
				});
				await signIn(request, credentialsOf(family, who));
				const cookie = bypassCookieHeaders();
				if (Object.keys(cookie).length > 0) {
					await request.get("/", { headers: cookie });
				}
				await request.storageState({ path: authFile(who) });
				await request.dispose();
			}
		} finally {
			await db.$client.end();
		}
	},
);
