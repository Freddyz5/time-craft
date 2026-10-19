// Ports: what core needs from the outside. apps/api implements them (Drizzle,
// QStash, Web Push, Better Auth) and wires them in its composition root.
import type { AlertType } from "../domain/alerts";
import type { PushMessage } from "../domain/push";
import type { Repositories } from "./repositories";

export type * from "./repositories";

// A database transaction. Everything `work` does through `repos` commits or
// rolls back together; if `work` throws, nothing is written.
export interface UnitOfWork {
	run<T>(work: (repos: Repositories) => Promise<T>): Promise<T>;
}

// The only source of "now" in core.
export interface Clock {
	now(): Date;
}

// Ids for new rows (uuid in production), so core knows them before inserting.
export interface IdGenerator {
	next(): string;
}

export interface ScheduledJob {
	alertId: string;
	alertType: AlertType;
	runAt: Date;
}

// Delayed jobs (QStash messages with notBefore). When a job comes due, the
// api calls `handleJob({ alertId })`; deliveries may repeat or arrive late.
export interface JobScheduler {
	// Returns the provider's message id, used to cancel it.
	schedule(job: ScheduledJob): Promise<string>;
	// Must not fail if the message was already delivered or cancelled.
	cancel(providerMessageId: string): Promise<void>;
}

// Push to every subscription of the given auth_user ids. Core calls it after
// committing and ignores its errors (the operation already happened), so the
// adapter logs them, and deletes subscriptions answered with 404 or 410.
export interface Notifier {
	send(authUserIds: readonly string[], message: PushMessage): Promise<void>;
}

export type CreateChildUserResult =
	| { ok: true; authUserId: string }
	| { ok: false; reason: "username_taken" };

// The auth provider (Better Auth). Outside the UnitOfWork's transaction.
export interface IdentityService {
	// Creates the child's login: username (unique across the app) + PIN. The
	// adapter makes up the synthetic email Better Auth requires.
	createChildUser(input: {
		name: string;
		username: string;
		pin: string;
	}): Promise<CreateChildUserResult>;
	// Undoes `createChildUser` when the domain row cannot be written.
	deleteUser(authUserId: string): Promise<void>;
	// Sets the password (parent) or PIN (child) of a credential account.
	setPassword(authUserId: string, password: string): Promise<void>;
	findUserIdByEmail(email: string): Promise<string | null>;
}

// The family's single-use recovery code.
export interface RecoveryCodeService {
	// A long random code, shown once to the parents.
	generate(): string;
	hash(code: string): Promise<string>;
	verify(code: string, hash: string): Promise<boolean>;
}
