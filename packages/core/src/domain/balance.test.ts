import { describe, expect, test } from "bun:test";
import {
	finishedSession,
	policy,
	runningSession,
	scheduledSession,
} from "../testing/builders";
import type { AttributionStrategy } from "./attribution";
import { computeBalance } from "./balance";
import type { CalendarSettings } from "./calendar";
import type { QuotaPolicy } from "./policy";
import type { Session } from "./session";

// Wednesday 21 Oct 2026, 15:00 in Guayaquil (UTC−5). With Monday as the
// first day, the week started on Mon 19 Oct 00:00 local (05:00Z).
const NOW = new Date("2026-10-21T20:00:00Z");
const monday: CalendarSettings = {
	timezone: "America/Guayaquil",
	weekStartDay: 1,
};

function balance(
	sessions: Session[],
	options: {
		policy?: Partial<QuotaPolicy>;
		bonus?: number;
		now?: Date;
		calendar?: CalendarSettings;
		attribution?: AttributionStrategy;
	} = {},
) {
	return computeBalance({
		policy: policy(options.policy),
		sessions,
		bonusMinutesEarned: options.bonus ?? 0,
		now: options.now ?? NOW,
		calendar: options.calendar ?? monday,
		attribution: options.attribution,
	});
}

const min = (seconds: number) => seconds / 60;

describe("available = min(day, week + bonus)", () => {
	test("is the day's remainder when the week has more", () => {
		const result = balance([finishedSession("2026-10-21T14:00:00Z", 20)]);
		expect(min(result.dailyRemainingSeconds)).toBe(40);
		expect(min(result.weeklyRemainingSeconds)).toBe(280);
		expect(min(result.availableSeconds)).toBe(40);
	});

	test("is the week's remainder when the week is almost used up", () => {
		const result = balance(
			[
				finishedSession("2026-10-19T15:00:00Z", 60), // Monday
				finishedSession("2026-10-20T15:00:00Z", 60), // Tuesday
				finishedSession("2026-10-21T14:00:00Z", 10), // today
			],
			{ policy: { weeklyLimitMinutes: 140 } },
		);
		expect(min(result.dailyRemainingSeconds)).toBe(50);
		expect(min(result.weeklyRemainingSeconds)).toBe(10);
		expect(min(result.availableSeconds)).toBe(10);
	});

	test("is zero once the week is used up, even with time left today", () => {
		const result = balance(
			[
				finishedSession("2026-10-19T15:00:00Z", 60),
				finishedSession("2026-10-20T15:00:00Z", 60),
			],
			{ policy: { weeklyLimitMinutes: 120 } },
		);
		expect(min(result.dailyRemainingSeconds)).toBe(60);
		expect(result.availableSeconds).toBe(0);
	});

	test("bonuses add to the week but never raise the daily limit", () => {
		const result = balance(
			[
				finishedSession("2026-10-19T15:00:00Z", 60),
				finishedSession("2026-10-20T15:00:00Z", 60),
			],
			{ policy: { weeklyLimitMinutes: 120 }, bonus: 30 },
		);
		expect(min(result.bonusSeconds)).toBe(30);
		expect(min(result.availableSeconds)).toBe(30);

		const fresh = balance([], { bonus: 30 });
		expect(min(fresh.availableSeconds)).toBe(60);
	});
});

describe("bonus cap", () => {
	test("bonuses count only up to weekly_bonus_cap_minutes", () => {
		const result = balance(
			[
				finishedSession("2026-10-19T15:00:00Z", 60),
				finishedSession("2026-10-20T15:00:00Z", 60),
			],
			{
				policy: { weeklyLimitMinutes: 120, weeklyBonusCapMinutes: 45 },
				bonus: 90,
			},
		);
		expect(min(result.bonusEarnedSeconds)).toBe(90);
		expect(min(result.bonusSeconds)).toBe(45);
		expect(min(result.weeklyRemainingSeconds)).toBe(45);
	});

	test("a zero cap disables bonuses", () => {
		const result = balance([], {
			policy: { weeklyBonusCapMinutes: 0 },
			bonus: 30,
		});
		expect(result.bonusSeconds).toBe(0);
	});
});

