// What the child asks for and a parent resolves:
//   start      = "I want to start" (activity + minutes)
//   extra_time = "I want extra time" (reason required, only with no quota left)
// Lifecycle: pending → approved | rejected | expired | cancelled. Expiry is
// lazy: a pending request past expires_at is marked expired when read or
// before the child creates another one.
// An override is the extra time a parent grants once the quota is used up,
// from an extra_time request or directly (request_id null).
import { DomainError } from "../errors";

export type RequestType = "start" | "extra_time";

export type RequestStatus =
	| "pending"
	| "approved"
	| "rejected"
	| "expired"
	| "cancelled";

export interface ChildRequest {
	id: string;
	childId: string;
	requestType: RequestType;
	activityId: string;
	requestedMinutes: number;
	reason: string | null;
	status: RequestStatus;
	approvedMinutes: number | null;
	responseNote: string | null;
	createdAt: Date;
	expiresAt: Date;
	resolvedByParentId: string | null;
	resolvedAt: Date | null;
}

export interface QuotaOverride {
	id: string;
	childId: string;
	requestId: string | null;
	grantedByParentId: string;
	extraMinutes: number;
	reason: string;
	createdAt: Date;
}

export function isOverdue(request: ChildRequest, now: Date): boolean {
	return (
		request.status === "pending" && request.expiresAt.getTime() <= now.getTime()
	);
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

export function markApproved(
	request: ChildRequest,
	approval: {
		at: Date;
		parentId: string;
		approvedMinutes: number;
		note: string | null;
	},
): ChildRequest {
	assertPending(request);
	if (approval.approvedMinutes > request.requestedMinutes) {
		throw new DomainError(
			"exceeds_requested",
			"Cannot approve more minutes than requested",
			{
				requestedMinutes: request.requestedMinutes,
				approvedMinutes: approval.approvedMinutes,
			},
		);
	}
	return {
		...request,
		status: "approved",
		approvedMinutes: approval.approvedMinutes,
		responseNote: approval.note,
		resolvedByParentId: approval.parentId,
		resolvedAt: approval.at,
	};
}

export function markRejected(
	request: ChildRequest,
	rejection: { at: Date; parentId: string; note: string | null },
): ChildRequest {
	assertPending(request);
	return {
		...request,
		status: "rejected",
		responseNote: rejection.note,
		resolvedByParentId: rejection.parentId,
		resolvedAt: rejection.at,
	};
}

export function markCancelledByChild(
	request: ChildRequest,
	at: Date,
): ChildRequest {
	assertPending(request);
	return { ...request, status: "cancelled", resolvedAt: at };
}

// It expired when its time ran out, not when someone noticed.
export function markExpired(request: ChildRequest): ChildRequest {
	assertPending(request);
	return { ...request, status: "expired", resolvedAt: request.expiresAt };
}
