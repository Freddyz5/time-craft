import { beforeEach, describe, expect, test } from "bun:test";
import {
	createTestKit,
	type Household,
	seedHousehold,
	type TestKit,
} from "../testing";

const NOW = "2026-10-21T15:00:00-05:00";

let kit: TestKit;
let h: Household;

beforeEach(() => {
	kit = createTestKit(NOW);
	h = seedHousehold(kit);
});

function add(text: string, parentsOnly?: boolean) {
	return kit.core.addCustomRule(h.mom, {
		childId: h.childId,
		text,
		parentsOnly,
	});
}

const texts = (rules: readonly { text: string }[]) =>
	rules.map((rule) => rule.text);

describe("custom rules", () => {
	test("a parent writes them; each goes last in its list", async () => {
		await add("Primero los deberes");
		await add("Solo después de comer", true);
		await add("  Nada de pantallas en la mesa  ");

		const rules = await kit.core.listCustomRules(h.dad, { childId: h.childId });
		expect(texts(rules)).toEqual([
			"Primero los deberes",
			"Solo después de comer",
			"Nada de pantallas en la mesa",
		]);
		expect(rules.map((rule) => rule.parentsOnly)).toEqual([false, true, false]);
	});

	test("the child never gets the parents-only ones", async () => {
		await add("Primero los deberes");
		await add("Solo después de comer", true);

		const rules = await kit.core.listCustomRules(h.child, {
			childId: h.childId,
		});
		expect(texts(rules)).toEqual(["Primero los deberes"]);
	});

	test("the child cannot write, change or delete them", async () => {
		const rule = await add("Primero los deberes");
		await expect(
			kit.core.addCustomRule(h.child, { childId: h.childId, text: "Jugar" }),
		).rejects.toMatchObject({ code: "forbidden" });
		await expect(
			kit.core.updateCustomRule(h.child, { ruleId: rule.id, text: "Jugar" }),
		).rejects.toMatchObject({ code: "forbidden" });
		await expect(
			kit.core.deleteCustomRule(h.child, { ruleId: rule.id }),
		).rejects.toMatchObject({ code: "forbidden" });
	});

	test("a rule needs text", async () => {
		await expect(add("   ")).rejects.toMatchObject({
			code: "invalid_input",
			details: { field: "text" },
		});
	});

	test("moving a rule to the other list puts it last there", async () => {
		const homework = await add("Primero los deberes");
		await add("Solo después de comer", true);
		const moved = await kit.core.updateCustomRule(h.mom, {
			ruleId: homework.id,
			parentsOnly: true,
		});
		expect(moved.parentsOnly).toBe(true);
		expect(moved.text).toBe("Primero los deberes");

		const rules = await kit.core.listCustomRules(h.mom, { childId: h.childId });
		expect(texts(rules)).toEqual([
			"Solo después de comer",
			"Primero los deberes",
		]);
	});

	test("reordering one list keeps the other as it was", async () => {
		const a = await add("A");
		await add("Solo padres", true);
		const b = await add("B");
		const c = await add("C");

		const rules = await kit.core.reorderCustomRules(h.mom, {
			childId: h.childId,
			ruleIds: [c.id, a.id, b.id],
		});
		expect(texts(rules.filter((rule) => !rule.parentsOnly))).toEqual([
			"C",
			"A",
			"B",
		]);
		expect(texts(rules.filter((rule) => rule.parentsOnly))).toEqual([
			"Solo padres",
		]);
	});

	test("reordering needs every rule of the list once", async () => {
		const a = await add("A");
		await add("B");
		const parents = await add("Solo padres", true);
		for (const ruleIds of [[a.id], [a.id, a.id], [a.id, parents.id]]) {
			await expect(
				kit.core.reorderCustomRules(h.mom, { childId: h.childId, ruleIds }),
			).rejects.toMatchObject({
				code: "invalid_input",
				details: { field: "ruleIds" },
			});
		}
	});

	test("deleting removes it", async () => {
		const rule = await add("Primero los deberes");
		await kit.core.deleteCustomRule(h.dad, { ruleId: rule.id });
		expect(
			await kit.core.listCustomRules(h.mom, { childId: h.childId }),
		).toEqual([]);
	});

	test("there is a limit per child", async () => {
		for (let index = 0; index < 30; index += 1) {
			await add(`Regla ${index}`, index % 2 === 0);
		}
		await expect(add("Una más")).rejects.toMatchObject({
			code: "custom_rule_limit_reached",
		});
	});

	test("another family's rules are not found", async () => {
		const rule = await add("Primero los deberes");
		const other = seedHousehold(kit, { prefix: "x-" });
		await expect(
			kit.core.updateCustomRule(other.mom, { ruleId: rule.id, text: "Nada" }),
		).rejects.toMatchObject({ code: "custom_rule_not_found" });
		await expect(
			kit.core.deleteCustomRule(other.mom, { ruleId: rule.id }),
		).rejects.toMatchObject({ code: "custom_rule_not_found" });
		await expect(
			kit.core.listCustomRules(other.mom, { childId: h.childId }),
		).rejects.toMatchObject({ code: "child_not_found" });
	});
});

describe("hidden automatic rules", () => {
	const hide = (ruleKey: string, hidden = true) =>
		kit.core.setRuleHidden(h.mom, { childId: h.childId, ruleKey, hidden });

	test("a parent hides and shows them; twice changes nothing", async () => {
		expect(await hide("one_session")).toEqual(["one_session"]);
		expect(await hide("one_session")).toEqual(["one_session"]);
		await hide("week_change");
		expect(
			(await kit.core.listHiddenRules(h.child, { childId: h.childId })).sort(),
		).toEqual(["one_session", "week_change"]);

		expect(await hide("one_session", false)).toEqual(["week_change"]);
		expect(await hide("one_session", false)).toEqual(["week_change"]);
	});

	test("only known automatic rules", async () => {
		await expect(hide("custom")).rejects.toMatchObject({
			code: "invalid_input",
			details: { field: "ruleKey" },
		});
	});

	test("the child cannot choose them", async () => {
		await expect(
			kit.core.setRuleHidden(h.child, {
				childId: h.childId,
				ruleKey: "limits",
				hidden: true,
			}),
		).rejects.toMatchObject({ code: "forbidden" });
	});

	test("another family's child is not found", async () => {
		const other = seedHousehold(kit, { prefix: "x-" });
		await expect(
			kit.core.setRuleHidden(other.mom, {
				childId: h.childId,
				ruleKey: "limits",
				hidden: true,
			}),
		).rejects.toMatchObject({ code: "child_not_found" });
	});
});
