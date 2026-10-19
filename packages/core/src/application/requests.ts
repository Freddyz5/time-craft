// The child's requests (start, extra_time) and how parents resolve them.
import { type Actor, requireChild, requireParent } from "../domain/actor";
import { assertFitsCap, sessionCapSeconds } from "../domain/balance";
import { messages } from "../domain/push";
import {
	type ChildRequest,
	isOverdue,
	markApproved,
	markCancelledByChild,
	markExpired,
	markRejected,
	type QuotaOverride,
	type RequestType,
} from "../domain/request";
import type { Session } from "../domain/session";
import {
	addMinutes,
	minutesToSeconds,
	optionalText,
	positiveMinutes,
	requiredText,
} from "../domain/values";
import { DomainError, invalidInput } from "../errors";
import {
	loadActivity,
	loadChild,
	loadChildById,
	loadFamily,
	parentUserIds,
} from "./access";
import {
	CommitThenThrow,
	type CoreDeps,
	type Tx,
	transaction,
} from "./context";
import { activityBalance, calendarOf } from "./quota";
import { assertNoOpenSession, openSession, resolveStartAt } from "./scheduling";

const REASON_MAX_LENGTH = 500;
const NOTE_MAX_LENGTH = 200;

const requestTypes: readonly RequestType[] = ["start", "extra_time"];

function requestNotFound(): DomainError {
	return new DomainError("request_not_found", "Request not found");
}

function requestExpired(request: ChildRequest): CommitThenThrow {
	return new CommitThenThrow(
		new DomainError("request_expired", "The request expired", {
			requestId: request.id,
			expiresAt: request.expiresAt.toISOString(),
		}),
	);
}

async function expire(tx: Tx, request: ChildRequest): Promise<void> {
	await tx.repos.requests.updateIfPending(markExpired(request));
}

// Lazy expiry: the child's pending request, unless its time ran out (then it
// is marked expired and null is returned).
async function currentPending(
	tx: Tx,
	childId: string,
): Promise<ChildRequest | null> {
	const pending = await tx.repos.requests.findPendingByChild(childId);
	if (pending !== null && isOverdue(pending, tx.now)) {
		await expire(tx, pending);
		return null;
	}
	return pending;
}

// A request the parent's family owns.
async function loadRequestForParent(
	tx: Tx,
	actor: Actor,
	requestId: string,
): Promise<ChildRequest> {
	const request = await tx.repos.requests.findById(requestId);
	if (request === null) {
		throw requestNotFound();
	}
	const child = await tx.repos.children.findById(request.childId);
	if (child === null || child.familyId !== actor.familyId) {
		throw requestNotFound();
	}
	return request;
}

function assertPending(request: ChildRequest): void {
	if (request.status !== "pending") {
		throw new DomainError(
			"request_already_resolved",
			`The request is already ${request.status}`,
			{ requestId: request.id, status: request.status },
		);
	}
}

// Writes the resolution; if another parent resolved it first, they win.
async function saveResolution(tx: Tx, request: ChildRequest): Promise<void> {
	if (!(await tx.repos.requests.updateIfPending(request))) {
		throw new DomainError(
			"request_already_resolved",
			"Another parent resolved the request first",
			{ requestId: request.id },
		);
	}
}

export interface CreateRequestInput {
	requestType: RequestType;
	activityId: string;
	requestedMinutes: number;
	// Required for extra_time.
	reason?: string;
}

// The child asks to start, or for extra time once the quota is used up. Only
// one pending request at a time; it expires after the family's
// request_expiry_minutes. The parents get a push.
export async function createRequest(
	deps: CoreDeps,
	actor: Actor,
	input: CreateRequestInput,
): Promise<ChildRequest> {
	requireChild(actor, "create a request");
	if (!requestTypes.includes(input.requestType)) {
		throw invalidInput("requestType", "must be start or extra_time");
	}
	const minutes = positiveMinutes(input.requestedMinutes, "requestedMinutes");
	const reason =
		input.requestType === "extra_time"
			? requiredText(input.reason, "reason", REASON_MAX_LENGTH)
			: optionalText(input.reason, "reason", REASON_MAX_LENGTH);
	return transaction(deps, async (tx) => {
		const child = await loadChild(tx, actor, actor.childId, "create a request");
		const family = await loadFamily(tx, child.familyId);
		const activity = await loadActivity(tx, family.id, input.activityId, {
			requireActive: true,
		});

		const pending = await currentPending(tx, child.id);
		if (pending !== null) {
			throw new DomainError(
				"request_already_pending",
				"There is already a pending request",
				{ requestId: pending.id },
			);
		}
		await assertNoOpenSession(tx, child.id);

		const { balance } = await activityBalance(
			tx,
			family,
			child.id,
			activity.id,
		);
		if (input.requestType === "start") {
			// With nothing left this fails with quota_exhausted: ask for extra time.
			assertFitsCap(minutesToSeconds(minutes), sessionCapSeconds(balance));
		} else if (balance.availableSeconds > 0) {
			throw new DomainError(
				"quota_not_exhausted",
				"There is time left: ask to start instead",
				{ availableSeconds: balance.availableSeconds },
			);
		}

		const request: ChildRequest = {
			id: tx.deps.ids.next(),
			childId: child.id,
			requestType: input.requestType,
			activityId: activity.id,
			requestedMinutes: minutes,
			reason,
			status: "pending",
			approvedMinutes: null,
			responseNote: null,
			createdAt: tx.now,
			expiresAt: addMinutes(tx.now, family.requestExpiryMinutes),
			resolvedByParentId: null,
			resolvedAt: null,
		};
		await tx.repos.requests.insert(request);
		tx.after.notify(
			await parentUserIds(tx, family.id),
			messages.requestCreated({
				childName: child.name,
				activityName: activity.name,
				requestId: request.id,
				requestType: request.requestType,
				minutes,
				reason,
			}),
		);
		return request;
	});
}

