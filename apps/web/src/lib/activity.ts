// How each activity looks: its brick colour and icon. Juego and TV come from
// the seed; any other activity gets a neutral brick.
import { Blocks, Gamepad2, type LucideIcon, Tv } from "lucide-react";

export interface ActivityLook {
	// CSS colour of its bricks and its tint for backgrounds.
	color: string;
	tint: string;
	// The plate "Ahora" sits on while it runs: its face and edge (white text
	// reads on both).
	plate: { face: string; side: string };
	Icon: LucideIcon;
}

const looks: Record<string, ActivityLook> = {
	game: {
		color: "var(--color-game)",
		tint: "var(--color-game-tint)",
		plate: { face: "var(--color-game)", side: "var(--color-game-side)" },
		Icon: Gamepad2,
	},
	tv: {
		color: "var(--color-tv)",
		tint: "var(--color-tv-tint)",
		plate: { face: "var(--color-tv)", side: "var(--color-tv-side)" },
		Icon: Tv,
	},
};

const fallback: ActivityLook = {
	color: "var(--color-ink-soft)",
	tint: "var(--color-sheet-sunk)",
	plate: { face: "#4a5263", side: "#2a2f38" },
	Icon: Blocks,
};

export function activityLook(code: string | undefined): ActivityLook {
	return (code !== undefined ? looks[code] : undefined) ?? fallback;
}

export interface NamedActivity {
	id: string;
	code: string;
	name: string;
}

export function activityById<A extends NamedActivity>(
	activities: readonly A[],
	id: string | null,
): A | undefined {
	return id === null ? undefined : activities.find((a) => a.id === id);
}

export interface MemberActivity extends NamedActivity {
	isActive: boolean;
}

// The activities that draw from a bag (a policy or its balance): its own
// activity, or for the general quota every active one without its own. The
// api decides who draws from where; this only names them.
export function bagMembers<A extends MemberActivity>(
	bag: { activityId: string | null },
	bags: readonly { activityId: string | null }[],
	activities: readonly A[],
): A[] {
	if (bag.activityId !== null) {
		return activities.filter((a) => a.id === bag.activityId);
	}
	return activities.filter(
		(a) => a.isActive && !bags.some((other) => other.activityId === a.id),
	);
}

// Whose quota a bonus went to, by the activities that share it now
// ("TV", "Juego y Computadora"). Empty with a single quota (nothing to tell
// apart) or for a bonus approved before the parents could choose.
export function bonusQuotaName(
	bonusActivityId: string | null,
	bags: readonly { activityId: string | null }[],
	activities: readonly MemberActivity[],
): string {
	if (bonusActivityId === null || bags.length < 2) {
		return "";
	}
	const bag =
		bags.find((other) => other.activityId === bonusActivityId) ??
		bags.find((other) => other.activityId === null);
	if (bag === undefined) {
		return "";
	}
	const names = bagMembers(bag, bags, activities).map((a) => a.name);
	return names.length <= 1
		? (names[0] ?? "")
		: `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
}

// The general quota first, then the activities with their own, by name.
export function bagOrder<B extends { activityId: string | null }>(
	bags: readonly B[],
	activities: readonly NamedActivity[],
): B[] {
	const name = (bag: B) => activityById(activities, bag.activityId)?.name ?? "";
	return [...bags].sort(
		(a, b) =>
			Number(a.activityId !== null) - Number(b.activityId !== null) ||
			name(a).localeCompare(name(b)),
	);
}

// The policy whose bag an activity draws from: its own, or the general one.
// (Only used to pick the warning time for the tab's alarm.)
export function bagFor<P extends { activityId: string | null }>(
	policies: readonly P[],
	activityId: string,
): P | undefined {
	return (
		policies.find((policy) => policy.activityId === activityId) ??
		policies.find((policy) => policy.activityId === null)
	);
}
