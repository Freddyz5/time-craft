// IdentityService on Better Auth's server-side context (`auth.$context`).
// Sign-up is disabled and the admin plugin's setUserPassword needs an admin
// session (the recovery code flow has none), so this does what those
// endpoints do inside: hash with Better Auth's hasher and write through its
// adapter, which keeps hooks and the credential account format.
import type {
	CreateChildUserResult,
	IdentityService,
	LoginSession,
} from "@time-craft/core";
import { type Auth, CHILD_EMAIL_DOMAIN } from "../auth";
import { isUniqueViolation } from "./postgres";

const CREDENTIAL_PROVIDER = "credential";

interface SessionRow {
	id: string;
	createdAt: Date;
	updatedAt: Date;
	expiresAt: Date;
	ipAddress?: string | null;
	userAgent?: string | null;
}

export class BetterAuthIdentityService implements IdentityService {
	constructor(private readonly auth: Auth) {}

	async createChildUser(input: {
		name: string;
		username: string;
		pin: string;
	}): Promise<CreateChildUserResult> {
		const ctx = await this.auth.$context;
		const taken = await ctx.adapter.findOne({
			model: "user",
			where: [{ field: "username", value: input.username }],
		});
		if (taken !== null) {
			return { ok: false, reason: "username_taken" };
		}
		const hash = await ctx.password.hash(input.pin);
		let user: { id: string } | null;
		try {
			user = await ctx.internalAdapter.createUser(
				{
					name: input.name,
					email: `${input.username}@${CHILD_EMAIL_DOMAIN}`,
					emailVerified: false,
					username: input.username,
					displayUsername: input.username,
				},
				// A parent creates it, as the admin plugin would.
				{ method: "admin" },
			);
		} catch (error) {
			// Someone took it between the check and the insert.
			if (isUniqueViolation(error)) {
				return { ok: false, reason: "username_taken" };
			}
			throw error;
		}
		if (user === null) {
			throw new Error("Better Auth refused to create the child's user");
		}
		try {
			await ctx.internalAdapter.linkAccount({
				userId: user.id,
				providerId: CREDENTIAL_PROVIDER,
				accountId: user.id,
				password: hash,
			});
		} catch (error) {
			await ctx.internalAdapter.deleteUser(user.id);
			throw error;
		}
		return { ok: true, authUserId: user.id };
	}

	async deleteUser(authUserId: string): Promise<void> {
		const ctx = await this.auth.$context;
		await ctx.internalAdapter.deleteUser(authUserId);
	}

	// Same as the admin plugin's setUserPassword: updates the credential
	// account, or creates it for a parent who only used Google so far.
	async setPassword(authUserId: string, password: string): Promise<void> {
		const ctx = await this.auth.$context;
		const user = await ctx.internalAdapter.findUserById(authUserId);
		if (user === null) {
			throw new Error(`auth_user ${authUserId} not found`);
		}
		const hash = await ctx.password.hash(password);
		if (await ctx.internalAdapter.findCredentialAccount(authUserId)) {
			await ctx.internalAdapter.updatePassword(authUserId, hash);
		} else {
			await ctx.internalAdapter.createAccount({
				userId: authUserId,
				providerId: CREDENTIAL_PROVIDER,
				accountId: authUserId,
				password: hash,
			});
		}
	}

	async findUserIdByEmail(email: string): Promise<string | null> {
		const ctx = await this.auth.$context;
		const found = await ctx.internalAdapter.findUserByEmail(email);
		return found?.user.id ?? null;
	}

	async listSessions(authUserId: string): Promise<LoginSession[]> {
		const ctx = await this.auth.$context;
		const rows = await ctx.adapter.findMany<SessionRow>({
			model: "session",
			where: [
				{ field: "userId", value: authUserId },
				{ field: "expiresAt", value: new Date(), operator: "gt" },
			],
			sortBy: { field: "createdAt", direction: "desc" },
		});
		// Never the token: it is the session's secret.
		return rows.map((row) => ({
			id: row.id,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
			expiresAt: row.expiresAt,
			ipAddress: row.ipAddress ?? null,
			userAgent: row.userAgent ?? null,
		}));
	}

	async revokeSessions(
		authUserId: string,
		sessionId?: string,
	): Promise<number> {
		const ctx = await this.auth.$context;
		return ctx.adapter.deleteMany({
			model: "session",
			where: [
				{ field: "userId", value: authUserId },
				...(sessionId === undefined ? [] : [{ field: "id", value: sessionId }]),
			],
		});
	}
}
