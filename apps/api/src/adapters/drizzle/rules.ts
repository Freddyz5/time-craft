// Rules: quota policies, with history (valid_to null = current), the rules
// the parents write and the automatic ones they hide from the child.
import {
	type CustomRuleRepository,
	type HiddenRuleRepository,
	isAutomaticRuleKey,
	type QuotaPolicy,
	type QuotaPolicyRepository,
} from "@time-craft/core";
import {
	customRules,
	type Db,
	hiddenRules,
	quotaPolicies,
} from "@time-craft/db";
import { and, desc, eq, isNull } from "drizzle-orm";
import { toWeekDay } from "./family";

type QuotaPolicyRow = typeof quotaPolicies.$inferSelect;

function toPolicy(row: QuotaPolicyRow): QuotaPolicy {
	return { ...row, allowedDays: row.allowedDays.map(toWeekDay) };
}

export function quotaPolicyRepository(db: Db): QuotaPolicyRepository {
	return {
		async listCurrent(childId) {
			const rows = await db
				.select()
				.from(quotaPolicies)
				.where(
					and(
						eq(quotaPolicies.childId, childId),
						isNull(quotaPolicies.validTo),
					),
				);
			return rows.map(toPolicy);
		},
		async listByChild(childId) {
			const rows = await db
				.select()
				.from(quotaPolicies)
				.where(eq(quotaPolicies.childId, childId))
				.orderBy(desc(quotaPolicies.validFrom));
			return rows.map(toPolicy);
		},
		async closeCurrent(childId, activityId, validTo) {
			await db
				.update(quotaPolicies)
				.set({ validTo })
				.where(
					and(
						eq(quotaPolicies.childId, childId),
						activityId === null
							? isNull(quotaPolicies.activityId)
							: eq(quotaPolicies.activityId, activityId),
						isNull(quotaPolicies.validTo),
					),
				);
		},
		async insert(policy) {
			await db.insert(quotaPolicies).values(policy);
		},
	};
}

export function customRuleRepository(db: Db): CustomRuleRepository {
	return {
		async findById(id) {
			const [row] = await db
				.select()
				.from(customRules)
				.where(eq(customRules.id, id));
			return row ?? null;
		},
		listByChild: (childId) =>
			db.select().from(customRules).where(eq(customRules.childId, childId)),
		async insert(rule) {
			await db.insert(customRules).values(rule);
		},
		async update(rule) {
			await db.update(customRules).set(rule).where(eq(customRules.id, rule.id));
		},
		async delete(id) {
			await db.delete(customRules).where(eq(customRules.id, id));
		},
	};
}

export function hiddenRuleRepository(db: Db): HiddenRuleRepository {
	return {
		async listByChild(childId) {
			const rows = await db
				.select()
				.from(hiddenRules)
				.where(eq(hiddenRules.childId, childId));
			// The CHECK constraint keeps out any other key.
			return rows.flatMap((row) =>
				isAutomaticRuleKey(row.ruleKey)
					? [{ ...row, ruleKey: row.ruleKey }]
					: [],
			);
		},
		async insert(rule) {
			await db.insert(hiddenRules).values(rule).onConflictDoNothing();
		},
		async delete(childId, ruleKey) {
			await db
				.delete(hiddenRules)
				.where(
					and(
						eq(hiddenRules.childId, childId),
						eq(hiddenRules.ruleKey, ruleKey),
					),
				);
		},
	};
}
