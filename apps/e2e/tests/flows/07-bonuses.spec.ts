// Step 7 · Ganar bonos: the child reports a task, the parents review it, and
// approved minutes join the week's bag (up to the weekly cap). One pending
// report per task.
import { errorCode } from "../support/api";
import { expect, test } from "../support/fixtures";
import { toast } from "../support/ui";

test("the child reports a task, a parent approves it and the bonus joins the week", async ({
	ana,
	child,
	family,
}) => {
	const [task] = family.bonusTasks;
	await child.page.goto("/nino/tareas");
	const card = child.page.getByRole("listitem", { name: "Ordenar el cuarto" });
	await card.getByRole("button", { name: "¡La hice!" }).click();
	await card.getByLabel(/¿Algo que contar\?/).fill("También guardé la ropa");
	await card.getByRole("button", { name: "Avisar a mamá o papá" }).click();
	await expect(
		toast(child.page, "¡Listo! Mamá o papá la van a revisar."),
	).toBeVisible();
	await expect(card.getByText("Esperando que la revisen")).toBeVisible();

	// One pending report per task.
	const again = await child.request.post("/api/task-reports", {
		data: { bonusTaskId: task?.id },
	});
	expect(again.status()).toBe(409);
	expect(await errorCode(again)).toBe("report_already_pending");

	await ana.page.goto("/padres");
	const report = ana.page.getByRole("article", {
		name: "Mateo hizo «Ordenar el cuarto»",
	});
	await expect(report.getByText("«También guardé la ropa»")).toBeVisible();
	await report.getByRole("button", { name: "Aprobar +15 min" }).click();
	await expect(toast(ana.page, "Bono aprobado: +15 min")).toBeVisible();

	// The week grows by the bonus; the day does not.
	await child.page.goto("/nino");
	await expect(
		child.page.getByRole("img", {
			name: "Bonos: ganaste 15 min de 1 h posibles esta semana",
		}),
	).toBeVisible();
	await expect(
		child.page.getByRole("img", { name: /^Semana: te quedan 10 h 15 min/ }),
	).toBeVisible();
	await expect(
		child.page.getByRole("img", { name: "Hoy: te quedan 2 h de 2 h" }),
	).toBeVisible();
	await child.page.goto("/nino/tareas");
	await expect(
		child.page.getByText("Ana la aprobó: +15 min de bono"),
	).toBeVisible();
});

test("a parent rejects a report with a note", async ({
	ana,
	child,
	family,
}) => {
	const task = family.bonusTasks[1];
	const created = await child.request.post("/api/task-reports", {
		data: { bonusTaskId: task?.id },
	});
	expect(created.status()).toBe(201);

	await ana.page.goto("/padres");
	const report = ana.page.getByRole("article", {
		name: "Mateo hizo «Hacer los deberes»",
	});
	await report.getByRole("button", { name: "Rechazar" }).click();
	await report.getByLabel(/Nota para Mateo/).fill("Falta la tarea de mate");
	await report.getByRole("button", { name: "Rechazar" }).click();
	await expect(toast(ana.page, "Reporte rechazado")).toBeVisible();

	await child.page.goto("/nino/tareas");
	await expect(
		child.page.getByText("Ana dijo que esta vez no cuenta"),
	).toBeVisible();
	await child.page.goto("/nino");
	await expect(
		child.page.getByRole("img", {
			name: "Bonos: ganaste 0 min de 1 h posibles esta semana",
		}),
	).toBeVisible();
});
