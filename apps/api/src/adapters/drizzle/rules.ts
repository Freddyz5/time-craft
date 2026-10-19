// Rules: quota policies, with history (valid_to null = current).
import type { QuotaPolicyRepository } from "@time-craft/core";
import { type Db, quotaPolicies } from "@time-craft/db";
import { and, eq, isNull } from "drizzle-orm";

export function quotaPolicyRepository(db: Db): QuotaPolicyRepository {
	return {
		async listCurrent(childId) {
			return db
				.select()
				.from(quotaPolicies)
				.where(
					and(
						eq(quotaPolicies.childId, childId),
						isNull(quotaPolicies.validTo),
					),
				);
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
