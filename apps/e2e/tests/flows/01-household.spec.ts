// Step 1 · Configurar el hogar (parents, once): the seed makes the family,
// the parents and the activities; the parents create the child's account
// and turn on notifications on their phones. The account is made on a
// family of its own, still without a child, which this file deletes.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BrowserContext, PlaywrightWorkerArgs } from "@playwright/test";
import { type E2eDb, openTestDatabase } from "../../src/db";
import { databaseUrl } from "../../src/env";
import {
	createServices,
	createTestFamily,
	deleteTestFamilies,
	type TestFamily,
} from "../../src/family";
import { subscriptionsOf } from "../support/db";
import { expect, test } from "../support/fixtures";
import { apiAs, contextOptions } from "../support/people";
import { authFile, type Who } from "../support/state";
import { signInChild, signInParent, toast } from "../support/ui";

test.describe("a new family", () => {
	let newFamily: TestFamily;

	test.beforeAll(async () => {
		const db = await openTestDatabase(databaseUrl());
		try {
			newFamily = await createTestFamily(createServices(db), { child: false });
		} finally {
			await db.$client.end();
		}
	});

	test.afterAll(async () => {
		const db = await openTestDatabase(databaseUrl());
		try {
			await deleteTestFamilies(db, [newFamily.id]);
		} finally {
			await db.$client.end();
		}
	});

	test("a parent signs in, creates the child's account and the child signs in with it", async ({
		browser,
	}) => {
		const parentContext = await browser.newContext(contextOptions());
		const parent = await parentContext.newPage();
		await signInParent(parent, newFamily.parents[0]);
		await expect(
			parent.getByRole("heading", { name: "Empecemos por la cuenta del niño" }),
		).toBeVisible();

		await parent.goto("/padres/cuentas");
		const form = parent.getByRole("region", {
			name: "Crear la cuenta del niño",
		});
		const username = `e2e_${newFamily.name.slice(4)}_k`;
		await form.getByLabel("Nombre").fill("Sofía");
		await form.getByLabel("Usuario").fill(username);
		await form.getByLabel("PIN nuevo").fill("246813");
		await form.getByLabel("Repite el PIN").fill("246813");
		await form.getByRole("button", { name: "Crear la cuenta" }).click();
		await expect(toast(parent, "Cuenta de Sofía creada")).toBeVisible();
		await expect(
			parent.getByRole("heading", { name: "Cuenta de Sofía" }),
		).toBeVisible();

		// The seed brought the activities; their limits are set per child.
		await parent.goto("/padres/reglas");
		const perActivity = parent.getByRole("region", {
			name: "Límites por actividad",
		});
		await expect(
			perActivity.getByRole("heading", { name: "Juego" }),
		).toBeVisible();
		await expect(
			perActivity.getByRole("heading", { name: "TV" }),
		).toBeVisible();
		await parentContext.close();

		const childContext = await browser.newContext(contextOptions());
		const child = await childContext.newPage();
		await signInChild(child, { username }, "246813");
		await expect(child).toHaveURL(/\/nino$/);
		await expect(
			child.getByRole("heading", { name: "Todavía no hay reglas de tiempo" }),
		).toBeVisible();
		await childContext.close();
	});
});

// Push needs a real Chrome profile: an incognito context has no Push API.
async function phoneOf(
	playwright: PlaywrightWorkerArgs["playwright"],
	db: E2eDb,
	family: TestFamily,
	who: Who,
): Promise<{ context: BrowserContext; close: () => Promise<void> }> {
	// Makes sure the saved session still works.
	await (await apiAs(playwright, db, family, who)).dispose();
	const profile = mkdtempSync(join(tmpdir(), "timecraft-e2e-"));
	const context = await playwright.chromium.launchPersistentContext(profile, {
		...contextOptions(),
		channel: "chrome",
		permissions: ["notifications"],
	});
	const { cookies } = JSON.parse(readFileSync(authFile(who), "utf8"));
	await context.addCookies(cookies);
	return {
		context,
		close: async () => {
			await context.close();
			rmSync(profile, { recursive: true, force: true });
		},
	};
}

test("parents and the child turn on notifications on their phones", async ({
	playwright,
	db,
	family,
}) => {
	const phones = [
		{
			who: "ana" as const,
			path: "/padres/cuentas",
			done: "Avisos activados en este dispositivo",
			authUserId: family.parents[0].authUserId,
		},
		{
			who: "child" as const,
			path: "/nino/avisos",
			done: "¡Listo! Te vamos a avisar aquí.",
			authUserId: family.child?.authUserId ?? "",
		},
	];
	for (const phone of phones) {
		const { context, close } = await phoneOf(playwright, db, family, phone.who);
		try {
			const page = await context.newPage();
			await page.goto(phone.path);
			await page.getByRole("button", { name: "Activar avisos" }).last().click();
			await expect(toast(page, phone.done)).toBeVisible();
			const [subscription] = await subscriptionsOf(db, phone.authUserId);
			expect(subscription?.endpoint).toMatch(/^https:\/\//);

			// Off again: the api forgets this phone.
			await page.getByRole("button", { name: "Desactivar" }).click();
			await expect(
				page.getByRole("button", { name: "Activar avisos" }).last(),
			).toBeVisible();
			await expect
				.poll(() => subscriptionsOf(db, phone.authUserId))
				.toHaveLength(0);
		} finally {
			await close();
		}
	}
});
