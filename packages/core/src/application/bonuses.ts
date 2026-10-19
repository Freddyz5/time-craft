// Bonus tasks: the parents keep the catalog, the child reports a task done,
// a parent reviews it. Approved minutes go to the weekly bag, up to the cap.
import { type Actor, requireChild, requireParent } from "../domain/actor";
import {
	type BonusTask,
	markReportApproved,
	markReportRejected,
	reportsThisWeek,
	type TaskReport,
} from "../domain/bonus";
import { weekPeriod } from "../domain/calendar";
import { messages } from "../domain/push";
import {
	optionalText,
	positiveInteger,
	positiveMinutes,
	requiredText,
} from "../domain/values";
import { DomainError } from "../errors";
import {
	loadBonusTask,
	loadChild,
	loadChildById,
	loadFamily,
	parentUserIds,
} from "./access";
import { type CoreDeps, type Tx, transaction } from "./context";
import { calendarOf } from "./quota";

const NAME_MAX_LENGTH = 80;
const DESCRIPTION_MAX_LENGTH = 255;
const NOTE_MAX_LENGTH = 200;
// max_per_week is a SMALLINT.
const MAX_PER_WEEK_LIMIT = 100;

export interface BonusTaskFields {
	name: string;
	description?: string | null;
	rewardMinutes: number;
	// null or omitted: no limit on times per week.
	maxPerWeek?: number | null;
}

function validateTaskFields(fields: BonusTaskFields) {
	return {
		name: requiredText(fields.name, "name", NAME_MAX_LENGTH),
		description: optionalText(
			fields.description,
			"description",
			DESCRIPTION_MAX_LENGTH,
		),
		rewardMinutes: positiveMinutes(fields.rewardMinutes, "rewardMinutes"),
		maxPerWeek:
			fields.maxPerWeek === undefined || fields.maxPerWeek === null
				? null
				: positiveInteger(fields.maxPerWeek, "maxPerWeek", MAX_PER_WEEK_LIMIT),
	};
}

export async function createBonusTask(
	deps: CoreDeps,
	actor: Actor,
	input: BonusTaskFields,
): Promise<BonusTask> {
	requireParent(actor, "create a bonus task");
	const fields = validateTaskFields(input);
	return transaction(deps, async (tx) => {
		const task: BonusTask = {
			id: tx.deps.ids.next(),
			familyId: actor.familyId,
			...fields,
			isActive: true,
			createdByParentId: actor.parentId,
			createdAt: tx.now,
		};
		await tx.repos.bonusTasks.insert(task);
		return task;
	});
}

// Replaces the editable fields. Pending reports keep their task; the reward
// in force when a parent reviews is the one suggested.
export async function updateBonusTask(
	deps: CoreDeps,
	actor: Actor,
	input: BonusTaskFields & { taskId: string },
): Promise<BonusTask> {
	requireParent(actor, "change a bonus task");
	const fields = validateTaskFields(input);
	return transaction(deps, async (tx) => {
		const task = await loadBonusTask(tx, actor, input.taskId);
		const updated: BonusTask = { ...task, ...fields };
		await tx.repos.bonusTasks.update(updated);
		return updated;
	});
}

// The child can no longer report it; pending reports can still be reviewed.
export async function deactivateBonusTask(
	deps: CoreDeps,
	actor: Actor,
	input: { taskId: string },
): Promise<BonusTask> {
	requireParent(actor, "deactivate a bonus task");
	return transaction(deps, async (tx) => {
		const task = await loadBonusTask(tx, actor, input.taskId);
		const updated: BonusTask = { ...task, isActive: false };
		await tx.repos.bonusTasks.update(updated);
		return updated;
	});
}

