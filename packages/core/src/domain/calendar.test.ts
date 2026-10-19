import { describe, expect, test } from "bun:test";
import {
	dayPeriod,
	formatTime,
	isWithin,
	previousDayPeriod,
	weekPeriod,
} from "./calendar";

const guayaquil = "America/Guayaquil"; // UTC−5, no DST

describe("dayPeriod", () => {
	test("is the family's local day, not the UTC one", () => {
		// 22:30 on Sunday 18 Oct in Guayaquil is already Monday in UTC.
		const day = dayPeriod(new Date("2026-10-19T03:30:00Z"), {
			timezone: guayaquil,
			weekStartDay: 1,
		});
		expect(day.start.toISOString()).toBe("2026-10-18T05:00:00.000Z");
		expect(day.end.toISOString()).toBe("2026-10-19T05:00:00.000Z");
	});

	test("has 25 hours on the day DST ends", () => {
		const day = dayPeriod(new Date("2026-11-01T12:00:00Z"), {
			timezone: "America/New_York",
			weekStartDay: 0,
		});
		expect(day.start.toISOString()).toBe("2026-11-01T04:00:00.000Z");
		expect(day.end.toISOString()).toBe("2026-11-02T05:00:00.000Z");
	});

	test("returns plain Dates", () => {
		const day = dayPeriod(new Date("2026-10-21T20:00:00Z"), {
			timezone: guayaquil,
			weekStartDay: 1,
		});
		expect(day.start.constructor).toBe(Date);
	});
});

describe("previousDayPeriod", () => {
	test("is the local day before", () => {
		const yesterday = previousDayPeriod(new Date("2026-10-19T15:00:00Z"), {
			timezone: guayaquil,
			weekStartDay: 1,
		});
		expect(yesterday.start.toISOString()).toBe("2026-10-18T05:00:00.000Z");
		expect(yesterday.end.toISOString()).toBe("2026-10-19T05:00:00.000Z");
	});
});

describe("weekPeriod", () => {
	// Wednesday 21 Oct 2026, 15:00 in Guayaquil.
	const wednesday = new Date("2026-10-21T20:00:00Z");

	test("starts on Monday when week_start_day is 1", () => {
		const week = weekPeriod(wednesday, {
			timezone: guayaquil,
			weekStartDay: 1,
		});
		expect(week.start.toISOString()).toBe("2026-10-19T05:00:00.000Z");
		expect(week.end.toISOString()).toBe("2026-10-26T05:00:00.000Z");
	});

	test("starts on Sunday when week_start_day is 0", () => {
		const week = weekPeriod(wednesday, {
			timezone: guayaquil,
			weekStartDay: 0,
		});
		expect(week.start.toISOString()).toBe("2026-10-18T05:00:00.000Z");
		expect(week.end.toISOString()).toBe("2026-10-25T05:00:00.000Z");
	});

	test("Sunday night belongs to the week that is ending (Monday start)", () => {
		const sundayNight = new Date("2026-10-19T04:59:59Z"); // 23:59:59 local
		const week = weekPeriod(sundayNight, {
			timezone: guayaquil,
			weekStartDay: 1,
		});
		expect(week.start.toISOString()).toBe("2026-10-12T05:00:00.000Z");
	});
});

describe("isWithin", () => {
	test("includes the start and excludes the end", () => {
		const period = {
			start: new Date("2026-10-19T05:00:00Z"),
			end: new Date("2026-10-20T05:00:00Z"),
		};
		expect(isWithin(period.start, period)).toBe(true);
		expect(isWithin(period.end, period)).toBe(false);
	});
});

test("formatTime uses the family's wall clock", () => {
	expect(
		formatTime(new Date("2026-10-21T22:30:00Z"), {
			timezone: guayaquil,
			weekStartDay: 1,
		}),
	).toBe("17:30");
});
