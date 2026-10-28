// Permissions and accounts: the child only reads and asks; five wrong PINs
// lock the child out until a parent sets a new one; a parent resets the
// other's password; the family's recovery code is the last resort; a parent
// signs the child out everywhere.

import { devices } from "@playwright/test";
import { clearSignInLimits, restoreCredentials } from "../../src/family";
import { approve, createRequest, startSession } from "../support/api";
import { childOf } from "../support/db";
import { expect, test } from "../support/fixtures";
import { contextOptions } from "../support/people";
import { signInChild, signInParent, toast, typePin } from "../support/ui";

// Tests here change passwords and the PIN: back to the family's after each.
test.afterEach(async ({ services, family }) => {
	await restoreCredentials(services, family);
});

test("the child cannot use the parents' screens or actions", async ({
	ana,
	child,
	family,
}) => {
	const { id: childId } = childOf(family);
	const request = await createRequest(child.request, {
		activityId: family.activities.game,
		minutes: 30,
	});
	const session = await startSession(ana.request, {
		childId,
		activityId: family.activities.game,
		minutes: 30,
	});

	// The parents' side sends the child back to theirs.
	await child.page.goto("/padres");
	await expect(child.page).toHaveURL(/\/nino\/?$/);
	await expect(
		child.page.getByRole("heading", { name: "Ahora" }),
	).toBeVisible();
	await expect(
		child.page.getByRole("button", { name: /Pausar|Detener|Reanudar/ }),
	).toHaveCount(0);

	// And the api refuses every parent action.
	const attempts = [
		approve(child.request, request.id, { approvedMinutes: 30 }),
		child.request.post("/api/sessions", {
			data: { childId, activityId: family.activities.tv, minutes: 10 },
		}),
		child.request.post(`/api/sessions/${session.id}/pause`, { data: {} }),
		child.request.post(`/api/sessions/${session.id}/stop`),
		child.request.put(`/api/children/${childId}/pin`, {
			data: { pin: "135790" },
		}),
		child.request.post(`/api/children/${childId}/policies`, {
			data: {
				activityId: null,
				dailyLimitMinutes: 600,
				weeklyLimitMinutes: 3000,
			},
		}),
		child.request.post("/api/bonus-tasks", {
			data: { name: "Nada", rewardMinutes: 60 },
		}),
		child.request.post("/api/recovery-code"),
		child.request.get(`/api/children/${childId}/logins`),
	];
	for (const attempt of attempts) {
		const response = await attempt;
		expect(response.status(), response.url()).toBe(403);
	}
});

test("five wrong PINs lock the child out until a parent sets a new PIN", async ({
	browser,
	ana,
	db,
	family,
}) => {
	const kid = childOf(family);
	const wrong = kid.pin.replace(/^\d/, (d) => String((Number(d) + 1) % 10));
	const context = await browser.newContext(contextOptions());
	const page = await context.newPage();

	await signInChild(page, kid, wrong);
	await expect(page.getByText("No coinciden. Revisa tu PIN.")).toBeVisible();
	for (let attempt = 2; attempt <= 5; attempt++) {
		await typePin(page, wrong);
		if (attempt < 5) {
			await expect(
				page.getByText("No coinciden. Revisa tu PIN."),
			).toBeVisible();
		}
	}
	await expect(
		page.getByText("Tu cuenta descansa un rato", { exact: true }),
	).toBeVisible();
	await expect(
		page.getByRole("group", { name: "Teclado del PIN" }),
	).toHaveCount(0);

	// The parents see it, and a new PIN lifts it.
	await ana.page.goto("/padres");
	await expect(
		ana.page.getByText(/La cuenta de Mateo está bloqueada hasta las/),
	).toBeVisible();
	await ana.page.goto("/padres/cuentas");
	const account = ana.page.getByRole("region", { name: "Cuenta de Mateo" });
	await expect(account.getByText(/Bloqueada hasta las/)).toBeVisible();
	await account.getByRole("button", { name: "Cambiar su PIN" }).click();
	await account.getByLabel("PIN nuevo").fill("975310");
	await account.getByLabel("Repite el PIN").fill("975310");
	await account.getByRole("button", { name: "Guardar PIN" }).click();
	await expect(
		toast(ana.page, "PIN cambiado: ya puede volver a entrar"),
	).toBeVisible();
	await expect(account.getByText(/Bloqueada hasta las/)).toHaveCount(0);

	// Five attempts used the minute's sign-in limit; that is Better Auth's.
	await clearSignInLimits(db);
	await signInChild(page, kid, "975310");
	await expect(page).toHaveURL(/\/nino\/?$/);
	await context.close();
});

