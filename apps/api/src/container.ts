// Composition: Better Auth, core with its adapters, and the Hono app on top.
// index.ts builds it for production; tests and the seed build it with their
// own database and fakes for the outside services.
import {
	type Clock,
	createCore,
	type IdGenerator,
	type JobScheduler,
	type Notifier,
} from "@time-craft/core";
import type { Db } from "@time-craft/db";
import { DrizzleUnitOfWork } from "./adapters/drizzle";
import { BetterAuthIdentityService } from "./adapters/identity";
import type { JobSignatureVerifier } from "./adapters/qstash";
import { ScryptRecoveryCodes } from "./adapters/recovery-codes";
import { uuidIds } from "./adapters/system";
import { createApp } from "./app";
import { type AuthOptions, createAuth } from "./auth";
import { DatabaseRateLimiter } from "./http/rate-limit";

export interface ContainerOptions {
	db: Db;
	auth: Omit<AuthOptions, "db" | "guard"> & {
		// Defaults to `db`. Tests pass one that follows the open transaction.
		db?: Db;
	};
	clock: Clock;
	ids?: IdGenerator;
	jobs: JobScheduler;
	notifier: Notifier;
	jobSignatures: JobSignatureVerifier;
}

export function createContainer(options: ContainerOptions) {
	const { db, clock } = options;
	const auth = createAuth({
		...options.auth,
		db: options.auth.db ?? db,
		// Better Auth's hooks ask core, which is built right below.
		guard: {
			assertChildCanSignIn: (input) => core.assertChildCanSignIn(input),
			recordChildSignIn: (input) => core.recordChildSignIn(input),
			assertCanChangeOwnPassword: (input) =>
				core.assertCanChangeOwnPassword(input),
		},
	});
	const core = createCore({
		uow: new DrizzleUnitOfWork(db),
		clock,
		ids: options.ids ?? uuidIds,
		jobs: options.jobs,
		notifier: options.notifier,
		identity: new BetterAuthIdentityService(auth),
		recoveryCodes: new ScryptRecoveryCodes(),
	});
	const app = createApp({
		core,
		auth,
		clock,
		jobSignatures: options.jobSignatures,
		rateLimiter: new DatabaseRateLimiter(db),
	});
	return { app, auth, core };
}

export type Container = ReturnType<typeof createContainer>;
