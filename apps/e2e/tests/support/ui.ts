// Moves through the screens the way a person does, shared by several specs.
import { expect, type Locator, type Page } from "@playwright/test";

// Sign in at /login with email and password (Google is not testable here).
export async function signInParent(
	page: Page,
	parent: { email: string; password: string },
): Promise<void> {
	await page.goto("/login");
	await page.getByLabel("Correo").fill(parent.email);
	await page.getByLabel("Contraseña", { exact: true }).fill(parent.password);
	await page.getByRole("button", { name: "Entrar", exact: true }).click();
	await expect(page).toHaveURL(/\/padres\/?$/);
}

// The child's username, then the PIN on the keypad.
export async function signInChild(
	page: Page,
	child: { username: string },
	pin: string,
): Promise<void> {
	await page.goto("/nino/entrar");
	await page.getByLabel("Usuario").fill(child.username);
	await page.getByRole("button", { name: "Siguiente" }).click();
	await typePin(page, pin);
}

export async function typePin(page: Page, pin: string): Promise<void> {
	const keypad = page.getByRole("group", { name: "Teclado del PIN" });
	for (const digit of pin) {
		await keypad.getByRole("button", { name: digit, exact: true }).click();
	}
	await keypad.getByRole("button", { name: "Entrar" }).click();
}

// A choice drawn over a hidden radio (activities, bricks, segmented
// controls): tap its label, as a finger would.
export function choice(scope: Page | Locator, name: string | RegExp): Locator {
	// `has` is matched inside each label, so it starts from the page.
	const page = "page" in scope ? scope.page() : scope;
	return scope.locator("label", {
		has: page.getByRole("radio", { name, exact: typeof name === "string" }),
	});
}

// Pedir: the activity, the minutes as bricks and, for extra time, a reason.
export async function childAsks(
	page: Page,
	input: { activity: string; minutes: number; reason?: string },
): Promise<void> {
	await page.goto("/nino/pedir");
	await choice(page, new RegExp(`^${input.activity}`)).click();
	await choice(page, `${input.minutes} minutos`).click();
	if (input.reason !== undefined) {
		await page.getByLabel("O escríbelo tú").fill(input.reason);
	}
	await page
		.getByRole("button", { name: new RegExp(`^Pedir ${input.minutes} min`) })
		.click();
	await expect(page.getByText("¡Pedido enviado!")).toBeVisible();
}

// The card of a pending request on the parents' Inicio.
export function requestCard(page: Page, title: string | RegExp): Locator {
	return page.getByRole("article", { name: title });
}

// A toast (or any status line) with this text.
export function toast(page: Page, text: string | RegExp): Locator {
	return page
		.getByRole("status")
		.or(page.getByRole("alert"))
		.filter({ hasText: text })
		.first();
}
