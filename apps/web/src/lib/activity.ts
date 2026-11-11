// How each activity looks: its brick colour and icon. Juego and TV start with
// theirs (by code); the parents pick one for any activity from these lists,
// the same keys core accepts. The colours are theme tokens (global.css).
import {
	Blocks,
	Clapperboard,
	Gamepad2,
	Headphones,
	Laptop,
	type LucideIcon,
	Monitor,
	Puzzle,
	Smartphone,
	Tablet,
	Tv,
} from "lucide-react";

export interface ActivityLook {
	// CSS colour of its bricks and its tint for backgrounds.
	color: string;
	tint: string;
	// The plate "Ahora" sits on while it runs: its face and edge (white text
	// reads on both).
	plate: { face: string; side: string };
	Icon: LucideIcon;
}

// The colours an activity can take, with their names. None is green, yellow,
// orange or red: those mean time left, bonus, pause and end.
// Each token is written out whole: Tailwind only emits the theme variables it
// finds in the source.
export const ACTIVITY_COLORS = {
	blue: {
		label: "Azul",
		color: "var(--color-game)",
		side: "var(--color-game-side)",
		tint: "var(--color-game-tint)",
	},
	magenta: {
		label: "Magenta",
		color: "var(--color-tv)",
		side: "var(--color-tv-side)",
		tint: "var(--color-tv-tint)",
	},
	violet: {
		label: "Violeta",
		color: "var(--color-violet)",
		side: "var(--color-violet-side)",
		tint: "var(--color-violet-tint)",
	},
	sky: {
		label: "Celeste",
		color: "var(--color-sky)",
		side: "var(--color-sky-side)",
		tint: "var(--color-sky-tint)",
	},
	brown: {
		label: "Café",
		color: "var(--color-brown)",
		side: "var(--color-brown-side)",
		tint: "var(--color-brown-tint)",
	},
	graphite: {
		label: "Grafito",
		color: "var(--color-graphite)",
		side: "var(--color-graphite-side)",
		tint: "var(--color-graphite-tint)",
	},
} as const;

export const ACTIVITY_ICONS = {
	gamepad: { Icon: Gamepad2, label: "Mando" },
	tv: { Icon: Tv, label: "Televisor" },
	monitor: { Icon: Monitor, label: "Computadora" },
	laptop: { Icon: Laptop, label: "Laptop" },
	tablet: { Icon: Tablet, label: "Tablet" },
	smartphone: { Icon: Smartphone, label: "Celular" },
	clapperboard: { Icon: Clapperboard, label: "Películas" },
	headphones: { Icon: Headphones, label: "Música" },
	puzzle: { Icon: Puzzle, label: "Rompecabezas" },
	blocks: { Icon: Blocks, label: "Bloques" },
} as const;

export type ActivityColorKey = keyof typeof ACTIVITY_COLORS;
export type ActivityIconKey = keyof typeof ACTIVITY_ICONS;

// Juego and TV until the parents pick something else.
const BY_CODE: Record<
	string,
	{ color: ActivityColorKey; icon: ActivityIconKey }
> = {
	game: { color: "blue", icon: "gamepad" },
	tv: { color: "magenta", icon: "tv" },
};

function isColor(key: string | null | undefined): key is ActivityColorKey {
	return key != null && key in ACTIVITY_COLORS;
}

function isIcon(key: string | null | undefined): key is ActivityIconKey {
	return key != null && key in ACTIVITY_ICONS;
}

export interface LookSource {
	code: string;
	color?: string | null;
	icon?: string | null;
}

// The colour and icon keys an activity shows: its own, those of its code, or
// graphite blocks.
export function lookKeys(activity: LookSource | undefined): {
	color: ActivityColorKey;
	icon: ActivityIconKey;
} {
	const base = activity === undefined ? undefined : BY_CODE[activity.code];
	return {
		color: isColor(activity?.color)
			? activity.color
			: (base?.color ?? "graphite"),
		icon: isIcon(activity?.icon) ? activity.icon : (base?.icon ?? "blocks"),
	};
}

export function activityLook(activity: LookSource | undefined): ActivityLook {
	const keys = lookKeys(activity);
	const color = ACTIVITY_COLORS[keys.color];
	return {
		color: color.color,
		tint: color.tint,
		plate: { face: color.color, side: color.side },
		Icon: ACTIVITY_ICONS[keys.icon].Icon,
	};
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