test("a parent sets a new password for the other parent", async ({
	browser,
	ana,
	family,
}) => {
	const [, luis] = family.parents;
	await ana.page.goto("/padres/cuentas");
	await ana.page
		.getByRole("button", { name: "Cambiar la contraseña de Luis" })
		.click();
	await ana.page.getByLabel("Contraseña nueva").fill("luis-nueva-2026");
	await ana.page.getByLabel("Repite la contraseña").fill("luis-nueva-2026");
	await ana.page.getByRole("button", { name: "Cambiar la de Luis" }).click();
	await expect(
		toast(ana.page, "Contraseña de Luis cambiada. Díselo en persona."),
	).toBeVisible();

	const context = await browser.newContext(contextOptions());
	const page = await context.newPage();
	await signInParent(page, { email: luis.email, password: "luis-nueva-2026" });
	await expect(
		page.getByRole("heading", { name: "Inicio: Mateo" }),
	).toBeAttached();
	await context.close();
});

test("the family's recovery code sets a new password, once", async ({
	browser,
	ana,
	family,
}) => {
	const [, luis] = family.parents;
	// A fresh code, shown once.
	await ana.page.goto("/padres/cuentas");
	const recovery = ana.page.getByRole("region", {
		name: "Código de recuperación",
	});
	await recovery.getByRole("button", { name: "Generar uno nuevo" }).click();
	await ana.page
		.getByRole("dialog", { name: "¿Generar un código nuevo?" })
		.getByRole("button", { name: "Generar" })
		.click();
	const code = (await recovery.locator("code").textContent())?.trim() ?? "";
	expect(code).toMatch(/^[0-9A-Z]{5}(-[0-9A-Z]{5}){4}$/);

	const context = await browser.newContext(contextOptions());
	const page = await context.newPage();
	const useCode = async (password: string) => {
		await page.goto("/recuperar");
		await page.getByLabel("Tu correo").fill(luis.email);
		await page.getByLabel("Código de recuperación").fill(code);
		await page.getByLabel("Contraseña nueva").fill(password);
		await page.getByLabel("Repite la contraseña").fill(password);
		await page.getByRole("button", { name: "Cambiar la contraseña" }).click();
	};
	await useCode("recuperada-2026");
	await expect(
		page.getByRole("heading", { name: "Listo: ya puedes entrar" }),
	).toBeVisible();
	const next = (await page.locator("code").textContent())?.trim();
	expect(next).toMatch(/^[0-9A-Z]{5}(-[0-9A-Z]{5}){4}$/);
	expect(next).not.toBe(code);

	await signInParent(page, { email: luis.email, password: "recuperada-2026" });

	// Single use: the same code fails now.
	await page.context().clearCookies();
	await useCode("otra-clave-2026");
	await expect(page.getByRole("alert")).toBeVisible();
	await expect(
		page.getByRole("heading", { name: "Listo: ya puedes entrar" }),
	).toHaveCount(0);
	await context.close();
});

test("a parent signs the child out of every device", async ({
	browser,
	ana,
	child,
	family,
}) => {
	// Signed in on the phone (the fixture) and now on the PC as well.
	await child.page.goto("/nino");
	await expect(
		child.page.getByRole("heading", { name: "Tu tiempo" }),
	).toBeAttached();
	const pc = await browser.newContext({
		...contextOptions(),
		...devices["Desktop Chrome"],
	});
	const pcPage = await pc.newPage();
	await signInChild(pcPage, childOf(family), childOf(family).pin);
	await expect(pcPage).toHaveURL(/\/nino\/?$/);

	await ana.page.goto("/padres/cuentas");
	const account = ana.page.getByRole("region", { name: "Cuenta de Mateo" });
	await expect(account.getByText("Chrome en Windows")).toBeVisible();
	await account.getByRole("button", { name: "Cerrar en todos" }).click();
	await ana.page
		.getByRole("dialog", { name: /^¿Cerrar la sesión de Mateo/ })
		.getByRole("button", { name: "Cerrar en todos" })
		.click();
	await expect(
		toast(ana.page, /^Sesión cerrada en \d+ dispositivos$/),
	).toBeVisible();
	await expect(account.getByText(/^Ningún dispositivo/)).toBeVisible();

	// Both are back at the child's sign-in.
	for (const page of [child.page, pcPage]) {
		await page.reload();
		await expect(page).toHaveURL(/\/nino\/entrar/);
	}
	await pc.close();
});
