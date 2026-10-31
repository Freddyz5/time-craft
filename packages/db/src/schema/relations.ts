// Relations for Drizzle's query API (db.query.*). They do not change the
// database: the foreign keys live in each table. Kept apart so the table files
// only import in one direction.
import { relations } from "drizzle-orm";
import { authAccount, authSession, authUser } from "./auth";
import { bonusTasks, taskReports } from "./bonuses";
import { activities, children, families, parents } from "./family";
import { nativePushTokens, pushSubscriptions } from "./notifications";
import { childRequests, quotaOverrides } from "./requests";
import { quotaPolicies } from "./rules";
import { sessionAlerts, sessionPauses, sessions } from "./timer";

export const authUserRelations = relations(authUser, ({ one, many }) => ({
	sessions: many(authSession),
	accounts: many(authAccount),
	parent: one(parents),
	child: one(children),
	pushSubscriptions: many(pushSubscriptions),
	nativePushTokens: many(nativePushTokens),
}));

export const authSessionRelations = relations(authSession, ({ one }) => ({
	user: one(authUser, {
		fields: [authSession.userId],
		references: [authUser.id],
	}),
}));

export const authAccountRelations = relations(authAccount, ({ one }) => ({
	user: one(authUser, {
		fields: [authAccount.userId],
		references: [authUser.id],
	}),
}));

export const familiesRelations = relations(families, ({ many }) => ({
	parents: many(parents),
	children: many(children),
	activities: many(activities),
	bonusTasks: many(bonusTasks),
}));

export const parentsRelations = relations(parents, ({ one, many }) => ({
	family: one(families, {
		fields: [parents.familyId],
		references: [families.id],
	}),
	authUser: one(authUser, {
		fields: [parents.authUserId],
		references: [authUser.id],
	}),
	createdQuotaPolicies: many(quotaPolicies),
	resolvedRequests: many(childRequests),
	grantedOverrides: many(quotaOverrides),
	startedSessions: many(sessions, { relationName: "sessionStartedBy" }),
	endedSessions: many(sessions, { relationName: "sessionEndedBy" }),
	pausesStarted: many(sessionPauses, { relationName: "pausePausedBy" }),
	pausesResumed: many(sessionPauses, { relationName: "pauseResumedBy" }),
	createdBonusTasks: many(bonusTasks),
	reviewedTaskReports: many(taskReports),
}));

export const childrenRelations = relations(children, ({ one, many }) => ({
	family: one(families, {
		fields: [children.familyId],
		references: [families.id],
	}),
	authUser: one(authUser, {
		fields: [children.authUserId],
		references: [authUser.id],
	}),
	quotaPolicies: many(quotaPolicies),
	requests: many(childRequests),
	overrides: many(quotaOverrides),
	sessions: many(sessions),
	taskReports: many(taskReports),
}));

export const activitiesRelations = relations(activities, ({ one, many }) => ({
	family: one(families, {
		fields: [activities.familyId],
		references: [families.id],
	}),
	quotaPolicies: many(quotaPolicies),
	requests: many(childRequests),
	sessions: many(sessions),
}));

export const quotaPoliciesRelations = relations(quotaPolicies, ({ one }) => ({
	child: one(children, {
		fields: [quotaPolicies.childId],
		references: [children.id],
	}),
	activity: one(activities, {
		fields: [quotaPolicies.activityId],
		references: [activities.id],
	}),
	createdBy: one(parents, {
		fields: [quotaPolicies.createdByParentId],
		references: [parents.id],
	}),
}));

export const childRequestsRelations = relations(childRequests, ({ one }) => ({
	child: one(children, {
		fields: [childRequests.childId],
		references: [children.id],
	}),
	activity: one(activities, {
		fields: [childRequests.activityId],
		references: [activities.id],
	}),
	resolvedBy: one(parents, {
		fields: [childRequests.resolvedByParentId],
		references: [parents.id],
	}),
	// The session and override point here (request_id is unique in both).
	session: one(sessions),
	override: one(quotaOverrides),
}));

export const quotaOverridesRelations = relations(
	quotaOverrides,
	({ one, many }) => ({
		child: one(children, {
			fields: [quotaOverrides.childId],
			references: [children.id],
		}),
		request: one(childRequests, {
			fields: [quotaOverrides.requestId],
			references: [childRequests.id],
		}),
		grantedBy: one(parents, {
			fields: [quotaOverrides.grantedByParentId],
			references: [parents.id],
		}),
		sessions: many(sessions),
	}),
);

export const sessionsRelations = relations(sessions, ({ one, many }) => ({
	child: one(children, {
		fields: [sessions.childId],
		references: [children.id],
	}),
	activity: one(activities, {
		fields: [sessions.activityId],
		references: [activities.id],
	}),
	request: one(childRequests, {
		fields: [sessions.requestId],
		references: [childRequests.id],
	}),
	override: one(quotaOverrides, {
		fields: [sessions.overrideId],
		references: [quotaOverrides.id],
	}),
	startedBy: one(parents, {
		fields: [sessions.startedByParentId],
		references: [parents.id],
		relationName: "sessionStartedBy",
	}),
	endedBy: one(parents, {
		fields: [sessions.endedByParentId],
		references: [parents.id],
		relationName: "sessionEndedBy",
	}),
	pauses: many(sessionPauses),
	alerts: many(sessionAlerts),
}));

export const sessionPausesRelations = relations(sessionPauses, ({ one }) => ({
	session: one(sessions, {
		fields: [sessionPauses.sessionId],
		references: [sessions.id],
	}),
	pausedBy: one(parents, {
		fields: [sessionPauses.pausedByParentId],
		references: [parents.id],
		relationName: "pausePausedBy",
	}),
	resumedBy: one(parents, {
		fields: [sessionPauses.resumedByParentId],
		references: [parents.id],
		relationName: "pauseResumedBy",
	}),
}));

export const sessionAlertsRelations = relations(sessionAlerts, ({ one }) => ({
	session: one(sessions, {
		fields: [sessionAlerts.sessionId],
		references: [sessions.id],
	}),
}));

export const bonusTasksRelations = relations(bonusTasks, ({ one, many }) => ({
	family: one(families, {
		fields: [bonusTasks.familyId],
		references: [families.id],
	}),
	createdBy: one(parents, {
		fields: [bonusTasks.createdByParentId],
		references: [parents.id],
	}),
	reports: many(taskReports),
}));

export const taskReportsRelations = relations(taskReports, ({ one }) => ({
	child: one(children, {
		fields: [taskReports.childId],
		references: [children.id],
	}),
	bonusTask: one(bonusTasks, {
		fields: [taskReports.bonusTaskId],
		references: [bonusTasks.id],
	}),
	reviewedBy: one(parents, {
		fields: [taskReports.reviewedByParentId],
		references: [parents.id],
	}),
}));

export const pushSubscriptionsRelations = relations(
	pushSubscriptions,
	({ one }) => ({
		authUser: one(authUser, {
			fields: [pushSubscriptions.authUserId],
			references: [authUser.id],
		}),
	}),
);

export const nativePushTokensRelations = relations(
	nativePushTokens,
	({ one }) => ({
		authUser: one(authUser, {
			fields: [nativePushTokens.authUserId],
			references: [authUser.id],
		}),
	}),
);
