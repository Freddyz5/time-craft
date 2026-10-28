// After the e2e project: close whatever session is still open (so its QStash
// messages are cancelled) and delete the run's family with its logins.
import { test as teardown } from "@playwright/test";
import { openTestDatabase } from "../../src/db";
import { databaseUrl } from "../../src/env";
import { deleteTestFamilies } from "../../src/family";
import { closeOpenSession } from "../support/api";
import { apiAs } from "../support/people";
import { clearState, hasFamily, readFamily } from "../support/state";

teardown("delete the run's family", async ({ playwright }) => {
	if (!hasFamily()) {
		return;
	}
	const family = readFamily();
	const db = await openTestDatabase(databaseUrl());
	try {
		if (family.child !== null) {
			const request = await apiAs(playwright, db, family, "ana");
			await closeOpenSession(request, family.child.id);
			await request.dispose();
		}
		await deleteTestFamilies(db, [family.id]);
		clearState();
	} finally {
		await db.$client.end();
	}
});
