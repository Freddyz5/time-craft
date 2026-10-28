// Step 2 · Definir reglas (parents): daily and weekly limits, the weekly
// bonus cap, the warning before the end, and the catalog of bonus tasks.
// The child sees the new limits right away.
import { currentPolicy } from "../support/db";
import { expect, test } from "../support/fixtures";
import { toast } from "../support/ui";

test("parents set the limits, the bonus cap and the warning; the child sees them", async ({
	ana,
	child,
	db,
	family,
}) => {
	await ana.page.goto("/padres/reglas");
	const general = ana.page.getByRole("region", { name: "Cuota general" });
	await general.getByLabel("Límite por día").fill("90");
	await general.getByLabel("Límite por semana").fill("420");
	await general.getByLabel("Tope de bonos por semana").fill("40");
	await general.getByLabel("Minutos de aviso antes del final").fill("3");
	await general.getByRole("button", { name: "Guardar reglas" }).click();
	await expect(toast(ana.page, "Reglas guardadas")).toBeVisible();

	expect(await currentPolicy(db, family)).toMatchObject({
		dailyLimitMinutes: 90,
		weeklyLimitMinutes: 420,
		weeklyBonusCapMinutes: 40,
		warningMinutes: 3,
		createdByParentId: family.parents[0].id,
	});
	// The old policy stays in the history.
	const history = ana.page.getByRole("region", { name: "Historial de reglas" });
	await expect(history.getByRole("listitem")).toHaveCount(2);
	await expect(history.getByText(/^Vigente/)).toBeVisible();

	await child.page.goto("/nino");
	await expect(
		child.page.getByRole("img", {
			name: "Hoy: te quedan 1 h 30 min de 1 h 30 min",
		}),
	).toBeVisible();
	await expect(
		child.page.getByRole("img", {
			name: "Bonos: ganaste 0 min de 40 min posibles esta semana",
		}),
	).toBeVisible();
});

test("parents add a bonus task and the child can do it", async ({
	ana,
	child,
}) => {
	await ana.page.goto("/padres/bonos");
	await ana.page.getByRole("button", { name: "Nueva tarea" }).click();
	const form = ana.page.getByRole("region", { name: "Nueva tarea" });
	await form.getByLabel("Tarea").fill("Sacar la basura");
	await form.getByLabel("Minutos que gana").fill("10");
	await form.getByRole("button", { name: "Crear tarea" }).click();
	await expect(toast(ana.page, "«Sacar la basura» creada")).toBeVisible();
	await expect(
		ana.page.getByRole("heading", { name: "Sacar la basura" }),
	).toBeVisible();

	await child.page.goto("/nino/tareas");
	const task = child.page.getByRole("listitem", { name: "Sacar la basura" });
	await expect(task).toBeVisible();
	await expect(
		task.getByRole("img", { name: "Vale 10 min de bono" }),
	).toBeVisible();
	await expect(task.getByRole("button", { name: "¡La hice!" })).toBeVisible();
});
