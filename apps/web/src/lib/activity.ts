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

// The policy whose bag an activity draws from: its own, or the global one.
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
