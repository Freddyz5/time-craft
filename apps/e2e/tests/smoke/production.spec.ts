// Smoke test, read only: safe against production. No family, no database,
// no sign-in; only GETs and a page load.
//   E2E_BASE_URL  the web (its /api rewrite included)
//   E2E_API_URL   the api's own domain, for /health
import { expect, test } from "@playwright/test";
import { apiUrl } from "../../src/env";

test("the api answers /health", async ({ request }) => {
	const response = await request.get(`${apiUrl()}/health`);
	expect(response.status()).toBe(200);
	expect(await response.json()).toMatchObject({ ok: true });
});

test("the login page loads and is ready to sign in", async ({ page }) => {
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.goto("/login");
	await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
	await expect(page.getByLabel("Correo")).toBeEditable();
	await expect(page.getByLabel("Contraseña", { exact: true })).toBeEditable();
	await expect(
		page.getByRole("button", { name: "Entrar", exact: true }),
	).toBeEnabled();
	expect(errors).toEqual([]);
});

test("Better Auth answers at /api/auth through the web's rewrite", async ({
	request,
}) => {
	const ok = await request.get("/api/auth/ok");
	expect(ok.status()).toBe(200);
	expect(await ok.json()).toEqual({ ok: true });
	// No cookie, no session: Better Auth says so without an error.
	const session = await request.get("/api/auth/get-session");
	expect(session.status()).toBe(200);
	expect(await session.json()).toBeNull();
	// The rest of /api reaches the api too, and asks for a session.
	expect((await request.get("/api/me")).status()).toBe(401);
});
