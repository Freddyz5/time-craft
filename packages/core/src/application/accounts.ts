// Accounts: who an auth_user is, the child's login (lockout and devices),
// password and PIN resets within the family, and the family's recovery code.
import type { Actor } from "../domain/actor";
import { requireParent } from "../domain/actor";
import {
	isLockedOut,
	normalizeEmail,
	normalizeUsername,
	recordFailedPin,
	recordSuccessfulPin,
	validateParentPassword,
	validatePin,
} from "../domain/credentials";
import type { Child } from "../domain/family";
import { optionalText, requiredText } from "../domain/values";
import { DomainError, forbidden } from "../errors";
import type { LoginSession } from "../ports";
import { loadChild, loadFamily } from "./access";
import { type CoreDeps, transaction } from "./context";

// Parent or child is decided by the domain table that references the
// auth_user. The api's auth middleware calls this to build the Actor; null
// means a valid login with no role (no access).
export async function resolveActor(
	deps: CoreDeps,
	input: { authUserId: string },
): Promise<Actor | null> {
	return transaction(deps, async (tx) => {
		const parent = await tx.repos.parents.findByAuthUserId(input.authUserId);
		const child = await tx.repos.children.findByAuthUserId(input.authUserId);
		if (parent !== null && child !== null) {
			// Invariant kept by createChildAccount; reaching it is a bug.
			throw new Error(`auth_user ${input.authUserId} is both parent and child`);
		}
		if (parent !== null) {
			return { kind: "parent", parentId: parent.id, familyId: parent.familyId };
		}
		if (child !== null) {
			return { kind: "child", childId: child.id, familyId: child.familyId };
		}
		return null;
	});
}

function childLocked(child: Child): DomainError {
	return new DomainError("child_locked", "Too many wrong PINs", {
		lockedUntil: child.lockedUntil?.toISOString() ?? null,
	});
}

// Before checking a username + PIN sign-in (Better Auth hook): fails with
// child_locked while the child is locked out. Users that are not children
// pass through.
export async function assertChildCanSignIn(
	deps: CoreDeps,
	input: { authUserId: string },
): Promise<void> {
	return transaction(deps, async (tx) => {
		const child = await tx.repos.children.findByAuthUserId(input.authUserId);
		if (child !== null && isLockedOut(child, tx.now)) {
			throw childLocked(child);
		}
	});
}

// After a username + PIN sign-in (Better Auth hook): counts a wrong PIN, and
// locks the child out after too many; a right one clears the count. Returns
// when the lockout ends, if this attempt started one.
export async function recordChildSignIn(
	deps: CoreDeps,
	input: { authUserId: string; succeeded: boolean },
): Promise<{ lockedUntil: Date | null }> {
	return transaction(deps, async (tx) => {
		const child = await tx.repos.children.findByAuthUserId(input.authUserId);
		if (child === null) {
			return { lockedUntil: null };
		}
		const updated = input.succeeded
			? recordSuccessfulPin(child)
			: recordFailedPin(child, tx.now);
		await tx.repos.children.update(updated);
		const startedLockout =
			updated.lockedUntil !== null &&
			updated.lockedUntil.getTime() !== child.lockedUntil?.getTime();
		return { lockedUntil: startedLockout ? updated.lockedUntil : null };
	});
}

// Before someone changes their own password with the current one (Better
// Auth's /change-password hook). Parents get the stricter rule; the child's
// PIN is set by a parent, so the child cannot change it.
export async function assertCanChangeOwnPassword(
	deps: CoreDeps,
	input: { authUserId: string; newPassword: string },
): Promise<void> {
	const actor = await resolveActor(deps, { authUserId: input.authUserId });
	if (actor?.kind !== "parent") {
		throw forbidden("change this password");
	}
	validateParentPassword(input.newPassword);
}

// The devices where the child is signed in, so a parent can close them.
export async function listChildLogins(
	deps: CoreDeps,
	actor: Actor,
	input: { childId: string },
): Promise<LoginSession[]> {
	requireParent(actor, "see the child's devices");
	const child = await transaction(deps, (tx) =>
		loadChild(tx, actor, input.childId, "see the child's devices"),
	);
	return deps.identity.listSessions(child.authUserId);
}

// A parent signs the child out of every device, or of one (`loginId`).
export async function revokeChildLogins(
	deps: CoreDeps,
	actor: Actor,
	input: { childId: string; loginId?: string },
): Promise<{ revoked: number }> {
	requireParent(actor, "sign the child out");
	const child = await transaction(deps, (tx) =>
		loadChild(tx, actor, input.childId, "sign the child out"),
	);
	const revoked = await deps.identity.revokeSessions(
		child.authUserId,
		input.loginId,
	);
	if (input.loginId !== undefined && revoked === 0) {
		throw new DomainError("login_not_found", "Login session not found");
	}
	return { revoked };
}

export interface CreateChildAccountInput {
	name: string;
	// Unique across the app; the child signs in with it and the PIN.
	username: string;
	pin: string;
	avatar?: string;
}

