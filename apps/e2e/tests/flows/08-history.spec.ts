// Step 8 · Consultar (everyone, read only): the balance, the live timer, the
// week's history with the breakdown by activity, the extra time given and
// the requests turned down. Both parents and the child see the same numbers.
import { createRequest, json, sessionCommand } from "../support/api";
import { childOf, insertFinishedSession } from "../support/db";
import { expect, test } from "../support/fixtures";

test("parents and the child see the same week: balance, usage, extra time and answers", async ({
	ana,
	luis,
	child,
	db,
	family,
}) => {
	// The afternoon so far: 40 min of game and 1 h 20 min of TV, the whole day.
	await insertFinishedSession(db, family, { activity: "game", minutes: 40 });
	await insertFinishedSession(db, family, { activity: "tv", minutes: 80 });
	// A request Luis turned down, with a note.
	const asked = await createRequest(child.request, {
		activityId: family.activities.game,
		minutes: 30,
		extraTime: true,
		reason: "Quiero terminar la casa",
	});
	await json(
		await luis.request.post(`/api/requests/${asked.id}/reject`, {
			data: { note: "Mañana la terminas" },
		}),
	);
	// Extra time Ana gave without a request, stopped right away.
	const { session } = await json<{ session: { id: string } }>(
		await ana.request.post("/api/overrides", {
			data: {
				childId: childOf(family).id,
				activityId: family.activities.game,
				extraMinutes: 15,
				reason: "Visita de los primos",
			},
		}),
	);
	await sessionCommand(ana.request, session.id, "stop");

	for (const parent of [ana, luis]) {
		await parent.page.goto("/padres/historial");
		const page = parent.page;
		await expect(
			page.getByRole("heading", { name: /2 h en total$/ }),
		).toBeVisible();
		await expect(
			page.getByRole("img", { name: "Juego: 40 min" }),
		).toBeVisible();
		await expect(
			page.getByRole("img", { name: "TV: 1 h 20 min" }),
		).toBeVisible();

		const sessions = page.getByRole("region", { name: "Sesiones" });
		await expect(sessions.getByText("Detenida antes")).toBeVisible();
		await expect(sessions.getByText("Tiempo extra")).toBeVisible();

		const extra = page.getByRole("region", { name: "Tiempo extra" });
		await expect(extra.getByText(/^\+15\smin · Ana$/)).toBeVisible();
		await expect(extra.getByText("«Visita de los primos»")).toBeVisible();
		await expect(extra.getByText(/lo dio un padre sin pedirlo/)).toBeVisible();

		const requests = page.getByRole("region", { name: "Solicitudes" });
		await expect(requests.getByText("Rechazada")).toBeVisible();
		await expect(requests.getByText("«Quiero terminar la casa»")).toBeVisible();
		await expect(
			requests.getByText("Respuesta de Luis: «Mañana la terminas»"),
		).toBeVisible();
	}

	await child.page.goto("/nino");
	await expect(
		child.page.getByRole("img", { name: "Hoy: te quedan 0 min de 2 h" }),
	).toBeVisible();
	await child.page.goto("/nino/pedir");
	await expect(
		child.page.getByRole("heading", { name: "Luis dijo que no esta vez" }),
	).toBeVisible();
});
