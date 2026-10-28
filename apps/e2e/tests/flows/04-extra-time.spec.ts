// Steps 3 and 4 with the quota used up: extra time. Only then can the child
// ask for it, always with a reason, and only a parent can give it. It is an
// override, kept with its reason, for a new session.
import { askFor, errorCode } from "../support/api";
import { lastSession, overridesOf, useUpToday } from "../support/db";
import { expect, test } from "../support/fixtures";
import { choice, requestCard, toast } from "../support/ui";

test("extra time is only for when the quota is used up", async ({
	child,
	family,
}) => {
	const early = await askFor(child.request, {
		activityId: family.activities.game,
		minutes: 20,
		extraTime: true,
		reason: "Quiero más",
	});
	expect(early.status()).toBe(422);
	expect(await errorCode(early)).toBe("quota_not_exhausted");
});

test("the child asks for extra time with a reason and a parent gives it", async ({
	ana,
	child,
	db,
	family,
}) => {
	await useUpToday(db, family);

	await child.page.goto("/nino/pedir");
	await choice(child.page, /^Juego/).click();
	await expect(
		child.page.getByRole("heading", { name: "¿Cuánto tiempo extra?" }),
	).toBeVisible();
	await choice(child.page, "20 minutos").click();
	// No reason, no request.
	await child.page
		.getByRole("button", { name: "Pedir 20 min extra de Juego" })
		.click();
	await expect(
		child.page.getByText("Cuéntales por qué, así pueden decidir."),
	).toBeVisible();
	await child.page
		.getByRole("button", { name: "Ya hice todos mis deberes" })
		.click();
	await child.page
		.getByRole("button", { name: "Pedir 20 min extra de Juego" })
		.click();
	await expect(toast(child.page, "¡Pedido enviado!")).toBeVisible();

	await ana.page.goto("/padres");
	const card = requestCard(ana.page, "Mateo pide 20 min extra de Juego");
	await expect(card.getByText("«Ya hice todos mis deberes»")).toBeVisible();
	await card.getByRole("button", { name: "Aprobar", exact: true }).click();
	await expect(
		toast(ana.page, "Aprobado: 20 min de Juego, desde ya"),
	).toBeVisible();
	await expect(ana.page.getByText(/con tiempo extra/)).toBeVisible();

	const session = await lastSession(db, family);
	const [override] = await overridesOf(db, family);
	expect(override).toMatchObject({
		extraMinutes: 20,
		reason: "Ya hice todos mis deberes",
		requestId: session.requestId,
		grantedByParentId: family.parents[0].id,
	});
	expect(session).toMatchObject({
		status: "running",
		overrideId: override?.id,
		plannedDurationSeconds: 20 * 60,
	});

	await child.page.goto("/nino");
	await expect(
		child.page.getByRole("heading", { name: "¡Ana dijo que sí!" }),
	).toBeVisible();
});

test("a parent gives extra time without a request, with a reason", async ({
	luis,
	db,
	family,
}) => {
	await useUpToday(db, family);

	await luis.page.goto("/padres/sesion");
	await choice(luis.page, /^Juego/).click();
	await expect(
		luis.page.getByRole("heading", { name: "Tiempo extra" }),
	).toBeVisible();
	await luis.page.getByRole("button", { name: "30 min", exact: true }).click();
	const give = luis.page.getByRole("button", { name: "Dar 30 min de Juego" });
	await expect(give).toBeDisabled();
	await luis.page.getByLabel("Motivo").fill("Ganó el torneo del colegio");
	await give.click();
	await expect(
		toast(luis.page, "Tiempo extra: 30 min de Juego, desde ya"),
	).toBeVisible();

	const [override] = await overridesOf(db, family);
	expect(override).toMatchObject({
		extraMinutes: 30,
		reason: "Ganó el torneo del colegio",
		requestId: null,
		grantedByParentId: family.parents[1].id,
	});
	expect((await lastSession(db, family)).overrideId).toBe(override?.id);
});