// A parent creates the child's login (Better Auth) and the child row. If the
// row cannot be written, the login is deleted again.
export async function createChildAccount(
	deps: CoreDeps,
	actor: Actor,
	input: CreateChildAccountInput,
): Promise<Child> {
	requireParent(actor, "create a child account");
	const name = requiredText(input.name, "name", 100);
	const avatar = optionalText(input.avatar, "avatar", 60);
	const username = normalizeUsername(input.username);
	const pin = validatePin(input.pin);

	const created = await deps.identity.createChildUser({ name, username, pin });
	if (!created.ok) {
		throw new DomainError("username_taken", "The username is already taken", {
			username,
		});
	}
	try {
		return await transaction(deps, async (tx) => {
			await loadFamily(tx, actor.familyId);
			// An auth_user cannot be parent and child at once.
			if (
				(await tx.repos.parents.findByAuthUserId(created.authUserId)) !== null
			) {
				throw new Error(`auth_user ${created.authUserId} is already a parent`);
			}
			const child: Child = {
				id: tx.deps.ids.next(),
				familyId: actor.familyId,
				authUserId: created.authUserId,
				name,
				avatar,
				failedPinAttempts: 0,
				lockedUntil: null,
				createdAt: tx.now,
			};
			await tx.repos.children.insert(child);
			return child;
		});
	} catch (error) {
		await deps.identity.deleteUser(created.authUserId).catch(() => undefined);
		throw error;
	}
}

export type ResetPasswordTarget =
	| { kind: "parent"; parentId: string }
	| { kind: "child"; childId: string };

// A parent sets the other parent's password or the child's PIN (same family
// only). Their own password is changed through the normal sign-in flow, with
// the current one. A new PIN also lifts the child's lockout.
export async function resetPassword(
	deps: CoreDeps,
	actor: Actor,
	input: { target: ResetPasswordTarget; newPassword: string },
): Promise<void> {
	requireParent(actor, "reset a password");
	const { target } = input;
	if (target.kind === "parent" && target.parentId === actor.parentId) {
		throw new DomainError(
			"cannot_reset_own_password",
			"Change your own password with your current one",
		);
	}
	const secret =
		target.kind === "parent"
			? validateParentPassword(input.newPassword)
			: validatePin(input.newPassword);
	return transaction(deps, async (tx) => {
		let authUserId: string;
		if (target.kind === "parent") {
			const parent = await tx.repos.parents.findById(target.parentId);
			if (parent === null || parent.familyId !== actor.familyId) {
				throw new DomainError("parent_not_found", "Parent not found");
			}
			authUserId = parent.authUserId;
		} else {
			const child = await tx.repos.children.findById(target.childId);
			if (child === null || child.familyId !== actor.familyId) {
				throw new DomainError("child_not_found", "Child not found");
			}
			authUserId = child.authUserId;
			await tx.repos.children.update({
				...child,
				failedPinAttempts: 0,
				lockedUntil: null,
			});
		}
		// Last, so a failure rolls back the unlock too.
		await tx.deps.identity.setPassword(authUserId, secret);
	});
}

function invalidRecoveryCode(): DomainError {
	return new DomainError(
		"invalid_recovery_code",
		"The email or the recovery code is not valid",
	);
}

// Last resort when both parents lost access: the family's recovery code
// resets one parent's password. It is single-use: a new one is generated and
// returned (shown once). Unknown email and wrong code fail the same way. The
// api puts a strict rate limit in front of it.
export async function useRecoveryCode(
	deps: CoreDeps,
	input: { email: string; code: string; newPassword: string },
): Promise<{ recoveryCode: string }> {
	const password = validateParentPassword(input.newPassword);
	const authUserId = await deps.identity.findUserIdByEmail(
		normalizeEmail(input.email),
	);
	if (authUserId === null) {
		throw invalidRecoveryCode();
	}
	return transaction(deps, async (tx) => {
		const parent = await tx.repos.parents.findByAuthUserId(authUserId);
		if (parent === null) {
			throw invalidRecoveryCode();
		}
		const family = await loadFamily(tx, parent.familyId);
		const storedHash = family.recoveryCodeHash;
		if (
			storedHash === null ||
			!(await tx.deps.recoveryCodes.verify(input.code.trim(), storedHash))
		) {
			throw invalidRecoveryCode();
		}
		const recoveryCode = tx.deps.recoveryCodes.generate();
		const replaced = await tx.repos.families.replaceRecoveryCode(
			family.id,
			storedHash,
			{
				hash: await tx.deps.recoveryCodes.hash(recoveryCode),
				createdAt: tx.now,
			},
		);
		if (!replaced) {
			// Used by someone else in the meantime.
			throw invalidRecoveryCode();
		}
		await tx.deps.identity.setPassword(authUserId, password);
		return { recoveryCode };
	});
}

// A parent creates the family's recovery code (when setting up the home) or
// replaces it. Returns the code to show once; only its hash is stored.
export async function regenerateRecoveryCode(
	deps: CoreDeps,
	actor: Actor,
): Promise<{ recoveryCode: string; createdAt: Date }> {
	requireParent(actor, "regenerate the recovery code");
	return transaction(deps, async (tx) => {
		const family = await loadFamily(tx, actor.familyId);
		const recoveryCode = tx.deps.recoveryCodes.generate();
		const replaced = await tx.repos.families.replaceRecoveryCode(
			family.id,
			family.recoveryCodeHash,
			{
				hash: await tx.deps.recoveryCodes.hash(recoveryCode),
				createdAt: tx.now,
			},
		);
		if (!replaced) {
			throw new DomainError(
				"concurrent_update",
				"The recovery code changed in the meantime",
			);
		}
		return { recoveryCode, createdAt: tx.now };
	});
}