// Pending requests: the family's for a parent, their own for the child.
// Expired ones are marked as such and left out.
export async function listPendingRequests(
	deps: CoreDeps,
	actor: Actor,
): Promise<ChildRequest[]> {
	return transaction(deps, async (tx) => {
		if (actor.kind === "child") {
			const pending = await currentPending(tx, actor.childId);
			return pending === null ? [] : [pending];
		}
		const pending = await tx.repos.requests.listPendingByFamily(actor.familyId);
		const current: ChildRequest[] = [];
		for (const request of pending) {
			if (isOverdue(request, tx.now)) {
				await expire(tx, request);
			} else {
				current.push(request);
			}
		}
		return current;
	});
}

// The child withdraws their own pending request.
export async function cancelRequest(
	deps: CoreDeps,
	actor: Actor,
	input: { requestId: string },
): Promise<ChildRequest> {
	requireChild(actor, "cancel a request");
	return transaction(deps, async (tx) => {
		const request = await tx.repos.requests.findById(input.requestId);
		if (request === null || request.childId !== actor.childId) {
			throw requestNotFound();
		}
		assertPending(request);
		if (isOverdue(request, tx.now)) {
			await expire(tx, request);
			return requestExpired(request);
		}
		const cancelled = markCancelledByChild(request, tx.now);
		await saveResolution(tx, cancelled);
		return cancelled;
	});
}

export interface ApproveRequestInput {
	requestId: string;
	// At most the requested minutes.
	approvedMinutes: number;
	// Omitted: start now. Otherwise later today.
	startAt?: Date;
	note?: string;
}

export interface ApproveRequestResult {
	request: ChildRequest;
	session: Session;
	// Only for extra_time.
	override: QuotaOverride | null;
}

// A parent approves, possibly fewer minutes than asked, to start now or later
// today. The session (and the override, for extra_time) is created in the
// same transaction. If the other parent resolved it first, this fails with
// request_already_resolved. The child gets a push.
export async function approveRequest(
	deps: CoreDeps,
	actor: Actor,
	input: ApproveRequestInput,
): Promise<ApproveRequestResult> {
	requireParent(actor, "approve a request");
	const approvedMinutes = positiveMinutes(
		input.approvedMinutes,
		"approvedMinutes",
	);
	const note = optionalText(input.note, "note", NOTE_MAX_LENGTH);
	return transaction(deps, async (tx) => {
		const request = await loadRequestForParent(tx, actor, input.requestId);
		assertPending(request);
		if (isOverdue(request, tx.now)) {
			await expire(tx, request);
			return requestExpired(request);
		}
		const approved = markApproved(request, {
			at: tx.now,
			parentId: actor.parentId,
			approvedMinutes,
			note,
		});
		const child = await loadChildById(tx, request.childId);
		const family = await loadFamily(tx, child.familyId);
		const activity = await loadActivity(tx, family.id, request.activityId, {
			requireActive: true,
		});
		const scheduledStartAt = resolveStartAt(input.startAt, tx.now, family);
		await assertNoOpenSession(tx, child.id);

		const { policy, balance } = await activityBalance(
			tx,
			family,
			child.id,
			activity.id,
		);
		const isExtraTime = request.requestType === "extra_time";
		const plannedSeconds = minutesToSeconds(approvedMinutes);
		assertFitsCap(
			plannedSeconds,
			sessionCapSeconds(balance, isExtraTime ? approvedMinutes : 0),
		);

		await saveResolution(tx, approved);
		let override: QuotaOverride | null = null;
		if (isExtraTime) {
			override = {
				id: tx.deps.ids.next(),
				childId: child.id,
				requestId: request.id,
				grantedByParentId: actor.parentId,
				extraMinutes: approvedMinutes,
				// Required on extra_time requests.
				reason: request.reason ?? "",
				createdAt: tx.now,
			};
			await tx.repos.overrides.insert(override);
		}
		const session = await openSession(tx, {
			family,
			childId: child.id,
			activityId: activity.id,
			requestId: request.id,
			overrideId: override?.id ?? null,
			plannedSeconds,
			scheduledStartAt,
			parentId: actor.parentId,
			warningMinutes: policy.warningMinutes,
		});
		tx.after.notify(
			[child.authUserId],
			messages.requestApproved({
				requestId: request.id,
				sessionId: session.id,
				activityName: activity.name,
				minutes: approvedMinutes,
				scheduledStartAt,
				calendar: calendarOf(family),
				note,
			}),
		);
		return { request: approved, session, override };
	});
}

// A parent says no, optionally with a note for the child, who gets a push.
export async function rejectRequest(
	deps: CoreDeps,
	actor: Actor,
	input: { requestId: string; note?: string },
): Promise<ChildRequest> {
	requireParent(actor, "reject a request");
	const note = optionalText(input.note, "note", NOTE_MAX_LENGTH);
	return transaction(deps, async (tx) => {
		const request = await loadRequestForParent(tx, actor, input.requestId);
		assertPending(request);
		if (isOverdue(request, tx.now)) {
			await expire(tx, request);
			return requestExpired(request);
		}
		const rejected = markRejected(request, {
			at: tx.now,
			parentId: actor.parentId,
			note,
		});
		await saveResolution(tx, rejected);
		const child = await loadChildById(tx, request.childId);
		tx.after.notify(
			[child.authUserId],
			messages.requestRejected({ requestId: request.id, note }),
		);
		return rejected;
	});
}
