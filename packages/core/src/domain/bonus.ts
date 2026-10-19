// Bonus tasks: the parents' catalog of tasks that earn minutes, and the
// child's reports of tasks done, which a parent reviews.
// Lifecycle of a report: pending → approved | rejected.
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
