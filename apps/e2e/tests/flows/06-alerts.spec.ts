// Step 6 · Avisar (server, through QStash): starting a session publishes its
// warning, end and auto_close jobs and keeps their QStash ids in
// session_alerts; pausing cancels them; resuming publishes new ones with the
// times pushed back by the pause. A session for later has a start job.
//
// The @slow test waits for QStash in real time (about three minutes): it
// runs only with E2E_SLOW=1.

import { POLICY } from "../../src/family";
import { setPolicy, startSession } from "../support/api";
import {
	type AlertRow,
	alertsOf,
	childOf,
	lastSession,
	pausesOf,
	sessionRow,
	setAutoClose,
} from "../support/db";
import { expect, test } from "../support/fixtures";
import { choice, toast } from "../support/ui";

const MINUTE = 60_000;

function pending(alerts: readonly AlertRow[]): AlertRow[] {
	return alerts.filter(
		(alert) => alert.cancelledAt === null && alert.sentAt === null,
	);
}

// Each running job at its time, give or take a second, with a QStash id.
function expectRunningAlerts(alerts: readonly AlertRow[], endAt: number) {
	const expected = {
		warning: endAt - POLICY.warningMinutes * MINUTE,
		end: endAt,
		auto_close: endAt + 30 * MINUTE,
	};
	expect(alerts.map((alert) => alert.alertType)).toEqual([
		"warning",
		"end",
		"auto_close",
	]);
	for (const alert of alerts) {
		const at = expected[alert.alertType as keyof typeof expected];
		expect(Math.abs(alert.scheduledAt.getTime() - at)).toBeLessThan(1000);
		expect(alert.providerMessageId).toBeTruthy();
	}
}

test("starting, pausing and resuming publish and cancel the session's jobs", async ({
	ana,
	db,
	family,
}) => {
	await ana.page.goto("/padres/sesion");
	await choice(ana.page, /^Juego/).click();
	await ana.page.getByRole("button", { name: "30 min", exact: true }).click();
	await ana.page
		.getByRole("button", { name: "Empezar 30 min de Juego" })
		.click();
	await expect(ana.page.getByRole("button", { name: "Pausar" })).toBeVisible();

	const session = await lastSession(db, family);
	const startedAt = session.startedAt?.getTime() ?? Number.NaN;
	const first = await alertsOf(db, session.id);
	expectRunningAlerts(first, startedAt + 30 * MINUTE);
	expect(pending(first)).toHaveLength(3);

	// Pausing cancels them, in the database and in QStash.
	await ana.page.getByRole("button", { name: "Pausar" }).click();
	await expect(
		toast(ana.page, "Juego en pausa: no gasta tiempo"),
	).toBeVisible();
	const paused = await alertsOf(db, session.id);
	expect(pending(paused)).toHaveLength(0);
	expect(paused.every((alert) => alert.cancelledAt !== null)).toBe(true);

	// A pause long enough to show in the new times.
	await ana.page.waitForTimeout(2000);
	await ana.page.getByRole("button", { name: "Reanudar" }).click();
	await expect(toast(ana.page, "Juego sigue corriendo")).toBeVisible();

	const [pause] = await pausesOf(db, session.id);
	const pausedMs =
		(pause?.resumedAt?.getTime() ?? Number.NaN) -
		(pause?.pausedAt.getTime() ?? Number.NaN);
	expect(pausedMs).toBeGreaterThanOrEqual(2000);
	const resumed = pending(await alertsOf(db, session.id));
	expectRunningAlerts(resumed, startedAt + 30 * MINUTE + pausedMs);
	const oldIds = new Set(first.map((alert) => alert.providerMessageId));
	expect(resumed.some((alert) => oldIds.has(alert.providerMessageId))).toBe(
		false,
	);

	// Stopping cancels whatever is left.
	await ana.page.getByRole("button", { name: "Detener" }).click();
	await ana.page
		.getByRole("dialog", { name: "¿Detener Juego?" })
		.getByRole("button", { name: "Detener" })
		.click();
	await expect(toast(ana.page, /^Sesión terminada/)).toBeVisible();
	expect(pending(await alertsOf(db, session.id))).toHaveLength(0);
});