// The child says they did a task. One pending report per task, and no more
// than max_per_week this week (rejected ones don't count). The parents get
// a push.
export async function reportTask(
	deps: CoreDeps,
	actor: Actor,
	input: { bonusTaskId: string; note?: string },
): Promise<TaskReport> {
	requireChild(actor, "report a task");
	const note = optionalText(input.note, "note", NOTE_MAX_LENGTH);
	return transaction(deps, async (tx) => {
		const child = await loadChild(tx, actor, actor.childId, "report a task");
		const task = await loadBonusTask(tx, actor, input.bonusTaskId);
		if (!task.isActive) {
			throw new DomainError("bonus_task_inactive", "The task is not active", {
				bonusTaskId: task.id,
			});
		}
		const pending = await tx.repos.taskReports.findPending(child.id, task.id);
		if (pending !== null) {
			throw new DomainError(
				"report_already_pending",
				"This task already has a report waiting for review",
				{ reportId: pending.id },
			);
		}
		if (task.maxPerWeek !== null) {
			const family = await loadFamily(tx, child.familyId);
			const week = weekPeriod(tx.now, calendarOf(family));
			const reports = await tx.repos.taskReports.listByTaskReportedIn(
				child.id,
				task.id,
				week,
			);
			if (reportsThisWeek(reports, week) >= task.maxPerWeek) {
				throw new DomainError(
					"weekly_task_limit_reached",
					"The task was already reported as many times as allowed this week",
					{ bonusTaskId: task.id, maxPerWeek: task.maxPerWeek },
				);
			}
		}
		const report: TaskReport = {
			id: tx.deps.ids.next(),
			childId: child.id,
			bonusTaskId: task.id,
			note,
			status: "pending",
			awardedMinutes: null,
			reviewNote: null,
			reportedAt: tx.now,
			reviewedByParentId: null,
			reviewedAt: null,
		};
		await tx.repos.taskReports.insert(report);
		tx.after.notify(
			await parentUserIds(tx, child.familyId),
			messages.reportCreated({
				childName: child.name,
				taskName: task.name,
				reportId: report.id,
				note,
			}),
		);
		return report;
	});
}

export type ReviewTaskInput =
	| {
			reportId: string;
			decision: "approve";
			// Defaults to the task's reward.
			awardedMinutes?: number;
			note?: string;
	  }
	| { reportId: string; decision: "reject"; note?: string };

async function loadReportForParent(
	tx: Tx,
	actor: Actor,
	reportId: string,
): Promise<TaskReport> {
	const notFound = new DomainError("task_report_not_found", "Report not found");
	const report = await tx.repos.taskReports.findById(reportId);
	if (report === null) {
		throw notFound;
	}
	const child = await tx.repos.children.findById(report.childId);
	if (child === null || child.familyId !== actor.familyId) {
		throw notFound;
	}
	return report;
}

// A parent approves (with the minutes earned) or rejects. The weekly cap is
// applied by the balance, not here. The child gets a push.
export async function reviewTask(
	deps: CoreDeps,
	actor: Actor,
	input: ReviewTaskInput,
): Promise<TaskReport> {
	requireParent(actor, "review a task");
	const note = optionalText(input.note, "note", NOTE_MAX_LENGTH);
	return transaction(deps, async (tx) => {
		const report = await loadReportForParent(tx, actor, input.reportId);
		const task = await loadBonusTask(tx, actor, report.bonusTaskId);
		const review = { at: tx.now, parentId: actor.parentId, note };
		const reviewed =
			input.decision === "approve"
				? markReportApproved(report, {
						...review,
						awardedMinutes: positiveMinutes(
							input.awardedMinutes ?? task.rewardMinutes,
							"awardedMinutes",
						),
					})
				: markReportRejected(report, review);
		if (!(await tx.repos.taskReports.updateIfPending(reviewed))) {
			throw new DomainError(
				"report_already_reviewed",
				"Another parent reviewed the report first",
				{ reportId: report.id },
			);
		}
		const child = await loadChildById(tx, report.childId);
		tx.after.notify(
			[child.authUserId],
			reviewed.status === "approved"
				? messages.reportApproved({
						reportId: report.id,
						taskName: task.name,
						minutes: reviewed.awardedMinutes ?? 0,
					})
				: messages.reportRejected({
						reportId: report.id,
						taskName: task.name,
						note,
					}),
		);
		return reviewed;
	});
}
