// Loads what a balance needs and computes it, per policy (bag).
import { type Balance, balanceWindow, computeBalance } from "../domain/balance";
import { weeklyBonusMinutes } from "../domain/bonus";
import { type CalendarSettings, weekPeriod } from "../domain/calendar";
import type { Family } from "../domain/family";
import {
	policyForActivity,
	type QuotaPolicy,
	sessionsUnderPolicy,
} from "../domain/policy";
import { DomainError } from "../errors";
import type { Tx } from "./context";

export interface PolicyBalance {
	policy: QuotaPolicy;
	balance: Balance;
}

export function calendarOf(family: Family): CalendarSettings {
	return { timezone: family.timezone, weekStartDay: family.weekStartDay };
}

// One balance per current policy of the child. Bonuses are not tied to an
// activity, so each bag gets them (each capped by its own policy).
export async function childBalances(
	tx: Tx,
	family: Family,
	childId: string,
): Promise<PolicyBalance[]> {
	const calendar = calendarOf(family);
	const policies = await tx.repos.policies.listCurrent(childId);
	if (policies.length === 0) {
		return [];
	}
	const week = weekPeriod(tx.now, calendar);
	// One query at a time: a transaction is a single connection.
	const sessions = await tx.repos.sessions.listStartedOverlapping(
		childId,
		balanceWindow(tx.now, calendar),
	);
	const reports = await tx.repos.taskReports.listApprovedReviewedIn(
		childId,
		week,
	);
	const bonusMinutesEarned = weeklyBonusMinutes(reports, week);
	return policies.map((policy) => ({
		policy,
		balance: computeBalance({
			policy,
			sessions: sessionsUnderPolicy(policy, policies, sessions),
			bonusMinutesEarned,
			now: tx.now,
			calendar,
		}),
	}));
}

// The balance of the bag the activity draws from; null if the child has no
// policy for it.
export async function findActivityBalance(
	tx: Tx,
	family: Family,
	childId: string,
	activityId: string,
): Promise<PolicyBalance | null> {
	const balances = await childBalances(tx, family, childId);
	const policy = policyForActivity(
		balances.map((entry) => entry.policy),
		activityId,
	);
	return balances.find((entry) => entry.policy === policy) ?? null;
}

export async function activityBalance(
	tx: Tx,
	family: Family,
	childId: string,
	activityId: string,
): Promise<PolicyBalance> {
	const entry = await findActivityBalance(tx, family, childId, activityId);
	if (entry === null) {
		throw new DomainError(
			"no_active_policy",
			"The child has no quota policy for this activity",
			{ childId, activityId },
		);
	}
	return entry;
}
