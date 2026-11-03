// Rules the parents write in their own words. Those for the child ("Primero
// los deberes") are read next to the automatic ones; parents-only ones are
// reminders for mom and dad ("Solo después de comer") the child never gets.
// The app enforces none of them: they change no balance and no permission.
export interface CustomRule {
	id: string;
	childId: string;
	text: string;
	parentsOnly: boolean;
	// Order within its list (for the child, or parents-only).
	position: number;
	createdByParentId: string;
	createdAt: Date;
	updatedAt: Date;
}

export const CUSTOM_RULE_MAX_LENGTH = 200;
// Per child, both lists together.
export const MAX_CUSTOM_RULES = 30;

// Each list in its order.
export function byPosition(a: CustomRule, b: CustomRule): number {
	return (
		a.position - b.position || a.createdAt.getTime() - b.createdAt.getTime()
	);
}

// The automatic lines of «Tus reglas»: those that come from the limits and the
// ones every session follows. The parents can hide any of them; they keep
// working, the child just does not read them there.
export const AUTOMATIC_RULE_KEYS = [
	"limits",
	"days",
	"bonus",
	"warning",
	"grace",
	"carry_over",
	"one_session",
	"request_wait",
	"week_change",
] as const;

export type AutomaticRuleKey = (typeof AUTOMATIC_RULE_KEYS)[number];

export interface HiddenRule {
	childId: string;
	ruleKey: AutomaticRuleKey;
	hiddenByParentId: string;
	createdAt: Date;
}

export function isAutomaticRuleKey(value: string): value is AutomaticRuleKey {
	return (AUTOMATIC_RULE_KEYS as readonly string[]).includes(value);
}
