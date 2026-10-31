// In-memory implementation of the repositories and the UnitOfWork, for tests.
// Transactions run one at a time and roll back on error; the partial unique
// indexes of the real schema are enforced, so a use case that would break
// them fails here too.
import type { SessionAlert } from "../domain/alerts";
import type { BonusTask, TaskReport } from "../domain/bonus";
import type { Period } from "../domain/calendar";
import type { Activity, Child, Family, Parent } from "../domain/family";
import type { QuotaPolicy } from "../domain/policy";
import type { NativePushToken, PushSubscription } from "../domain/push";
import type { ChildRequest, QuotaOverride } from "../domain/request";
import { isOpen, type Session } from "../domain/session";
import type { UnitOfWork } from "../ports";
import type { Repositories } from "../ports/repositories";

export interface Tables {
	families: Map<string, Family>;
	parents: Map<string, Parent>;
	children: Map<string, Child>;
	activities: Map<string, Activity>;
	policies: Map<string, QuotaPolicy>;
	requests: Map<string, ChildRequest>;
	overrides: Map<string, QuotaOverride>;
	sessions: Map<string, Session>;
	alerts: Map<string, SessionAlert>;
	bonusTasks: Map<string, BonusTask>;
	taskReports: Map<string, TaskReport>;
	pushSubscriptions: Map<string, PushSubscription>;
	nativePushTokens: Map<string, NativePushToken>;
}

export type Row<K extends keyof Tables> =
	Tables[K] extends Map<string, infer V> ? V : never;

function emptyTables(): Tables {
	return {
		families: new Map(),
		parents: new Map(),
		children: new Map(),
		activities: new Map(),
		policies: new Map(),
		requests: new Map(),
		overrides: new Map(),
		sessions: new Map(),
		alerts: new Map(),
		bonusTasks: new Map(),
		taskReports: new Map(),
		pushSubscriptions: new Map(),
		nativePushTokens: new Map(),
	};
}

const copy = <T>(value: T): T => structuredClone(value);

function uniqueViolation(constraint: string): Error {
	return new Error(
		`duplicate key value violates unique constraint "${constraint}"`,
	);
}

function before(a: Date, b: Date): boolean {
	return a.getTime() < b.getTime();
}

function within(at: Date, period: Period): boolean {
	return !before(at, period.start) && before(at, period.end);
}

const oldestFirst =
	<T>(at: (row: T) => Date) =>
	(a: T, b: T) =>
		at(a).getTime() - at(b).getTime();

const newestFirst =
	<T>(at: (row: T) => Date) =>
	(a: T, b: T) =>
		at(b).getTime() - at(a).getTime();

// Where a session starts: started_at, or scheduled_start_at if it never did.
function sessionStart(session: Session): Date {
	return session.startedAt ?? session.scheduledStartAt ?? session.createdAt;
}

export class InMemoryDatabase implements UnitOfWork {
	tables: Tables = emptyTables();
	readonly repos: Repositories;
	private queue: Promise<unknown> = Promise.resolve();

	constructor() {
		this.repos = createRepositories(() => this.tables);
	}

	run<T>(work: (repos: Repositories) => Promise<T>): Promise<T> {
		const next = this.queue.then(async () => {
			const snapshot = copy(this.tables);
			try {
				return await work(this.repos);
			} catch (error) {
				this.tables = snapshot;
				throw error;
			}
		});
		this.queue = next.catch(() => undefined);
		return next;
	}

	// Direct access for arranging and asserting in tests (copies).
	get<K extends keyof Tables>(table: K, id: string): Row<K> {
		const row = (this.tables[table] as Map<string, Row<K>>).get(id);
		if (row === undefined) {
			throw new Error(`${table} ${id} not found`);
		}
		return copy(row);
	}

	all<K extends keyof Tables>(table: K): Row<K>[] {
		return [...(this.tables[table] as Map<string, Row<K>>).values()].map(copy);
	}

	set<K extends keyof Tables>(table: K, row: Row<K> & { id: string }): void {
		(this.tables[table] as Map<string, Row<K>>).set(row.id, copy(row));
	}
}

