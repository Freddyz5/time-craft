// Bonuses: the task catalog and the child's reports.
import type {
	BonusTaskRepository,
	TaskReportRepository,
} from "@time-craft/core";
import { bonusTasks, children, type Db, taskReports } from "@time-craft/db";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { within } from "./period";

export function bonusTaskRepository(db: Db): BonusTaskRepository {
	return {
		async findById(id) {
			const [row] = await db
				.select()
				.from(bonusTasks)
				.where(eq(bonusTasks.id, id));
			return row ?? null;
		},
		async listByFamily(familyId) {
			return db
				.select()
				.from(bonusTasks)
				.where(eq(bonusTasks.familyId, familyId))
				.orderBy(asc(bonusTasks.createdAt));
		},
		async insert(task) {
			await db.insert(bonusTasks).values(task);
		},
		async update(task) {
			await db
				.update(bonusTasks)
				.set({
					name: task.name,
					description: task.description,
					rewardMinutes: task.rewardMinutes,
					maxPerWeek: task.maxPerWeek,
					isActive: task.isActive,
				})
				.where(eq(bonusTasks.id, task.id));
		},
	};
}

export function taskReportRepository(db: Db): TaskReportRepository {
	const isPending = eq(taskReports.status, "pending");
	return {
		async findById(id) {
			const [row] = await db
				.select()
				.from(taskReports)
				.where(eq(taskReports.id, id));
			return row ?? null;
		},
		async findPending(childId, bonusTaskId) {
			const [row] = await db
				.select()
				.from(taskReports)
				.where(
					and(
						eq(taskReports.childId, childId),
						eq(taskReports.bonusTaskId, bonusTaskId),
						isPending,
					),
				);
			return row ?? null;
		},
		async listPendingByFamily(familyId) {
			const familyChildren = db
				.select({ id: children.id })
				.from(children)
				.where(eq(children.familyId, familyId));
			return db
				.select()
				.from(taskReports)
				.where(and(inArray(taskReports.childId, familyChildren), isPending))
				.orderBy(asc(taskReports.reportedAt));
		},
		async listPendingByChild(childId) {
			return db
				.select()
				.from(taskReports)
				.where(and(eq(taskReports.childId, childId), isPending))
				.orderBy(asc(taskReports.reportedAt));
		},
		async listByChildReportedIn(childId, period) {
			return db
				.select()
				.from(taskReports)
				.where(
					and(
						eq(taskReports.childId, childId),
						within(taskReports.reportedAt, period),
					),
				)
				.orderBy(desc(taskReports.reportedAt));
		},
		async listByTaskReportedIn(childId, bonusTaskId, period) {
			return db
				.select()
				.from(taskReports)
				.where(
					and(
						eq(taskReports.childId, childId),
						eq(taskReports.bonusTaskId, bonusTaskId),
						within(taskReports.reportedAt, period),
					),
				);
		},
		async listApprovedReviewedIn(childId, period) {
			return db
				.select()
				.from(taskReports)
				.where(
					and(
						eq(taskReports.childId, childId),
						eq(taskReports.status, "approved"),
						within(taskReports.reviewedAt, period),
					),
				);
		},
		async insert(report) {
			await db.insert(taskReports).values(report);
		},
		async updateIfPending(report) {
			const updated = await db
				.update(taskReports)
				.set({
					status: report.status,
					awardedMinutes: report.awardedMinutes,
					reviewNote: report.reviewNote,
					reviewedByParentId: report.reviewedByParentId,
					reviewedAt: report.reviewedAt,
				})
				.where(and(eq(taskReports.id, report.id), isPending))
				.returning({ id: taskReports.id });
			return updated.length > 0;
		},
	};
}
