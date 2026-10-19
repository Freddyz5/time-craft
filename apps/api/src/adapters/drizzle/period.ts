// Half-open periods [start, end), as core defines them.
import type { Period } from "@time-craft/core";
import { and, gte, lt, type SQL, type SQLWrapper } from "drizzle-orm";

export function within(column: SQLWrapper, period: Period): SQL | undefined {
	return and(gte(column, period.start), lt(column, period.end));
}
