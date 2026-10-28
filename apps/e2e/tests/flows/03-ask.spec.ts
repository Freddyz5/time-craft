// Step 3 · Pedir (the child): a request to start, or for extra time once the
// quota is used up. Only one pending at a time; it expires after 15 minutes
// without an answer; the child may cancel it.
import { askFor, errorCode } from "../support/api";
import { expireRequest } from "../support/db";
import { expect, test } from "../support/fixtures";
import { childAsks, requestCard, toast } from "../support/ui";

test("the child asks to start and the parents see it", async ({
	ana,
	luis,
	child,
}) => {
	await childAsks(child.page, { activity: "Juego", minutes: 40 });
	await expect(
		child.page.getByRole("heading", { name: "Esperando a mamá o papá" }),
	).toBeVisible();
	await expect(child.page.getByText("Pediste 40 min de Juego")).toBeVisible();

	// Both parents get it on Inicio, with the time it has left.
	for (const parent of [ana, luis]) {
		await parent.page.goto("/padres");
		const card = requestCard(parent.page, "Mateo pide 40 min de Juego");
		await expect(card).toBeVisible();
		await expect(card.getByText(/expira en 1[45]\smin/)).toBeVisible();
	}
});

test("only one request can wait at a time", async ({ child, family, ana }) => {
	await childAsks(child.page, { activity: "Juego", minutes: 30 });
	// The form gives way to the pending request…
	await expect(
		child.page.getByRole("button", { name: /^Pedir \d+ min/ }),
	).toHaveCount(0);
	// …and the api refuses a second one.
	const second = await askFor(child.request, {
		activityId: family.activities.tv,
		minutes: 20,
	});
	expect(second.status()).toBe(409);
	expect(await errorCode(second)).toBe("request_already_pending");

	await ana.page.goto("/padres");
	await expect(
		ana.page.getByRole("heading", { name: "Una solicitud" }),
	).toBeVisible();
});

test("the child cancels a pending request", async ({ child, ana }) => {
	await childAsks(child.page, { activity: "TV", minutes: 20 });
	await child.page.getByRole("button", { name: "Cancelar pedido" }).click();
	await expect(toast(child.page, "Pedido cancelado")).toBeVisible();
	await expect(child.page.getByText("Lo cancelaste")).toBeVisible();
	// The form is back.
	await expect(
		child.page.getByRole("button", { name: /^Pedir \d+ min/ }),
	).toBeVisible();

	await ana.page.goto("/padres");
	await expect(ana.page.getByText("No hay nada corriendo")).toBeVisible();
	await expect(requestCard(ana.page, /Mateo pide/)).toHaveCount(0);
});

test("a request nobody answers expires and the child can ask again", async ({
	child,
	ana,
	db,
	family,
}) => {
	const response = await askFor(child.request, {
		activityId: family.activities.game,
		minutes: 30,
	});
	const { request } = (await response.json()) as { request: { id: string } };
	await expireRequest(db, request.id);

	await child.page.goto("/nino/pedir");
	await expect(child.page.getByText("Nadie respondió a tiempo")).toBeVisible();
	await expect(
		child.page.getByRole("button", { name: /^Pedir \d+ min/ }),
	).toBeVisible();

	await ana.page.goto("/padres");
	await expect(requestCard(ana.page, /Mateo pide/)).toHaveCount(0);
});
