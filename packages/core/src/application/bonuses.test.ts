import { beforeEach, describe, expect, test } from "bun:test";
import type { BonusTask } from "../domain/bonus";
import {
	createTestKit,
	type Household,
	seedHousehold,
	type TestKit,
} from "../testing";
import { finishedSession } from "../testing/builders";

const NOW = "2026-10-21T15:00:00-05:00";

let kit: TestKit;
let h: Household;
let homework: BonusTask;

beforeEach(async () => {
	kit = createTestKit(NOW);
	h = seedHousehold(kit, {
		policy: { weeklyLimitMinutes: 120, weeklyBonusCapMinutes: 45 },
	});
	homework = await kit.core.createBonusTask(h.mom, {
		name: "Deberes",
		rewardMinutes: 20,
		maxPerWeek: 2,
	});
});

const report = () =>
	kit.core.reportTask(h.child, { bonusTaskId: homework.id, note: "Mate" });

async function weekly() {
	const view = await kit.core.getChildBalance(h.child, { childId: h.childId });
	const balance = view.balances[0];
	return {
		bonus: (balance?.bonusSeconds ?? 0) / 60,
		weeklyRemaining: (balance?.weeklyRemainingSeconds ?? 0) / 60,
	};
}

describe("catalog", () => {
	test("parents create, update and deactivate tasks", async () => {
		expect(homework).toMatchObject({
			familyId: h.familyId,
			isActive: true,
			maxPerWeek: 2,
			createdByParentId: h.mom.parentId,
		});
		const updated = await kit.core.updateBonusTask(h.dad, {
			taskId: homework.id,
			name: "Deberes completos",
			rewardMinutes: 25,
			maxPerWeek: null,
		});
		expect(updated).toMatchObject({ rewardMinutes: 25, maxPerWeek: null });
		const inactive = await kit.core.deactivateBonusTask(h.dad, {
			taskId: homework.id,
		});
		expect(inactive.isActive).toBe(false);
	});

	test("the child cannot manage tasks", async () => {
		await expect(
			kit.core.createBonusTask(h.child, { name: "Jugar", rewardMinutes: 60 }),
		).rejects.toMatchObject({ code: "forbidden" });
	});

	test("tasks of another family are not found", async () => {
		const other = seedHousehold(kit, { prefix: "x-" });
		await expect(
			kit.core.deactivateBonusTask(other.mom, { taskId: homework.id }),
		).rejects.toMatchObject({ code: "bonus_task_not_found" });
	});
});

describe("reportTask", () => {
	test("the child reports and the parents are told", async () => {
		kit.notifier.clear();
		const pending = await report();
		expect(pending).toMatchObject({ status: "pending", note: "Mate" });
		expect(kit.notifier.sent[0]).toMatchObject({
			to: [h.auth.mom, h.auth.dad],
			message: { kind: "report_created" },
		});
	});

	test("one pending report per task", async () => {
		await report();
		await expect(report()).rejects.toMatchObject({
			code: "report_already_pending",
		});
	});

	test("respects max_per_week; a rejected report gives the try back", async () => {
		const first = await report();
		await kit.core.reviewTask(h.mom, {
			reportId: first.id,
			decision: "approve",
		});
		const second = await report();
		await kit.core.reviewTask(h.mom, {
			reportId: second.id,
			decision: "reject",
		});
		const third = await report();
		await kit.core.reviewTask(h.mom, {
			reportId: third.id,
			decision: "approve",
		});
		await expect(report()).rejects.toMatchObject({
			code: "weekly_task_limit_reached",
		});

		// Next week (Monday start) it can be reported again.
		kit.clock.set("2026-10-26T09:00:00-05:00");
		await expect(report()).resolves.toMatchObject({ status: "pending" });
	});

	test("inactive tasks cannot be reported", async () => {
		await kit.core.deactivateBonusTask(h.mom, { taskId: homework.id });
		await expect(report()).rejects.toMatchObject({
			code: "bonus_task_inactive",
		});
	});

	test("parents do not report", async () => {
		await expect(
			kit.core.reportTask(h.mom, { bonusTaskId: homework.id }),
		).rejects.toMatchObject({ code: "forbidden" });
	});
});

describe("reviewTask", () => {
	test("approving awards the task's reward by default and tells the child", async () => {
		const pending = await report();
		kit.notifier.clear();
		const approved = await kit.core.reviewTask(h.dad, {
			reportId: pending.id,
			decision: "approve",
		});
		expect(approved).toMatchObject({
			status: "approved",
			awardedMinutes: 20,
			reviewedByParentId: h.dad.parentId,
		});
		expect(kit.notifier.sent[0]).toMatchObject({
			to: [h.auth.child],
			message: {
				kind: "report_approved",
				body: "Ganaste 20 min por «Deberes».",
			},
		});
		expect(await weekly()).toEqual({ bonus: 20, weeklyRemaining: 140 });
	});

	test("a parent may award other minutes", async () => {
		const pending = await report();
		const approved = await kit.core.reviewTask(h.dad, {
			reportId: pending.id,
			decision: "approve",
			awardedMinutes: 30,
		});
		expect(approved.awardedMinutes).toBe(30);
	});

	test("bonuses stop counting at the weekly cap", async () => {
		const reading = await kit.core.createBonusTask(h.mom, {
			name: "Leer 20 min",
			rewardMinutes: 30,
		});
		const a = await report();
		const b = await kit.core.reportTask(h.child, { bonusTaskId: reading.id });
		await kit.core.reviewTask(h.mom, { reportId: a.id, decision: "approve" });
		await kit.core.reviewTask(h.mom, { reportId: b.id, decision: "approve" });
		// 20 + 30 earned, cap 45.
		expect(await weekly()).toEqual({ bonus: 45, weeklyRemaining: 165 });
	});

	test("bonuses raise the week, not the day", async () => {
		kit.db.set("sessions", {
			...finishedSession("2026-10-19T15:00:00-05:00", 60),
			childId: h.childId,
		});
		kit.db.set("sessions", {
			...finishedSession("2026-10-20T15:00:00-05:00", 60),
			childId: h.childId,
		});
		const pending = await report();
		await kit.core.reviewTask(h.mom, {
			reportId: pending.id,
			decision: "approve",
		});
		const view = await kit.core.getChildBalance(h.child, {
			childId: h.childId,
		});
		// Week: 120 + 20 − 120 = 20; day: 60.
		expect((view.balances[0]?.availableSeconds ?? 0) / 60).toBe(20);
	});

	test("rejecting tells the child, with the note", async () => {
		const pending = await report();
		kit.notifier.clear();
		const rejected = await kit.core.reviewTask(h.mom, {
			reportId: pending.id,
			decision: "reject",
			note: "Faltó una hoja",
		});
		expect(rejected).toMatchObject({
			status: "rejected",
			awardedMinutes: null,
			reviewNote: "Faltó una hoja",
		});
		expect(kit.notifier.sent[0]?.message).toMatchObject({
			kind: "report_rejected",
			body: "Faltó una hoja",
		});
	});

	test("a report is reviewed once", async () => {
		const pending = await report();
		await kit.core.reviewTask(h.mom, {
			reportId: pending.id,
			decision: "reject",
		});
		await expect(
			kit.core.reviewTask(h.dad, { reportId: pending.id, decision: "approve" }),
		).rejects.toMatchObject({ code: "report_already_reviewed" });
	});

	test("the child cannot review", async () => {
		const pending = await report();
		await expect(
			kit.core.reviewTask(h.child, {
				reportId: pending.id,
				decision: "approve",
			}),
		).rejects.toMatchObject({ code: "forbidden" });
	});
});
