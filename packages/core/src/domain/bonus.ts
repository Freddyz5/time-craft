// Bonus tasks: the parents' catalog of tasks that earn minutes, and the
// child's reports of tasks done, which a parent reviews.
// Lifecycle of a report: pending → approved | rejected.
import { DomainError } from "../errors";
import { isWithin, type Period } from "./calendar";

export interface BonusTask {
	id: string;
	familyId: string;
	name: string;
	description: string | null;
	rewardMinutes: number;
	// null: no limit on how many times (the weekly cap in minutes still applies).
	maxPerWeek: number | null;
	isActive: boolean;
	createdByParentId: string;
	createdAt: Date;
}

export type TaskReportStatus = "pending" | "approved" | "rejected";

export interface TaskReport {
	id: string;
	childId: string;
	bonusTaskId: string;
	note: string | null;
	status: TaskReportStatus;
	awardedMinutes: number | null;
	reviewNote: string | null;
	reportedAt: Date;
	reviewedByParentId: string | null;
	reviewedAt: Date | null;
}

// A bonus belongs to the week in which a parent approved it, so a task
// reported on Sunday night and approved on Monday counts in the new week.
export function weeklyBonusMinutes(
	reports: readonly TaskReport[],
	week: Period,
): number {
	return reports.reduce(
		(total, report) =>
			report.status === "approved" &&
			report.reviewedAt !== null &&
			isWithin(report.reviewedAt, week)
				? total + (report.awardedMinutes ?? 0)
				: total,
		0,
	);
}

// Reports that use up one of the task's times this week: pending and
// approved ones reported this week. Rejected ones give the try back.
export function reportsThisWeek(
	reports: readonly TaskReport[],
	week: Period,
): number {
	return reports.filter(
		(report) =>
			report.status !== "rejected" && isWithin(report.reportedAt, week),
	).length;
}

function assertPending(report: TaskReport): void {
	if (report.status !== "pending") {
		throw new DomainError(
			"report_already_reviewed",
			`The report is already ${report.status}`,
			{ reportId: report.id, status: report.status },
		);
	}
}

export function markReportApproved(
	report: TaskReport,
	review: {
		at: Date;
		parentId: string;
		awardedMinutes: number;
		note: string | null;
	},
): TaskReport {
	assertPending(report);
	return {
		...report,
		status: "approved",
		awardedMinutes: review.awardedMinutes,
		reviewNote: review.note,
		reviewedByParentId: review.parentId,
		reviewedAt: review.at,
	};
}

export function markReportRejected(
	report: TaskReport,
	review: { at: Date; parentId: string; note: string | null },
): TaskReport {
	assertPending(report);
	return {
		...report,
		status: "rejected",
		reviewNote: review.note,
		reviewedByParentId: review.parentId,
		reviewedAt: review.at,
	};
}
