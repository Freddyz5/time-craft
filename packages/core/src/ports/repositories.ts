// One repository per aggregate. The api implements them with Drizzle; every
// method runs inside the transaction of the UnitOfWork that handed it out.
// Repositories store and load; they never decide business rules. Methods named
// `...IfPending` / `update(…, expected)` are compare-and-set: they write only if
// the stored row is still in the expected state and report whether they did
// (`UPDATE … WHERE status = …`, then check the affected rows).
import type { SessionAlert } from "../domain/alerts";
import type { BonusTask, TaskReport } from "../domain/bonus";
import type { Period } from "../domain/calendar";
import type { Activity, Child, Family, Parent } from "../domain/family";
import type { QuotaPolicy } from "../domain/policy";
import type { PushSubscription } from "../domain/push";
import type { ChildRequest, QuotaOverride } from "../domain/request";
import type { Session, SessionStatus } from "../domain/session";

export interface FamilyRepository {
	findById(id: string): Promise<Family | null>;
	// Replaces the recovery code hash only if the stored one is still
	// `expectedHash` (null: none yet). Makes the code single-use under races.
	replaceRecoveryCode(
		familyId: string,
		expectedHash: string | null,
		next: { hash: string; createdAt: Date },
	): Promise<boolean>;
}

export interface ParentRepository {
	findById(id: string): Promise<Parent | null>;
	findByAuthUserId(authUserId: string): Promise<Parent | null>;
	listByFamily(familyId: string): Promise<Parent[]>;
}

export interface ChildRepository {
	findById(id: string): Promise<Child | null>;
	findByAuthUserId(authUserId: string): Promise<Child | null>;
	// Oldest first.
	listByFamily(familyId: string): Promise<Child[]>;
	insert(child: Child): Promise<void>;
	// Writes name, avatar, failed_pin_attempts and locked_until.
	update(child: Child): Promise<void>;
}

export interface ActivityRepository {
	findById(id: string): Promise<Activity | null>;
	// Active and inactive, by name.
	listByFamily(familyId: string): Promise<Activity[]>;
}

export interface QuotaPolicyRepository {
	// Current policies of the child (valid_to IS NULL): the global one and/or
	// one per activity.
	listCurrent(childId: string): Promise<QuotaPolicy[]>;
	// Sets valid_to on the current policy for (child, activity), if any.
	closeCurrent(
		childId: string,
		activityId: string | null,
		validTo: Date,
	): Promise<void>;
	insert(policy: QuotaPolicy): Promise<void>;
}

export interface ChildRequestRepository {
	findById(id: string): Promise<ChildRequest | null>;
	findPendingByChild(childId: string): Promise<ChildRequest | null>;
	// Pending requests of every child in the family, oldest first.
	listPendingByFamily(familyId: string): Promise<ChildRequest[]>;
	// Requests of the child created in the period, any status, newest first.
	listByChildCreatedIn(
		childId: string,
		period: Period,
	): Promise<ChildRequest[]>;
	insert(request: ChildRequest): Promise<void>;
	// Writes status, approved_minutes, response_note, resolved_by_parent_id and
	// resolved_at only if the stored status is still 'pending'.
	updateIfPending(request: ChildRequest): Promise<boolean>;
}

export interface QuotaOverrideRepository {
	findById(id: string): Promise<QuotaOverride | null>;
	// Overrides granted to the child in the period, newest first.
	listByChildCreatedIn(
		childId: string,
		period: Period,
	): Promise<QuotaOverride[]>;
	insert(override: QuotaOverride): Promise<void>;
}

export interface SessionRepository {
	// Sessions always come with their pauses.
	findById(id: string): Promise<Session | null>;
	// The scheduled, running or paused session of the child, if any.
	findOpenByChild(childId: string): Promise<Session | null>;
	// Sessions that started and overlap the period:
	// started_at < period.end AND (ended_at IS NULL OR ended_at > period.start).
	// A superset of what any imputation strategy may need.
	listStartedOverlapping(childId: string, period: Period): Promise<Session[]>;
	// Sessions whose start falls in the period: started_at, or
	// scheduled_start_at if it never started. Newest first.
	listByChildStartingIn(childId: string, period: Period): Promise<Session[]>;
	insert(session: Session): Promise<void>;
	// Writes the session row and upserts its pauses (by id), only if the stored
	// status is still `expected`.
	update(session: Session, expected: SessionStatus): Promise<boolean>;
}

export interface SessionAlertRepository {
	findById(id: string): Promise<SessionAlert | null>;
	// Alerts of the session not yet sent nor cancelled.
	listPendingBySession(sessionId: string): Promise<SessionAlert[]>;
	insert(alert: SessionAlert): Promise<void>;
	// Sets sent_at only if the alert is still pending.
	markSentIfPending(id: string, at: Date): Promise<boolean>;
	// Sets cancelled_at on those still pending.
	markCancelled(ids: readonly string[], at: Date): Promise<void>;
}

export interface BonusTaskRepository {
	findById(id: string): Promise<BonusTask | null>;
	// Active and inactive, oldest first.
	listByFamily(familyId: string): Promise<BonusTask[]>;
	insert(task: BonusTask): Promise<void>;
	// Writes name, description, reward_minutes, max_per_week and is_active.
	update(task: BonusTask): Promise<void>;
}

export interface TaskReportRepository {
	findById(id: string): Promise<TaskReport | null>;
	findPending(childId: string, bonusTaskId: string): Promise<TaskReport | null>;
	// Pending reports of every child in the family, oldest first.
	listPendingByFamily(familyId: string): Promise<TaskReport[]>;
	// Pending reports of the child, oldest first.
	listPendingByChild(childId: string): Promise<TaskReport[]>;
	// Reports of the child with reported_at in the period, newest first.
	listByChildReportedIn(childId: string, period: Period): Promise<TaskReport[]>;
	// Reports of the task by the child with reported_at in the period.
	listByTaskReportedIn(
		childId: string,
		bonusTaskId: string,
		period: Period,
	): Promise<TaskReport[]>;
	// Approved reports of the child with reviewed_at in the period.
	listApprovedReviewedIn(
		childId: string,
		period: Period,
	): Promise<TaskReport[]>;
	insert(report: TaskReport): Promise<void>;
	// Writes status, awarded_minutes, review_note, reviewed_by_parent_id and
	// reviewed_at only if the stored status is still 'pending'.
	updateIfPending(report: TaskReport): Promise<boolean>;
}

export interface PushSubscriptionRepository {
	findByEndpoint(endpoint: string): Promise<PushSubscription | null>;
	// Inserts, or replaces the row with the same endpoint (the browser now
	// belongs to whoever registered last).
	upsertByEndpoint(subscription: PushSubscription): Promise<void>;
	deleteByEndpoint(endpoint: string): Promise<void>;
}

export interface Repositories {
	families: FamilyRepository;
	parents: ParentRepository;
	children: ChildRepository;
	activities: ActivityRepository;
	policies: QuotaPolicyRepository;
	requests: ChildRequestRepository;
	overrides: QuotaOverrideRepository;
	sessions: SessionRepository;
	alerts: SessionAlertRepository;
	bonusTasks: BonusTaskRepository;
	taskReports: TaskReportRepository;
	pushSubscriptions: PushSubscriptionRepository;
}
