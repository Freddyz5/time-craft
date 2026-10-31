// Web Push subscriptions and Android app tokens of whoever is signed in
// (parent or child).
import type { Actor } from "../domain/actor";
import type {
	NativePlatform,
	NativePushToken,
	PushSubscription,
} from "../domain/push";
import { optionalText, requiredText } from "../domain/values";
import { DomainError, invalidInput } from "../errors";
import { type CoreDeps, type Tx, transaction } from "./context";

async function actorAuthUserId(tx: Tx, actor: Actor): Promise<string> {
	if (actor.kind === "parent") {
		const parent = await tx.repos.parents.findById(actor.parentId);
		if (parent === null) {
			throw new DomainError("parent_not_found", "Parent not found");
		}
		return parent.authUserId;
	}
	const child = await tx.repos.children.findById(actor.childId);
	if (child === null) {
		throw new DomainError("child_not_found", "Child not found");
	}
	return child.authUserId;
}

function validEndpoint(value: string): string {
	const endpoint = value.trim();
	if (!URL.canParse(endpoint) || new URL(endpoint).protocol !== "https:") {
		throw invalidInput("endpoint", "must be an https URL");
	}
	return endpoint;
}

export interface RegisterSubscriptionInput {
	endpoint: string;
	p256dhKey: string;
	authKey: string;
	deviceLabel?: string;
}

// Saves this browser's subscription for the actor. A browser that was
// registered by someone else (a shared tablet) now belongs to the actor.
export async function registerSubscription(
	deps: CoreDeps,
	actor: Actor,
	input: RegisterSubscriptionInput,
): Promise<PushSubscription> {
	const endpoint = validEndpoint(input.endpoint);
	const p256dhKey = requiredText(input.p256dhKey, "p256dhKey", 255);
	const authKey = requiredText(input.authKey, "authKey", 255);
	const deviceLabel = optionalText(input.deviceLabel, "deviceLabel", 100);
	return transaction(deps, async (tx) => {
		const authUserId = await actorAuthUserId(tx, actor);
		const existing = await tx.repos.pushSubscriptions.findByEndpoint(endpoint);
		const subscription: PushSubscription = {
			id: existing?.id ?? tx.deps.ids.next(),
			authUserId,
			endpoint,
			p256dhKey,
			authKey,
			deviceLabel,
			createdAt: existing?.createdAt ?? tx.now,
			lastUsedAt: existing?.lastUsedAt ?? null,
		};
		await tx.repos.pushSubscriptions.upsertByEndpoint(subscription);
		return subscription;
	});
}

// Removes the actor's subscription for this browser. Does nothing if it is
// not theirs or no longer exists.
export async function removeSubscription(
	deps: CoreDeps,
	actor: Actor,
	input: { endpoint: string },
): Promise<void> {
	return transaction(deps, async (tx) => {
		const authUserId = await actorAuthUserId(tx, actor);
		const existing = await tx.repos.pushSubscriptions.findByEndpoint(
			input.endpoint.trim(),
		);
		if (existing !== null && existing.authUserId === authUserId) {
			await tx.repos.pushSubscriptions.deleteByEndpoint(existing.endpoint);
		}
	});
}

export interface RegisterNativeTokenInput {
	token: string;
	platform: NativePlatform;
	deviceLabel?: string;
}

// Saves the Android app's push token for the actor. An app where someone else
// was signed in (a phone passed around) now belongs to the actor.
export async function registerNativeToken(
	deps: CoreDeps,
	actor: Actor,
	input: RegisterNativeTokenInput,
): Promise<NativePushToken> {
	const token = requiredText(input.token, "token", 4096);
	if (input.platform !== "android") {
		throw invalidInput("platform", "must be android");
	}
	const deviceLabel = optionalText(input.deviceLabel, "deviceLabel", 100);
	return transaction(deps, async (tx) => {
		const authUserId = await actorAuthUserId(tx, actor);
		const existing = await tx.repos.nativePushTokens.findByToken(token);
		const saved: NativePushToken = {
			id: existing?.id ?? tx.deps.ids.next(),
			authUserId,
			token,
			platform: input.platform,
			deviceLabel,
			createdAt: existing?.createdAt ?? tx.now,
			lastUsedAt: existing?.lastUsedAt ?? null,
		};
		await tx.repos.nativePushTokens.upsertByToken(saved);
		return saved;
	});
}

// Removes the actor's token for this app (on sign-out). Does nothing if it is
// not theirs or no longer exists.
export async function removeNativeToken(
	deps: CoreDeps,
	actor: Actor,
	input: { token: string },
): Promise<void> {
	return transaction(deps, async (tx) => {
		const authUserId = await actorAuthUserId(tx, actor);
		const existing = await tx.repos.nativePushTokens.findByToken(
			input.token.trim(),
		);
		if (existing !== null && existing.authUserId === authUserId) {
			await tx.repos.nativePushTokens.deleteByToken(existing.token);
		}
	});
}
