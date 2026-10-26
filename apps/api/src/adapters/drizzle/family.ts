// Who: families, parents, children and activities.
import type {
	ActivityRepository,
	ChildRepository,
	Family,
	FamilyRepository,
	Parent,
	ParentRepository,
	WeekDay,
} from "@time-craft/core";
import {
	activities,
	children,
	type Db,
	families,
	parents,
} from "@time-craft/db";
import { and, asc, eq, isNull } from "drizzle-orm";

type FamilyRow = typeof families.$inferSelect;
type ParentRow = typeof parents.$inferSelect;

function toWeekDay(value: number): WeekDay {
	if (!Number.isInteger(value) || value < 0 || value > 6) {
		// The CHECK constraint makes this unreachable.
		throw new Error(`Invalid week_start_day ${value}`);
	}
	return value as WeekDay;
}

function toFamily(row: FamilyRow): Family {
	return {
		id: row.id,
		name: row.name,
		timezone: row.timezone,
		weekStartDay: toWeekDay(row.weekStartDay),
		requestExpiryMinutes: row.requestExpiryMinutes,
		autoCloseAfterMinutes: row.autoCloseAfterMinutes,
		recoveryCodeHash: row.recoveryCodeHash,
		recoveryCodeCreatedAt: row.recoveryCodeCreatedAt,
	};
}

function toParent(row: ParentRow): Parent {
	return {
		id: row.id,
		familyId: row.familyId,
		authUserId: row.authUserId,
		name: row.name,
	};
}

export function familyRepository(db: Db): FamilyRepository {
	return {
		async findById(id) {
			const [row] = await db.select().from(families).where(eq(families.id, id));
			return row === undefined ? null : toFamily(row);
		},
		async replaceRecoveryCode(familyId, expectedHash, next) {
			const updated = await db
				.update(families)
				.set({
					recoveryCodeHash: next.hash,
					recoveryCodeCreatedAt: next.createdAt,
				})
				.where(
					and(
						eq(families.id, familyId),
						expectedHash === null
							? isNull(families.recoveryCodeHash)
							: eq(families.recoveryCodeHash, expectedHash),
					),
				)
				.returning({ id: families.id });
			return updated.length > 0;
		},
	};
}

export function parentRepository(db: Db): ParentRepository {
	return {
		async findById(id) {
			const [row] = await db.select().from(parents).where(eq(parents.id, id));
			return row === undefined ? null : toParent(row);
		},
		async findByAuthUserId(authUserId) {
			const [row] = await db
				.select()
				.from(parents)
				.where(eq(parents.authUserId, authUserId));
			return row === undefined ? null : toParent(row);
		},
		async listByFamily(familyId) {
			const rows = await db
				.select()
				.from(parents)
				.where(eq(parents.familyId, familyId))
				.orderBy(asc(parents.createdAt));
			return rows.map(toParent);
		},
	};
}

export function childRepository(db: Db): ChildRepository {
	return {
		async findById(id) {
			const [row] = await db.select().from(children).where(eq(children.id, id));
			return row ?? null;
		},
		async findByAuthUserId(authUserId) {
			const [row] = await db
				.select()
				.from(children)
				.where(eq(children.authUserId, authUserId));
			return row ?? null;
		},
		async listByFamily(familyId) {
			return db
				.select()
				.from(children)
				.where(eq(children.familyId, familyId))
				.orderBy(asc(children.createdAt));
		},
		async insert(child) {
			await db.insert(children).values(child);
		},
		async update(child) {
			await db
				.update(children)
				.set({
					name: child.name,
					avatar: child.avatar,
					failedPinAttempts: child.failedPinAttempts,
					lockedUntil: child.lockedUntil,
				})
				.where(eq(children.id, child.id));
		},
	};
}

export function activityRepository(db: Db): ActivityRepository {
	return {
		async findById(id) {
			const [row] = await db
				.select()
				.from(activities)
				.where(eq(activities.id, id));
			return row ?? null;
		},
		async listByFamily(familyId) {
			return db
				.select()
				.from(activities)
				.where(eq(activities.familyId, familyId))
				.orderBy(asc(activities.name));
		},
	};
}