test("a session for later has a start job, cancelled when a parent starts it early", async ({
	ana,
	db,
	family,
}) => {
	const startAt = new Date(Date.now() + 30 * MINUTE);
	const session = await startSession(ana.request, {
		childId: childOf(family).id,
		activityId: family.activities.tv,
		minutes: 20,
		startAt,
	});
	const [start, ...rest] = await alertsOf(db, session.id);
	expect(rest).toHaveLength(0);
	expect(start).toMatchObject({ alertType: "start", cancelledAt: null });
	expect(
		Math.abs((start?.scheduledAt.getTime() ?? 0) - startAt.getTime()),
	).toBeLessThan(1000);
	expect(start?.providerMessageId).toBeTruthy();

	await ana.page.goto("/padres");
	await ana.page.getByRole("button", { name: "Empezar ya" }).click();
	await expect(toast(ana.page, "TV empezó ahora")).toBeVisible();

	const started = await sessionRow(db, session.id);
	const alerts = await alertsOf(db, session.id);
	expect(
		alerts.find((alert) => alert.alertType === "start")?.cancelledAt,
	).not.toBeNull();
	expectRunningAlerts(
		pending(alerts),
		(started.startedAt?.getTime() ?? Number.NaN) + 20 * MINUTE,
	);
});

test("QStash warns, ends and closes a forgotten 2-minute session", {
	tag: "@slow",
}, async ({ ana, child, db, family }) => {
	test.setTimeout(8 * MINUTE);
	// Warn 1 minute before the end; close 1 minute after it.
	await setPolicy(ana.request, childOf(family).id, {
		...POLICY,
		warningMinutes: 1,
	});
	await setAutoClose(db, family, 1);

	await ana.page.goto("/padres/sesion");
	await choice(ana.page, /^Juego/).click();
	await ana.page.getByLabel("Minutos", { exact: true }).fill("2");
	await ana.page
		.getByRole("button", { name: "Empezar 2 min de Juego" })
		.click();
	await expect(ana.page.getByRole("button", { name: "Pausar" })).toBeVisible();
	await child.page.goto("/nino");
	const session = await lastSession(db, family);
	const sent = async (type: string) =>
		(await alertsOf(db, session.id)).find((alert) => alert.alertType === type)
			?.sentAt ?? null;

	// At 1 minute: QStash delivers the warning; the open tab rings too.
	await expect(toast(ana.page, "Quedan 1 min")).toBeVisible({
		timeout: 2 * MINUTE,
	});
	await expect.poll(() => sent("warning"), { timeout: MINUTE }).not.toBeNull();

	// At 2 minutes: the end.
	await expect(toast(ana.page, "Se acabó el tiempo")).toBeVisible({
		timeout: 2 * MINUTE,
	});
	await expect.poll(() => sent("end"), { timeout: MINUTE }).not.toBeNull();

	// At 3 minutes nobody stopped it: the server closes it.
	await expect
		.poll(async () => (await sessionRow(db, session.id)).status, {
			timeout: 3 * MINUTE,
			intervals: [5000],
		})
		.toBe("finished");
	expect(await sessionRow(db, session.id)).toMatchObject({
		endReason: "auto_closed",
		endedByParentId: null,
	});
	expect(await sent("auto_close")).not.toBeNull();
	await expect(ana.page.getByText(/No hay nada corriendo/)).toBeVisible();
	await expect(child.page.getByRole("heading", { name: "Ahora" })).toHaveCount(
		0,
	);

	await ana.page.goto("/padres/historial");
	await expect(ana.page.getByText("Cerrada sola")).toBeVisible();
});
