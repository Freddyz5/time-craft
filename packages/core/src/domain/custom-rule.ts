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
