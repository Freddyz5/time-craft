// What the child asks for and a parent resolves:
//   start      = "I want to start" (activity + minutes)
//   extra_time = "I want extra time" (reason required, only with no quota left)
// Lifecycle: pending → approved | rejected | expired | cancelled. Expiry is
// lazy: a pending request past expires_at is marked expired when read or
// before the child creates another one.
// An override is the extra time a parent grants once the quota is used up,
// from an extra_time request or directly (request_id null).
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
