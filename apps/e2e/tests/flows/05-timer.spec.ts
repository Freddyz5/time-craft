// Step 5 · Correr el cronómetro (server + parents): a parent starts a
// session now or later today, pauses, resumes and stops it. The server keeps
// the clock; the child only watches.
import { liveSession, startSession } from "../support/api";
import { alertsOf, childOf, lastSession, pausesOf } from "../support/db";
import { expect, test } from "../support/fixtures";
import { choice, toast } from "../support/ui";

test("a parent starts a session, pauses and resumes it while the child watches", async ({
	ana,
	child,
	db,
	family,
}) => {
	await ana.page.goto("/padres/sesion");
	await choice(ana.page, /^Juego/).click();
	await ana.page.getByRole("button", { name: "30 min", exact: true }).click();
	await ana.page
		.getByRole("button", { name: "Empezar 30 min de Juego" })
		.click();
	await expect(toast(ana.page, "30 min de Juego, desde ya")).toBeVisible();
	await expect(ana.page).toHaveURL(/\/padres\/?$/);

	await child.page.goto("/nino");
	await expect(
		child.page.getByRole("heading", { name: "Ahora" }),
	).toBeVisible();

	await ana.page.getByRole("button", { name: "Pausar" }).click();
	await expect(
		toast(ana.page, "Juego en pausa: no gasta tiempo"),
	).toBeVisible();
	await expect(
		ana.page.getByText(/^En pausa desde las \d\d:\d\d/),
	).toBeVisible();
	await expect(
		child.page.getByRole("heading", { name: "En pausa" }),
	).toBeVisible();
	await expect(
		child.page.getByText(/^Tu tiempo no corre desde las \d\d:\d\d/),
	).toBeVisible();

	await ana.page.getByRole("button", { name: "Reanudar" }).click();
	await expect(toast(ana.page, "Juego sigue corriendo")).toBeVisible();
	await expect(
		child.page.getByRole("heading", { name: "Ahora" }),
	).toBeVisible();

	const session = await lastSession(db, family);
	expect(session.status).toBe("running");
	const [pause] = await pausesOf(db, session.id);
	expect(pause).toMatchObject({
		pausedByParentId: family.parents[0].id,
		resumedByParentId: family.parents[0].id,
	});
	expect(pause?.resumedAt).not.toBeNull();
});

test("stopping early counts only the time used", async ({
	ana,
	db,
	family,
}) => {
	const session = await startSession(ana.request, {
		childId: childOf(family).id,
		activityId: family.activities.game,
		minutes: 30,
	});
	await ana.page.goto("/padres");
	await ana.page.getByRole("button", { name: "Detener" }).click();
	const dialog = ana.page.getByRole("dialog", { name: "¿Detener Juego?" });
	await dialog.getByRole("button", { name: "Detener" }).click();
	await expect(toast(ana.page, /^Sesión terminada: contó/)).toBeVisible();
	await expect(ana.page.getByText(/No hay nada corriendo/)).toBeVisible();

	const stopped = await lastSession(db, family);
	expect(stopped).toMatchObject({
		id: session.id,
		status: "finished",
		endReason: "stopped_early",
		endedByParentId: family.parents[0].id,
	});
	expect(stopped.consumedSeconds).toBeLessThan(120);
	// Nothing left to warn about.
	const alerts = await alertsOf(db, session.id);
	expect(alerts.every((alert) => alert.cancelledAt !== null)).toBe(true);
});

test("a session scheduled for later can be cancelled before it starts", async ({
	ana,
	child,
	db,
	family,
}) => {
	await ana.page.goto("/padres/sesion");
	await choice(ana.page, /^TV/).click();
	await ana.page.getByRole("button", { name: "15 min", exact: true }).click();
	await choice(ana.page, "Más tarde hoy").click();
	await ana.page.getByRole("button", { name: /^Programar para las/ }).click();
	await expect(
		toast(ana.page, /^15\smin de TV, a las \d\d:\d\d$/),
	).toBeVisible();
	await expect(
		ana.page.getByRole("heading", { name: "Más tarde" }),
	).toBeVisible();

	await child.page.goto("/nino");
	await expect(
		child.page.getByRole("heading", { name: "Tu próxima sesión" }),
	).toBeVisible();

	await ana.page.getByRole("button", { name: "Cancelar" }).click();
	await ana.page
		.getByRole("dialog", { name: "¿Cancelar la sesión programada?" })
		.getByRole("button", { name: "Cancelar sesión" })
		.click();
	await expect(toast(ana.page, "Sesión programada cancelada")).toBeVisible();

	const session = await lastSession(db, family);
	expect(session).toMatchObject({
		status: "cancelled",
		startedAt: null,
		endedByParentId: family.parents[0].id,
	});
	const [start] = await alertsOf(db, session.id);
	expect(start).toMatchObject({ alertType: "start" });
	expect(start?.cancelledAt).not.toBeNull();
	await expect(
		child.page.getByRole("heading", { name: "Tu próxima sesión" }),
	).toHaveCount(0);
});

test("only one session can be open at a time", async ({
	ana,
	luis,
	child,
	family,
}) => {
	await startSession(ana.request, {
		childId: childOf(family).id,
		activityId: family.activities.tv,
		minutes: 20,
	});
	// Luis, on his own phone, cannot start another.
	await luis.page.goto("/padres/sesion");
	await expect(
		luis.page.getByRole("heading", { name: "Ya hay una sesión corriendo" }),
	).toBeVisible();
	// Nor can the child ask.
	await child.page.goto("/nino/pedir");
	await expect(
		child.page.getByRole("heading", { name: "Ya tienes una sesión" }),
	).toBeVisible();
	expect((await liveSession(luis.request, childOf(family).id))?.status).toBe(
		"running",
	);
});
