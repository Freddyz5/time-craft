// Step 4 · Aprobar o rechazar (parents): approve as asked or fewer minutes,
// to start now or later today, or reject with a note. The session is created
// in the same transaction, and the child hears back.
import { approve, createRequest, errorCode } from "../support/api";
import { alertsOf, lastSession } from "../support/db";
import { expect, test } from "../support/fixtures";
import { childAsks, choice, requestCard, toast } from "../support/ui";

test("approve now: the session starts and the child sees it", async ({
	ana,
	child,
	db,
	family,
}) => {
	await childAsks(child.page, { activity: "Juego", minutes: 30 });

	await ana.page.goto("/padres");
	const card = requestCard(ana.page, "Mateo pide 30 min de Juego");
	await card.getByRole("button", { name: "Aprobar", exact: true }).click();
	await expect(
		toast(ana.page, "Aprobado: 30 min de Juego, desde ya"),
	).toBeVisible();
	await expect(ana.page.getByRole("heading", { name: "Ahora" })).toBeVisible();
	await expect(ana.page.getByText(/^Termina a las \d\d:\d\d$/)).toBeVisible();
	await expect(ana.page.getByRole("button", { name: "Pausar" })).toBeVisible();

	const session = await lastSession(db, family);
	expect(session).toMatchObject({
		status: "running",
		plannedDurationSeconds: 30 * 60,
		startedByParentId: family.parents[0].id,
	});
	expect(session.requestId).not.toBeNull();

	await child.page.goto("/nino");
	await expect(
		child.page.getByRole("heading", { name: "¡Ana dijo que sí!" }),
	).toBeVisible();
	await expect(
		child.page.getByRole("heading", { name: "Ahora" }),
	).toBeVisible();
});

test("approve later, then a parent starts it early", async ({
	ana,
	child,
	db,
	family,
}) => {
	await childAsks(child.page, { activity: "Juego", minutes: 30 });

	await ana.page.goto("/padres");
	const card = requestCard(ana.page, "Mateo pide 30 min de Juego");
	await card.getByRole("button", { name: "Ajustar" }).click();
	await choice(card, "Más tarde hoy").click();
	const time = await card.getByLabel("Hora de inicio").inputValue();
	await card.getByRole("button", { name: `Aprobar para las ${time}` }).click();
	await expect(toast(ana.page, `Aprobado para las ${time}`)).toBeVisible();
	await expect(
		ana.page.getByRole("heading", { name: "Más tarde" }),
	).toBeVisible();

	const scheduled = await lastSession(db, family);
	expect(scheduled.status).toBe("scheduled");
	expect(scheduled.startedAt).toBeNull();

	await child.page.goto("/nino");
	await expect(
		child.page.getByRole("heading", { name: "Tu próxima sesión" }),
	).toBeVisible();

	await ana.page.getByRole("button", { name: "Empezar ya" }).click();
	await expect(toast(ana.page, "Juego empezó ahora")).toBeVisible();
	await expect(ana.page.getByRole("heading", { name: "Ahora" })).toBeVisible();
	await expect(
		child.page.getByRole("heading", { name: "Ahora" }),
	).toBeVisible();

	const started = await lastSession(db, family);
	expect(started).toMatchObject({ id: scheduled.id, status: "running" });
	// Its start job is cancelled; the running ones take over.
	const alerts = await alertsOf(db, started.id);
	const start = alerts.find((alert) => alert.alertType === "start");
	expect(start?.cancelledAt).not.toBeNull();
	expect(
		alerts
			.filter((alert) => alert.cancelledAt === null)
			.map((alert) => alert.alertType),
	).toEqual(["warning", "end", "auto_close"]);
});

test("approve fewer minutes than asked", async ({ ana, child, db, family }) => {
	await childAsks(child.page, { activity: "Juego", minutes: 40 });

	await ana.page.goto("/padres");
	const card = requestCard(ana.page, "Mateo pide 40 min de Juego");
	await card.getByRole("button", { name: "Ajustar" }).click();
	await card.getByLabel("Minutos aprobados").fill("25");
	await card.getByRole("button", { name: "Aprobar 25 min" }).click();
	await expect(
		toast(ana.page, "Aprobado: 25 min de Juego, desde ya"),
	).toBeVisible();

	expect(await lastSession(db, family)).toMatchObject({
		status: "running",
		plannedDurationSeconds: 25 * 60,
	});
	await child.page.goto("/nino");
	await expect(
		child.page.getByText("25 min de Juego (pediste 40 min)."),
	).toBeVisible();
});

test("reject with a note the child reads", async ({ ana, child }) => {
	await childAsks(child.page, { activity: "TV", minutes: 30 });

	await ana.page.goto("/padres");
	const card = requestCard(ana.page, "Mateo pide 30 min de TV");
	await card.getByRole("button", { name: "Rechazar" }).click();
	await card.getByLabel(/Nota para Mateo/).fill("Hoy no, mañana sí");
	await card.getByRole("button", { name: "Rechazar" }).click();
	await expect(
		toast(ana.page, "Solicitud rechazada: Mateo verá tu nota"),
	).toBeVisible();
	await expect(ana.page.getByText("No hay nada corriendo")).toBeVisible();

	await child.page.goto("/nino/pedir");
	await expect(
		child.page.getByRole("heading", { name: "Ana dijo que no esta vez" }),
	).toBeVisible();
	await expect(child.page.getByText("«Hoy no, mañana sí»")).toBeVisible();
	// A new request is a choice, not a reflex.
	await expect(
		child.page.getByRole("button", { name: "Pedir otra cosa" }),
	).toBeVisible();
});

test("if both parents approve, the first one wins", async ({
	ana,
	luis,
	child,
	family,
}) => {
	const request = await createRequest(child.request, {
		activityId: family.activities.game,
		minutes: 30,
	});
	const first = await approve(ana.request, request.id, { approvedMinutes: 30 });
	expect(first.status()).toBe(200);
	const second = await approve(luis.request, request.id, {
		approvedMinutes: 20,
	});
	expect(second.status()).toBe(409);
	expect(await errorCode(second)).toBe("request_already_resolved");
});
