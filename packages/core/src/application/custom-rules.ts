// Rules the parents write: for the child, or parents-only reminders. They
// only inform; nothing else reads them.
import { type Actor, requireParent } from "../domain/actor";
import {
	byPosition,
	CUSTOM_RULE_MAX_LENGTH,
	type CustomRule,
	MAX_CUSTOM_RULES,
} from "../domain/custom-rule";
import { requiredText } from "../domain/values";
import { DomainError, invalidInput } from "../errors";
import { loadChild } from "./access";
import { type CoreDeps, type Tx, transaction } from "./context";

function ruleNotFound(): DomainError {
	return new DomainError("custom_rule_not_found", "Rule not found");
}

// A rule of the parent's family.
async function loadRule(
	tx: Tx,
	actor: Actor,
	ruleId: string,
): Promise<CustomRule> {
	const rule = await tx.repos.customRules.findById(ruleId);
	if (rule === null) {
		throw ruleNotFound();
	}
	const child = await tx.repos.children.findById(rule.childId);
	if (child === null || child.familyId !== actor.familyId) {
		throw ruleNotFound();
	}
	return rule;
}

// After the last rule of the child, in either list.
function nextPosition(rules: readonly CustomRule[]): number {
	return rules.reduce((last, rule) => Math.max(last, rule.position + 1), 0);
}

// The child's rules in order. The child gets only those written for them.
export async function listCustomRules(
	deps: CoreDeps,
	actor: Actor,
	input: { childId: string },
): Promise<CustomRule[]> {
	return transaction(deps, async (tx) => {
		const child = await loadChild(tx, actor, input.childId, "see the rules");
		const rules = (await tx.repos.customRules.listByChild(child.id)).sort(
			byPosition,
		);
		return actor.kind === "child"
			? rules.filter((rule) => !rule.parentsOnly)
			: rules;
	});
}

export interface AddCustomRuleInput {
	childId: string;
	text: string;
	// Omitted: false, the child reads it.
	parentsOnly?: boolean;
}

// Goes last in its list.
export async function addCustomRule(
	deps: CoreDeps,
	actor: Actor,
	input: AddCustomRuleInput,
): Promise<CustomRule> {
	requireParent(actor, "write the rules");
	const text = requiredText(input.text, "text", CUSTOM_RULE_MAX_LENGTH);
	return transaction(deps, async (tx) => {
		const child = await loadChild(tx, actor, input.childId, "write the rules");
		const rules = await tx.repos.customRules.listByChild(child.id);
		if (rules.length >= MAX_CUSTOM_RULES) {
			throw new DomainError(
				"custom_rule_limit_reached",
				"The child already has the most rules allowed",
				{ max: MAX_CUSTOM_RULES },
			);
		}
		const rule: CustomRule = {
			id: tx.deps.ids.next(),
			childId: child.id,
			text,
			parentsOnly: input.parentsOnly ?? false,
			position: nextPosition(rules),
			createdByParentId: actor.parentId,
			createdAt: tx.now,
			updatedAt: tx.now,
		};
		await tx.repos.customRules.insert(rule);
		return rule;
	});
}

export interface UpdateCustomRuleInput {
	ruleId: string;
	// Omitted fields stay as they are.
	text?: string;
	parentsOnly?: boolean;
}

// Moving a rule to the other list puts it last there.
export async function updateCustomRule(
	deps: CoreDeps,
	actor: Actor,
	input: UpdateCustomRuleInput,
): Promise<CustomRule> {
	requireParent(actor, "write the rules");
	const text =
		input.text === undefined
			? undefined
			: requiredText(input.text, "text", CUSTOM_RULE_MAX_LENGTH);
	return transaction(deps, async (tx) => {
		const rule = await loadRule(tx, actor, input.ruleId);
		const parentsOnly = input.parentsOnly ?? rule.parentsOnly;
		const moved = parentsOnly !== rule.parentsOnly;
		const updated: CustomRule = {
			...rule,
			text: text ?? rule.text,
			parentsOnly,
			position: moved
				? nextPosition(await tx.repos.customRules.listByChild(rule.childId))
				: rule.position,
			updatedAt: tx.now,
		};
		await tx.repos.customRules.update(updated);
		return updated;
	});
}

export async function deleteCustomRule(
	deps: CoreDeps,
	actor: Actor,
	input: { ruleId: string },
): Promise<CustomRule> {
	requireParent(actor, "write the rules");
	return transaction(deps, async (tx) => {
		const rule = await loadRule(tx, actor, input.ruleId);
		await tx.repos.customRules.delete(rule.id);
		return rule;
	});
}

export interface ReorderCustomRulesInput {
	childId: string;
	// Every rule of one list (for the child, or parents-only), once each, in
	// the new order.
	ruleIds: readonly string[];
}

// Returns the child's rules in their new order.
export async function reorderCustomRules(
	deps: CoreDeps,
	actor: Actor,
	input: ReorderCustomRulesInput,
): Promise<CustomRule[]> {
	requireParent(actor, "write the rules");
	return transaction(deps, async (tx) => {
		const child = await loadChild(tx, actor, input.childId, "write the rules");
		const rules = await tx.repos.customRules.listByChild(child.id);
		const first = rules.find((rule) => rule.id === input.ruleIds[0]);
		const list = rules.filter(
			(rule) => rule.parentsOnly === first?.parentsOnly,
		);
		const listed = new Set(input.ruleIds);
		if (
			first === undefined ||
			listed.size !== input.ruleIds.length ||
			listed.size !== list.length ||
			list.some((rule) => !listed.has(rule.id))
		) {
			throw invalidInput("ruleIds", "must list every rule of one list once");
		}
		const reordered = input.ruleIds.map((id, position) => {
			const rule = list.find((r) => r.id === id) as CustomRule;
			return { ...rule, position, updatedAt: tx.now };
		});
		for (const rule of reordered) {
			await tx.repos.customRules.update(rule);
		}
		return [
			...rules.filter((rule) => rule.parentsOnly !== first.parentsOnly),
			...reordered,
		].sort(byPosition);
	});
}
