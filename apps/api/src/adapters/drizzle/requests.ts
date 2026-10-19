// The child's requests and the overrides granted from them.
import type {
	ChildRequestRepository,
	QuotaOverrideRepository,
} from "@time-craft/core";
import {
	childRequests,
	children,
	type Db,
	quotaOverrides,
} from "@time-craft/db";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { within } from "./period";

export function childRequestRepository(db: Db): ChildRequestRepository {
	return {
		async findById(id) {
			const [row] = await db
				.select()
				.from(childRequests)
				.where(eq(childRequests.id, id));
			return row ?? null;
		},
		async findPendingByChild(childId) {
			const [row] = await db
				.select()
				.from(childRequests)
				.where(
					and(
						eq(childRequests.childId, childId),
						eq(childRequests.status, "pending"),
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
				.from(childRequests)
				.where(
					and(
						inArray(childRequests.childId, familyChildren),
						eq(childRequests.status, "pending"),
					),
				)
				.orderBy(asc(childRequests.createdAt));
		},
		async listByChildCreatedIn(childId, period) {
			return db
				.select()
				.from(childRequests)
				.where(
					and(
						eq(childRequests.childId, childId),
						within(childRequests.createdAt, period),
					),
				)
				.orderBy(desc(childRequests.createdAt));
		},
		async insert(request) {
			await db.insert(childRequests).values(request);
		},
		async updateIfPending(request) {
			const updated = await db
				.update(childRequests)
				.set({
					status: request.status,
					approvedMinutes: request.approvedMinutes,
					responseNote: request.responseNote,
					resolvedByParentId: request.resolvedByParentId,
					resolvedAt: request.resolvedAt,
				})
				.where(
					and(
						eq(childRequests.id, request.id),
						eq(childRequests.status, "pending"),
					),
				)
				.returning({ id: childRequests.id });
			return updated.length > 0;
		},
	};
}

export function quotaOverrideRepository(db: Db): QuotaOverrideRepository {
	return {
		async findById(id) {
			const [row] = await db
				.select()
				.from(quotaOverrides)
				.where(eq(quotaOverrides.id, id));
			return row ?? null;
		},
		async listByChildCreatedIn(childId, period) {
			return db
				.select()
				.from(quotaOverrides)
				.where(
					and(
						eq(quotaOverrides.childId, childId),
						within(quotaOverrides.createdAt, period),
					),
				)
				.orderBy(desc(quotaOverrides.createdAt));
		},
		async insert(override) {
			await db.insert(quotaOverrides).values(override);
		},
	};
}
