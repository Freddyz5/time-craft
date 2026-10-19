// What every use case runs on: the ports, one transaction, one "now", and the
// side effects to run once it commits.
//
// Side effects and the transaction:
// - New jobs are scheduled inside the transaction, after the writes: if
//   scheduling fails, nothing is written. If the commit fails after
//   scheduling, the job finds no alert row and `handleJob` ignores it.
// - Cancelled jobs are marked in the transaction (cancelled_at) and cancelled
//   at the provider after the commit, so a provider outage never blocks a
//   pause or a stop; a job that still fires sees cancelled_at and is ignored.
// - Push notifications go out after the commit.
// After-commit failures are swallowed: the operation already happened.

import type { PushMessage } from "../domain/push";
import type { DomainError } from "../errors";
import type {
	Clock,
	IdentityService,
	IdGenerator,
	JobScheduler,
	Notifier,
	RecoveryCodeService,
	UnitOfWork,
} from "../ports";
import type { Repositories } from "../ports/repositories";

export interface CoreDeps {
	uow: UnitOfWork;
	clock: Clock;
	ids: IdGenerator;
	jobs: JobScheduler;
	notifier: Notifier;
	identity: IdentityService;
	recoveryCodes: RecoveryCodeService;
}

export class AfterCommit {
	readonly cancelledJobs: string[] = [];
	readonly notifications: { to: readonly string[]; message: PushMessage }[] =
		[];

	cancelJob(providerMessageId: string): void {
		this.cancelledJobs.push(providerMessageId);
	}

	notify(to: readonly string[], message: PushMessage): void {
		if (to.length > 0) {
			this.notifications.push({ to, message });
		}
	}

	async run(deps: CoreDeps): Promise<void> {
		await Promise.allSettled([
			...this.cancelledJobs.map((id) => deps.jobs.cancel(id)),
			...this.notifications.map(({ to, message }) =>
				deps.notifier.send(to, message),
			),
		]);
	}
}

export interface Tx {
	deps: CoreDeps;
	repos: Repositories;
	now: Date;
	after: AfterCommit;
}

// Returned from a transaction to commit what was written and then fail, e.g.
// a request found expired is saved as expired before reporting it.
export class CommitThenThrow {
	constructor(readonly error: DomainError) {}
}

export async function transaction<T>(
	deps: CoreDeps,
	work: (tx: Tx) => Promise<T | CommitThenThrow>,
): Promise<T> {
	const now = deps.clock.now();
	const after = new AfterCommit();
	const result = await deps.uow.run((repos) =>
		work({ deps, repos, now, after }),
	);
	await after.run(deps);
	if (result instanceof CommitThenThrow) {
		throw result.error;
	}
	return result;
}