function createRepositories(t: () => Tables): Repositories {
	const values = <K extends keyof Tables>(table: K): Row<K>[] => [
		...(t()[table] as Map<string, Row<K>>).values(),
	];
	const find = <V>(map: Map<string, V>, id: string): V | null => {
		const row = map.get(id);
		return row === undefined ? null : copy(row);
	};

	function assertOneOpenSession(session: Session): void {
		if (
			isOpen(session) &&
			values("sessions").some(
				(other) =>
					other.id !== session.id &&
					other.childId === session.childId &&
					isOpen(other),
			)
		) {
			throw uniqueViolation("uq_sessions_one_active");
		}
		if (session.pauses.filter((pause) => pause.resumedAt === null).length > 1) {
			throw uniqueViolation("uq_pauses_one_open");
		}
	}

	function assertOnePendingRequest(request: ChildRequest): void {
		if (
			request.status === "pending" &&
			values("requests").some(
				(other) =>
					other.id !== request.id &&
					other.childId === request.childId &&
					other.status === "pending",
			)
		) {
			throw uniqueViolation("uq_requests_one_pending");
		}
	}

	return {
		families: {
			findById: async (id) => find(t().families, id),
			replaceRecoveryCode: async (familyId, expectedHash, next) => {
				const family = t().families.get(familyId);
				if (family === undefined || family.recoveryCodeHash !== expectedHash) {
					return false;
				}
				t().families.set(familyId, {
					...family,
					recoveryCodeHash: next.hash,
					recoveryCodeCreatedAt: next.createdAt,
				});
				return true;
			},
		},

		parents: {
			findById: async (id) => find(t().parents, id),
			findByAuthUserId: async (authUserId) =>
				copy(
					values("parents").find(
						(parent) => parent.authUserId === authUserId,
					) ?? null,
				),
			listByFamily: async (familyId) =>
				values("parents")
					.filter((parent) => parent.familyId === familyId)
					.map(copy),
		},

		children: {
			findById: async (id) => find(t().children, id),
			findByAuthUserId: async (authUserId) =>
				copy(
					values("children").find((child) => child.authUserId === authUserId) ??
						null,
				),
			listByFamily: async (familyId) =>
				values("children")
					.filter((child) => child.familyId === familyId)
					.sort(oldestFirst((child) => child.createdAt))
					.map(copy),
			insert: async (child) => {
				if (
					values("children").some(
						(other) => other.authUserId === child.authUserId,
					)
				) {
					throw uniqueViolation("uq_children_auth_user");
				}
				t().children.set(child.id, copy(child));
			},
			update: async (child) => {
				t().children.set(child.id, copy(child));
			},
		},

		activities: {
			findById: async (id) => find(t().activities, id),
			listByFamily: async (familyId) =>
				values("activities")
					.filter((activity) => activity.familyId === familyId)
					.sort((a, b) => a.name.localeCompare(b.name))
					.map(copy),
		},

		policies: {
			listCurrent: async (childId) =>
				values("policies")
					.filter(
						(policy) => policy.childId === childId && policy.validTo === null,
					)
					.map(copy),
			listByChild: async (childId) =>
				values("policies")
					.filter((policy) => policy.childId === childId)
					.sort((a, b) => b.validFrom.getTime() - a.validFrom.getTime())
					.map(copy),
			closeCurrent: async (childId, activityId, validTo) => {
				for (const policy of values("policies")) {
					if (
						policy.childId === childId &&
						policy.activityId === activityId &&
						policy.validTo === null
					) {
						t().policies.set(policy.id, { ...policy, validTo });
					}
				}
			},
			insert: async (policy) => {
				if (
					policy.validTo === null &&
					values("policies").some(
						(other) =>
							other.childId === policy.childId &&
							other.activityId === policy.activityId &&
							other.validTo === null,
					)
				) {
					throw uniqueViolation("uq_quota_current");
				}
				t().policies.set(policy.id, copy(policy));
			},
		},

		requests: {
			findById: async (id) => find(t().requests, id),
			findPendingByChild: async (childId) =>
				copy(
					values("requests").find(
						(request) =>
							request.childId === childId && request.status === "pending",
					) ?? null,
				),
			listPendingByFamily: async (familyId) =>
				values("requests")
					.filter(
						(request) =>
							request.status === "pending" &&
							t().children.get(request.childId)?.familyId === familyId,
					)
					.sort(oldestFirst((request) => request.createdAt))
					.map(copy),
			listByChildCreatedIn: async (childId, period) =>
				values("requests")
					.filter(
						(request) =>
							request.childId === childId && within(request.createdAt, period),
					)
					.sort(newestFirst((request) => request.createdAt))
					.map(copy),
			insert: async (request) => {
				assertOnePendingRequest(request);
				t().requests.set(request.id, copy(request));
			},
			updateIfPending: async (request) => {
				const stored = t().requests.get(request.id);
				if (stored === undefined || stored.status !== "pending") {
					return false;
				}
				t().requests.set(request.id, {
					...stored,
					status: request.status,
					approvedMinutes: request.approvedMinutes,
					responseNote: request.responseNote,
					resolvedByParentId: request.resolvedByParentId,
					resolvedAt: request.resolvedAt,
				});
				return true;
			},
		},

		overrides: {
			findById: async (id) => find(t().overrides, id),
			listByChildCreatedIn: async (childId, period) =>
				values("overrides")
					.filter(
						(override) =>
							override.childId === childId &&
							within(override.createdAt, period),
					)
					.sort(newestFirst((override) => override.createdAt))
					.map(copy),
			insert: async (override) => {
				if (
					override.requestId !== null &&
					values("overrides").some(
						(other) => other.requestId === override.requestId,
					)
				) {
					throw uniqueViolation("uq_override_request");
				}
				t().overrides.set(override.id, copy(override));
			},
		},

		sessions: {
			findById: async (id) => find(t().sessions, id),
			findOpenByChild: async (childId) =>
				copy(
					values("sessions").find(
						(session) => session.childId === childId && isOpen(session),
					) ?? null,
				),
			listStartedOverlapping: async (childId, period: Period) =>
				values("sessions")
					.filter(
						(session) =>
							session.childId === childId &&
							session.startedAt !== null &&
							before(session.startedAt, period.end) &&
							(session.endedAt === null ||
								before(period.start, session.endedAt)),
					)
					.map(copy),
			listByChildStartingIn: async (childId, period) =>
				values("sessions")
					.filter(
						(session) =>
							session.childId === childId &&
							within(sessionStart(session), period),
					)
					.sort(newestFirst(sessionStart))
					.map(copy),
			insert: async (session) => {
				assertOneOpenSession(session);
				t().sessions.set(session.id, copy(session));
			},
			update: async (session, expected) => {
				const stored = t().sessions.get(session.id);
				if (stored === undefined || stored.status !== expected) {
					return false;
				}
				assertOneOpenSession(session);
				t().sessions.set(session.id, copy(session));
				return true;
			},
		},

		alerts: {
			findById: async (id) => find(t().alerts, id),
			listPendingBySession: async (sessionId) =>
				values("alerts")
					.filter(
						(alert) =>
							alert.sessionId === sessionId &&
							alert.sentAt === null &&
							alert.cancelledAt === null,
					)
					.map(copy),
			insert: async (alert) => {
				t().alerts.set(alert.id, copy(alert));
			},
			markSentIfPending: async (id, at) => {
				const alert = t().alerts.get(id);
				if (
					alert === undefined ||
					alert.sentAt !== null ||
					alert.cancelledAt !== null
				) {
					return false;
				}
				t().alerts.set(id, { ...alert, sentAt: at });
				return true;
			},
			markCancelled: async (ids, at) => {
				for (const id of ids) {
					const alert = t().alerts.get(id);
					if (
						alert !== undefined &&
						alert.sentAt === null &&
						alert.cancelledAt === null
					) {
						t().alerts.set(id, { ...alert, cancelledAt: at });
					}
				}
			},
		},

		bonusTasks: {
			findById: async (id) => find(t().bonusTasks, id),
			listByFamily: async (familyId) =>
				values("bonusTasks")
					.filter((task) => task.familyId === familyId)
					.sort(oldestFirst((task) => task.createdAt))
					.map(copy),
			insert: async (task) => {
				t().bonusTasks.set(task.id, copy(task));
			},
			update: async (task) => {
				t().bonusTasks.set(task.id, copy(task));
			},
		},

		taskReports: {
			findById: async (id) => find(t().taskReports, id),
			findPending: async (childId, bonusTaskId) =>
				copy(
					values("taskReports").find(
						(report) =>
							report.childId === childId &&
							report.bonusTaskId === bonusTaskId &&
							report.status === "pending",
					) ?? null,
				),
			listPendingByFamily: async (familyId) =>
				values("taskReports")
					.filter(
						(report) =>
							report.status === "pending" &&
							t().children.get(report.childId)?.familyId === familyId,
					)
					.sort(oldestFirst((report) => report.reportedAt))
					.map(copy),
			listPendingByChild: async (childId) =>
				values("taskReports")
					.filter(
						(report) =>
							report.childId === childId && report.status === "pending",
					)
					.sort(oldestFirst((report) => report.reportedAt))
					.map(copy),
			listByChildReportedIn: async (childId, period) =>
				values("taskReports")
					.filter(
						(report) =>
							report.childId === childId && within(report.reportedAt, period),
					)
					.sort(newestFirst((report) => report.reportedAt))
					.map(copy),
			listByTaskReportedIn: async (childId, bonusTaskId, period) =>
				values("taskReports")
					.filter(
						(report) =>
							report.childId === childId &&
							report.bonusTaskId === bonusTaskId &&
							within(report.reportedAt, period),
					)
					.map(copy),
			listApprovedReviewedIn: async (childId, period) =>
				values("taskReports")
					.filter(
						(report) =>
							report.childId === childId &&
							report.status === "approved" &&
							report.reviewedAt !== null &&
							within(report.reviewedAt, period),
					)
					.map(copy),
			insert: async (report) => {
				if (
					values("taskReports").some(
						(other) =>
							other.status === "pending" &&
							other.childId === report.childId &&
							other.bonusTaskId === report.bonusTaskId,
					)
				) {
					throw uniqueViolation("uq_reports_one_pending");
				}
				t().taskReports.set(report.id, copy(report));
			},
			updateIfPending: async (report) => {
				const stored = t().taskReports.get(report.id);
				if (stored === undefined || stored.status !== "pending") {
					return false;
				}
				t().taskReports.set(report.id, {
					...stored,
					status: report.status,
					awardedMinutes: report.awardedMinutes,
					reviewNote: report.reviewNote,
					reviewedByParentId: report.reviewedByParentId,
					reviewedAt: report.reviewedAt,
				});
				return true;
			},
		},

		pushSubscriptions: {
			findByEndpoint: async (endpoint) =>
				copy(
					values("pushSubscriptions").find(
						(subscription) => subscription.endpoint === endpoint,
					) ?? null,
				),
			upsertByEndpoint: async (subscription) => {
				for (const other of values("pushSubscriptions")) {
					if (other.endpoint === subscription.endpoint) {
						t().pushSubscriptions.delete(other.id);
					}
				}
				t().pushSubscriptions.set(subscription.id, copy(subscription));
			},
			deleteByEndpoint: async (endpoint) => {
				for (const other of values("pushSubscriptions")) {
					if (other.endpoint === endpoint) {
						t().pushSubscriptions.delete(other.id);
					}
				}
			},
		},

		nativePushTokens: {
			findByToken: async (token) =>
				copy(
					values("nativePushTokens").find((saved) => saved.token === token) ??
						null,
				),
			upsertByToken: async (saved) => {
				for (const other of values("nativePushTokens")) {
					if (other.token === saved.token) {
						t().nativePushTokens.delete(other.id);
					}
				}
				t().nativePushTokens.set(saved.id, copy(saved));
			},
			deleteByToken: async (token) => {
				for (const other of values("nativePushTokens")) {
					if (other.token === token) {
						t().nativePushTokens.delete(other.id);
					}
				}
			},
		},
	};
}
