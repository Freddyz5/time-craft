// Drizzle implementation of core's repositories and UnitOfWork. Every
// repository runs on the transaction the UnitOfWork opens, so a use case
// commits or rolls back as a whole (neon-serverless supports interactive
// transactions; see packages/db).
import type { Repositories, UnitOfWork } from "@time-craft/core";
import type { Db } from "@time-craft/db";
import { bonusTaskRepository, taskReportRepository } from "./bonuses";
import {
	activityRepository,
	childRepository,
	familyRepository,
	parentRepository,
} from "./family";
import { nativePushTokenRepository, pushSubscriptionRepository } from "./push";
import { childRequestRepository, quotaOverrideRepository } from "./requests";
import { quotaPolicyRepository } from "./rules";
import { sessionAlertRepository, sessionRepository } from "./timer";

export function createRepositories(db: Db): Repositories {
	return {
		families: familyRepository(db),
		parents: parentRepository(db),
		children: childRepository(db),
		activities: activityRepository(db),
		policies: quotaPolicyRepository(db),
		requests: childRequestRepository(db),
		overrides: quotaOverrideRepository(db),
		sessions: sessionRepository(db),
		alerts: sessionAlertRepository(db),
		bonusTasks: bonusTaskRepository(db),
		taskReports: taskReportRepository(db),
		pushSubscriptions: pushSubscriptionRepository(db),
		nativePushTokens: nativePushTokenRepository(db),
	};
}

export class DrizzleUnitOfWork implements UnitOfWork {
	constructor(private readonly db: Db) {}

	run<T>(work: (repos: Repositories) => Promise<T>): Promise<T> {
		return this.db.transaction((tx) => work(createRepositories(tx)));
	}
}
