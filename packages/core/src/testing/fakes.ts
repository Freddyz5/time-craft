// Fakes for the non-database ports. They record what core asked for, so tests
// can assert on it.
import type { PushMessage } from "../domain/push";
import type {
	Clock,
	CreateChildUserResult,
	IdentityService,
	IdGenerator,
	JobScheduler,
	Notifier,
	RecoveryCodeService,
	ScheduledJob,
} from "../ports";

export class FixedClock implements Clock {
	private current: Date;

	constructor(at: Date | string) {
		this.current = new Date(at);
	}

	now(): Date {
		return new Date(this.current.getTime());
	}

	set(at: Date | string): void {
		this.current = new Date(at);
	}

	advanceMinutes(minutes: number): void {
		this.current = new Date(this.current.getTime() + minutes * 60_000);
	}

	advanceSeconds(seconds: number): void {
		this.current = new Date(this.current.getTime() + seconds * 1000);
	}
}

export class SequentialIds implements IdGenerator {
	private count = 0;

	next(): string {
		this.count += 1;
		return `id-${this.count}`;
	}
}

export interface RecordedJob extends ScheduledJob {
	providerMessageId: string;
}

export class FakeJobScheduler implements JobScheduler {
	readonly scheduled: RecordedJob[] = [];
	readonly cancelled: string[] = [];
	private count = 0;

	async schedule(job: ScheduledJob): Promise<string> {
		this.count += 1;
		const providerMessageId = `msg-${this.count}`;
		this.scheduled.push({ ...job, providerMessageId });
		return providerMessageId;
	}

	async cancel(providerMessageId: string): Promise<void> {
		this.cancelled.push(providerMessageId);
	}

	// Jobs scheduled and not cancelled at the provider.
	active(): RecordedJob[] {
		return this.scheduled.filter(
			(job) => !this.cancelled.includes(job.providerMessageId),
		);
	}

	clear(): void {
		this.scheduled.length = 0;
		this.cancelled.length = 0;
	}
}

export interface SentPush {
	to: readonly string[];
	message: PushMessage;
}

export class FakeNotifier implements Notifier {
	readonly sent: SentPush[] = [];

	async send(
		authUserIds: readonly string[],
		message: PushMessage,
	): Promise<void> {
		this.sent.push({ to: [...authUserIds], message });
	}

	kinds(): string[] {
		return this.sent.map((push) => push.message.kind);
	}

	clear(): void {
		this.sent.length = 0;
	}
}

export interface FakeUser {
	id: string;
	name: string;
	email: string | null;
	username: string | null;
	password: string | null;
}

export class FakeIdentityService implements IdentityService {
	readonly users = new Map<string, FakeUser>();
	private count = 0;

	addUser(user: Omit<FakeUser, "password"> & { password?: string }): void {
		this.users.set(user.id, { ...user, password: user.password ?? null });
	}

	async createChildUser(input: {
		name: string;
		username: string;
		pin: string;
	}): Promise<CreateChildUserResult> {
		if (
			[...this.users.values()].some((user) => user.username === input.username)
		) {
			return { ok: false, reason: "username_taken" };
		}
		this.count += 1;
		const id = `auth-new-${this.count}`;
		this.users.set(id, {
			id,
			name: input.name,
			email: `${input.username}@hijos.timecraft.local`,
			username: input.username,
			password: input.pin,
		});
		return { ok: true, authUserId: id };
	}

	async deleteUser(authUserId: string): Promise<void> {
		this.users.delete(authUserId);
	}

	async setPassword(authUserId: string, password: string): Promise<void> {
		const user = this.users.get(authUserId);
		if (user === undefined) {
			throw new Error(`auth_user ${authUserId} not found`);
		}
		user.password = password;
	}

	async findUserIdByEmail(email: string): Promise<string | null> {
		return (
			[...this.users.values()].find((user) => user.email === email)?.id ?? null
		);
	}

	passwordOf(authUserId: string): string | null {
		return this.users.get(authUserId)?.password ?? null;
	}
}

export class FakeRecoveryCodes implements RecoveryCodeService {
	private count = 0;

	generate(): string {
		this.count += 1;
		return `RECOVERY-${this.count}`;
	}

	async hash(code: string): Promise<string> {
		return `hashed:${code}`;
	}

	async verify(code: string, hash: string): Promise<boolean> {
		return hash === `hashed:${code}`;
	}
}
