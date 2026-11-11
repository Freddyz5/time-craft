// The activities that use up the quota. The family starts with Juego and TV;
// the parents add others, rename any of them and deactivate the ones they no
// longer use (never deleted: their sessions stay in the history). Each one
// has a colour and an icon from these lists; the web draws them.
import { DomainError, invalidInput } from "../errors";
import type { Activity } from "./family";
import { requiredText } from "./values";

// Enough for a child's screens; more would not fit the batteries.
export const MAX_ACTIVE_ACTIVITIES = 6;

export const ACTIVITY_NAME_MAX_LENGTH = 30;

// The colours an activity can take. None is green, yellow, orange or red:
// those mean time left, bonus, pause and end.
export const ACTIVITY_COLORS = [
	"blue",
	"magenta",
	"violet",
	"sky",
	"brown",
	"graphite",
] as const;

export const ACTIVITY_ICONS = [
	"gamepad",
	"tv",
	"monitor",
	"laptop",
	"tablet",
	"smartphone",
	"clapperboard",
	"headphones",
	"puzzle",
	"blocks",
] as const;

export type ActivityColor = (typeof ACTIVITY_COLORS)[number];
export type ActivityIcon = (typeof ACTIVITY_ICONS)[number];

export function activityColor(value: string): ActivityColor {
	const color = ACTIVITY_COLORS.find((key) => key === value);
	if (color === undefined) {
		throw invalidInput("color", "is not one of the activity colours");
	}
	return color;
}

export function activityIcon(value: string): ActivityIcon {
	const icon = ACTIVITY_ICONS.find((key) => key === value);
	if (icon === undefined) {
		throw invalidInput("icon", "is not one of the activity icons");
	}
	return icon;
}

export function activityName(value: string): string {
	return requiredText(value, "name", ACTIVITY_NAME_MAX_LENGTH);
}

// Names are compared without case or accents: «Tablet» and «tablet» are the
// same activity.
function nameKey(name: string): string {
	return name
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.toLocaleLowerCase("es");
}

// No two activities of the family share a name, active or not.
export function assertNameFree(
	name: string,
	activities: readonly Activity[],
	except?: string,
): void {
	const taken = activities.find(
		(activity) =>
			activity.id !== except && nameKey(activity.name) === nameKey(name),
	);
	if (taken !== undefined) {
		throw new DomainError(
			"activity_name_taken",
			"Another activity of the family has that name",
			{ activityId: taken.id, isActive: taken.isActive },
		);
	}
}

export function assertRoomForActive(activities: readonly Activity[]): void {
	if (
		activities.filter((activity) => activity.isActive).length >=
		MAX_ACTIVE_ACTIVITIES
	) {
		throw new DomainError(
			"activity_limit_reached",
			"The family already has the most active activities allowed",
			{ max: MAX_ACTIVE_ACTIVITIES },
		);
	}
}

// The code of an activity the parents add: unique in the family, from its id.
export function generatedCode(id: string): string {
	return `custom-${id.replaceAll("-", "").slice(0, 12)}`;
}
