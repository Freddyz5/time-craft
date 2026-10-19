// Domain errors. `code` is part of the public contract: the api maps it to an
// HTTP status (Phase 4) and the web picks the message to show for it, so a code
// never changes meaning once released. `kind` groups the codes by how a client
// should react.
export type ErrorKind =
	| "validation" // the input is malformed (400)
	| "unauthorized" // a secret did not match (401)
	| "forbidden" // the actor may not do this (403)
	| "not_found" // missing, or outside the actor's family (404)
	| "conflict" // the state changed or does not allow it now (409)
	| "rule"; // a business rule says no (422)

export const errorKinds = {
	invalid_input: "validation",
	invalid_start_time: "validation",
	exceeds_requested: "validation",

	invalid_recovery_code: "unauthorized",

	forbidden: "forbidden",
	cannot_reset_own_password: "forbidden",

	family_not_found: "not_found",
	parent_not_found: "not_found",
	child_not_found: "not_found",
	activity_not_found: "not_found",
	request_not_found: "not_found",
	session_not_found: "not_found",
	bonus_task_not_found: "not_found",
	task_report_not_found: "not_found",

	request_already_pending: "conflict",
	request_already_resolved: "conflict",
	request_expired: "conflict",
	report_already_pending: "conflict",
	report_already_reviewed: "conflict",
	session_already_open: "conflict",
	invalid_session_transition: "conflict",
	concurrent_update: "conflict",
	username_taken: "conflict",

	no_active_policy: "rule",
	activity_inactive: "rule",
	bonus_task_inactive: "rule",
	quota_exhausted: "rule",
	quota_not_exhausted: "rule",
	exceeds_available: "rule",
	weekly_task_limit_reached: "rule",
} as const satisfies Record<string, ErrorKind>;

export type ErrorCode = keyof typeof errorKinds;

export type ErrorDetails = Readonly<Record<string, unknown>>;

export class DomainError<C extends ErrorCode = ErrorCode> extends Error {
	override readonly name = "DomainError";
	readonly code: C;
	readonly kind: ErrorKind;
	readonly details: ErrorDetails | undefined;

	constructor(code: C, message: string, details?: ErrorDetails) {
		super(message);
		this.code = code;
		this.kind = errorKinds[code];
		this.details = details;
	}
}

export function isDomainError(error: unknown): error is DomainError {
	return error instanceof DomainError;
}

export function invalidInput(field: string, reason: string): DomainError {
	return new DomainError("invalid_input", `${field}: ${reason}`, {
		field,
		reason,
	});
}

export function forbidden(action: string): DomainError {
	return new DomainError("forbidden", `Not allowed to ${action}`, { action });
}
