// "Today" and "this week" in the family's time zone. Every boundary is a plain
// Date (an instant); periods are half-open: [start, end).
import { tz } from "@date-fns/tz";
import {
	addDays,
	addWeeks,
	format,
	getDay,
	startOfDay,
	startOfWeek,
} from "date-fns";
import type { WeekDay } from "./family";

export interface CalendarSettings {
	timezone: string;
	weekStartDay: WeekDay;
}

export interface Period {
	start: Date;
	end: Date;
}

// date-fns returns TZDate when given a zone; keep only the instant.
function instant(date: Date): Date {
	return new Date(date.getTime());
}

export function dayPeriod(at: Date, calendar: CalendarSettings): Period {
	const zone = tz(calendar.timezone);
	const start = startOfDay(at, { in: zone });
	return {
		start: instant(start),
		end: instant(addDays(start, 1, { in: zone })),
	};
}

export function previousDayPeriod(
	at: Date,
	calendar: CalendarSettings,
): Period {
	const zone = tz(calendar.timezone);
	const today = startOfDay(at, { in: zone });
	return {
		start: instant(addDays(today, -1, { in: zone })),
		end: instant(today),
	};
}

export function weekPeriod(at: Date, calendar: CalendarSettings): Period {
	const zone = tz(calendar.timezone);
	const start = startOfWeek(at, {
		in: zone,
		weekStartsOn: calendar.weekStartDay,
	});
	return {
		start: instant(start),
		end: instant(addWeeks(start, 1, { in: zone })),
	};
}

export function weekDayOf(at: Date, calendar: CalendarSettings): WeekDay {
	return getDay(at, { in: tz(calendar.timezone) }) as WeekDay;
}

// The start of the first day after `at`'s that is one of `days` (up to a
// week later, when only today's weekday is in `days`).
export function nextDayStart(
	at: Date,
	calendar: CalendarSettings,
	days: readonly WeekDay[],
): Date {
	const zone = tz(calendar.timezone);
	const today = startOfDay(at, { in: zone });
	for (let offset = 1; offset <= 7; offset += 1) {
		const start = addDays(today, offset, { in: zone });
		if (days.includes(getDay(start, { in: zone }) as WeekDay)) {
			return instant(start);
		}
	}
	return instant(addDays(today, 1, { in: zone }));
}

export function isWithin(at: Date, period: Period): boolean {
	return (
		at.getTime() >= period.start.getTime() &&
		at.getTime() < period.end.getTime()
	);
}

// Wall-clock time for messages ("a las 17:30").
export function formatTime(at: Date, calendar: CalendarSettings): string {
	return format(at, "HH:mm", { in: tz(calendar.timezone) });
}
