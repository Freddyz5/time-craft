// Spanish formatting for durations, clocks and dates. Dates are shown in the
// family's time zone (from /api/me), whatever the device's zone is.

const MINUTE_MS = 60_000;

// A number never wraps away from its unit ("30 min", not "30 / min").
const NBSP = "\u00a0";

// "45 min", "1 h", "1 h 20 min". Whole minutes, rounded down unless `ceil`.
export function minutesText(minutes: number): string {
	const total = Math.max(0, Math.round(minutes));
	const hours = Math.floor(total / 60);
	const rest = total % 60;
	if (hours === 0) {
		return `${rest}${NBSP}min`;
	}
	return rest === 0 ? `${hours}${NBSP}h` : `${hours}${NBSP}h ${rest}${NBSP}min`;
}

export function secondsText(seconds: number, ceil = false): string {
	const minutes = ceil ? Math.ceil(seconds / 60) : Math.floor(seconds / 60);
	return minutesText(minutes);
}

// "Juego", "TV y Computadora", "TV, Tablet y Computadora".
export function namesText(names: readonly string[]): string {
	return names.length <= 1
		? (names[0] ?? "")
		: `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
}

// A countdown: "4:05", "1:02:09". Past zero it counts up with a sign: "+3:10".
export function countdown(ms: number): string {
	const sign = ms < 0 ? "+" : "";
	const total = Math.floor(Math.abs(ms) / 1000);
	const hours = Math.floor(total / 3600);
	const minutes = Math.floor((total % 3600) / 60);
	const seconds = total % 60;
	const ss = String(seconds).padStart(2, "0");
	return hours > 0
		? `${sign}${hours}:${String(minutes).padStart(2, "0")}:${ss}`
		: `${sign}${minutes}:${ss}`;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(
	timeZone: string,
	options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
	const key = `${timeZone}|${JSON.stringify(options)}`;
	let format = formatters.get(key);
	if (format === undefined) {
		format = new Intl.DateTimeFormat("es", { timeZone, ...options });
		formatters.set(key, format);
	}
	return format;
}

type DateLike = Date | string | number;

function toDate(value: DateLike): Date {
	return value instanceof Date ? value : new Date(value);
}

// "18:30"
export function timeText(value: DateLike, timeZone: string): string {
	return formatter(timeZone, {
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
	}).format(toDate(value));
}

// "lunes 19 de oct."
export function dayText(value: DateLike, timeZone: string): string {
	return formatter(timeZone, {
		weekday: "long",
		day: "numeric",
		month: "short",
	}).format(toDate(value));
}

// "lunes"
export function weekdayText(value: DateLike, timeZone: string): string {
	return formatter(timeZone, { weekday: "long" }).format(toDate(value));
}

// When something comes back, from the child's side: "mañana" or "el lunes".
export function rechargeText(
	value: DateLike,
	now: number,
	timeZone: string,
): string {
	return calendarDay(value, timeZone) ===
		calendarDay(now + 24 * 60 * MINUTE_MS, timeZone)
		? "mañana"
		: `el ${weekdayText(value, timeZone)}`;
}

// 0 = Sunday ... 6 = Saturday, as the api sends them.
const WEEKDAY_NAMES = [
	"domingo",
	"lunes",
	"martes",
	"miércoles",
	"jueves",
	"viernes",
	"sábado",
];

export function weekdayName(day: number): string {
	return WEEKDAY_NAMES[day] ?? "";
}

// The seven days in the family's week order (from its first day).
export function weekOrder(weekStartDay: number): number[] {
	return Array.from({ length: 7 }, (_, index) => (weekStartDay + index) % 7);
}

// "todos los días", "de lunes a viernes", "sábado y domingo" or "lunes,
// miércoles y viernes", in the family's week order.
export function weekDaysText(
	days: readonly number[],
	weekStartDay: number,
): string {
	const ordered = weekOrder(weekStartDay).filter((day) => days.includes(day));
	if (ordered.length === 7) {
		return "todos los días";
	}
	const order = weekOrder(weekStartDay);
	const first = ordered[0] ?? 0;
	const last = ordered[ordered.length - 1] ?? 0;
	const run =
		ordered.length >= 3 &&
		order.indexOf(last) - order.indexOf(first) === ordered.length - 1;
	if (run) {
		return `de ${weekdayName(first)} a ${weekdayName(last)}`;
	}
	const names = ordered.map(weekdayName);
	return names.length <= 1
		? (names[0] ?? "")
		: `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
}

// "19 oct. 2026, 18:30"
export function dateTimeText(value: DateLike, timeZone: string): string {
	return formatter(timeZone, {
		day: "numeric",
		month: "short",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
	}).format(toDate(value));
}

// "hoy", "ayer", "lunes 19 de oct." relative to `now`, in the family's zone.
export function relativeDayText(
	value: DateLike,
	now: number,
	timeZone: string,
): string {
	const day = calendarDay(value, timeZone);
	if (day === calendarDay(now, timeZone)) {
		return "hoy";
	}
	if (day === calendarDay(now - 24 * 60 * MINUTE_MS, timeZone)) {
		return "ayer";
	}
	return dayText(value, timeZone);
}

// "2026-10-19" in the given zone.
export function calendarDay(value: DateLike, timeZone: string): string {
	const parts = formatter(timeZone, {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(toDate(value));
	const get = (type: string) =>
		parts.find((part) => part.type === type)?.value ?? "";
	return `${get("year")}-${get("month")}-${get("day")}`;
}

// "-05:00": the zone's UTC offset at that instant.
function offsetAt(instant: Date, timeZone: string): string {
	const name =
		formatter(timeZone, { timeZoneName: "longOffset" })
			.formatToParts(instant)
			.find((part) => part.type === "timeZoneName")?.value ?? "GMT";
	const match = /GMT([+-]\d{2}):?(\d{2})?/.exec(name);
	return match === null ? "+00:00" : `${match[1]}:${match[2] ?? "00"}`;
}

// "18:30" today in the family's zone → an ISO instant with its offset, as the
// api expects for a scheduled start ("2026-10-21T18:30:00-05:00").
export function todayAt(hhmm: string, now: number, timeZone: string): string {
	const day = calendarDay(now, timeZone);
	// The offset at a nearby instant is right except across a DST change,
	// which no family zone in milestone 1 has (America/Guayaquil).
	return `${day}T${hhmm}:00${offsetAt(new Date(now), timeZone)}`;
}

// "19 – 25 oct" or "28 sep – 4 oct": a week, from its first day to its last.
export function dayRangeText(
	first: DateLike,
	last: DateLike,
	timeZone: string,
): string {
	const day = (value: DateLike) =>
		formatter(timeZone, { day: "numeric" }).format(toDate(value));
	const month = (value: DateLike) =>
		formatter(timeZone, { month: "short" })
			.format(toDate(value))
			.replace(".", "");
	return month(first) === month(last)
		? `${day(first)} – ${day(last)} ${month(last)}`
		: `${day(first)} ${month(first)} – ${day(last)} ${month(last)}`;
}