describe("what consumes", () => {
	test("the overrun counts: the real time is taken", () => {
		// Planned 30, stopped after 45.
		const result = balance([
			finishedSession("2026-10-21T14:00:00Z", 45, { plannedMinutes: 30 }),
		]);
		expect(min(result.consumedTodaySeconds)).toBe(45);
		expect(min(result.availableSeconds)).toBe(15);
	});

	test("the open session's elapsed time counts", () => {
		const result = balance([runningSession("2026-10-21T19:40:00Z")]);
		expect(min(result.consumedTodaySeconds)).toBe(20);
		expect(min(result.availableSeconds)).toBe(40);
	});

	test("pauses do not consume", () => {
		const result = balance([
			runningSession("2026-10-21T19:00:00Z", {
				pauses: [
					{ from: "2026-10-21T19:10:00Z", to: "2026-10-21T19:40:00Z" },
					{ from: "2026-10-21T19:50:00Z", to: null },
				],
			}),
		]);
		// 60 min of wall time, 30 + 10 paused.
		expect(min(result.consumedTodaySeconds)).toBe(20);
	});

	test("scheduled sessions do not consume", () => {
		const result = balance([scheduledSession("2026-10-21T22:00:00Z")]);
		expect(result.consumedTodaySeconds).toBe(0);
		expect(min(result.availableSeconds)).toBe(60);
	});

	test("never goes below zero", () => {
		const result = balance([finishedSession("2026-10-21T14:00:00Z", 90)]);
		expect(result.dailyRemainingSeconds).toBe(0);
		expect(result.availableSeconds).toBe(0);
	});
});

describe("imputation: a session counts whole toward the day it started", () => {
	test("a session crossing midnight counts toward yesterday, not today", () => {
		// Started Tuesday 23:30 local, 60 min, ended Wednesday 00:30.
		const crossing = finishedSession("2026-10-21T04:30:00Z", 60);
		const result = balance([crossing]);
		expect(result.consumedTodaySeconds).toBe(0);
		expect(min(result.consumedWeekSeconds)).toBe(60);
	});

	test("a session crossing into a new week counts toward the old week", () => {
		// Sunday 23:30 local (week starts Monday), 60 min.
		const crossing = finishedSession("2026-10-19T04:30:00Z", 60);
		const mondayMorning = new Date("2026-10-19T15:00:00Z");
		const result = balance([crossing], { now: mondayMorning });
		expect(result.consumedTodaySeconds).toBe(0);
		expect(result.consumedWeekSeconds).toBe(0);
	});

	test("the strategy is a single replaceable function", () => {
		const everythingCountsToday: AttributionStrategy = (session) => ({
			consumedSeconds: session.consumedSeconds ?? 0,
			overrunSeconds: 0,
		});
		const result = balance([finishedSession("2026-10-21T04:30:00Z", 60)], {
			attribution: everythingCountsToday,
		});
		expect(min(result.consumedTodaySeconds)).toBe(60);
	});
});

describe("week start", () => {
	// Sunday 18 Oct: in the Sunday-start week of Wed 21 Oct, but in the
	// previous Monday-start week.
	const sunday = finishedSession("2026-10-18T15:00:00Z", 50);

	test("Monday start: Sunday belongs to the previous week", () => {
		const result = balance([sunday]);
		expect(result.consumedWeekSeconds).toBe(0);
		expect(result.nextWeeklyRechargeAt.toISOString()).toBe(
			"2026-10-26T05:00:00.000Z",
		);
	});

	test("Sunday start: Sunday belongs to this week", () => {
		const result = balance([sunday], {
			calendar: { timezone: "America/Guayaquil", weekStartDay: 0 },
		});
		expect(min(result.consumedWeekSeconds)).toBe(50);
		expect(result.nextWeeklyRechargeAt.toISOString()).toBe(
			"2026-10-25T05:00:00.000Z",
		);
	});
});

describe("recharge times", () => {
	test("daily recharge is the next local midnight", () => {
		const result = balance([]);
		expect(result.nextDailyRechargeAt.toISOString()).toBe(
			"2026-10-22T05:00:00.000Z",
		);
	});
});

describe("carry_over_excess", () => {
	// Yesterday: planned 30, stopped after 45 → 15 min overrun.
	const overrun = finishedSession("2026-10-20T15:00:00Z", 45, {
		plannedMinutes: 30,
	});

	test("off (default): yesterday's overrun does not touch today", () => {
		const result = balance([overrun]);
		expect(result.carriedExcessSeconds).toBe(0);
		expect(min(result.dailyRemainingSeconds)).toBe(60);
	});

	test("on: yesterday's overrun comes off today's limit", () => {
		const result = balance([overrun], { policy: { carryOverExcess: true } });
		expect(min(result.carriedExcessSeconds)).toBe(15);
		expect(min(result.dailyRemainingSeconds)).toBe(45);
		// The week counted the overrun once, when it happened.
		expect(min(result.consumedWeekSeconds)).toBe(45);
	});
});
