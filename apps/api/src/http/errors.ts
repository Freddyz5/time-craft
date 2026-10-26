// One error format for every route:
//   { "error": { "code": "quota_exhausted", "message": "...", "details": {...} } }
// Domain errors keep their code (core's public contract) and get the status
// of their kind; the web picks the text to show from the code.
import { type ErrorKind, isDomainError } from "@time-craft/core";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { isUniqueViolation } from "../adapters/postgres";

export interface ErrorBody {
	error: {
		code: string;
		message: string;
		details?: Record<string, unknown>;
	};
}

export const statusByKind = {
	validation: 400,
	unauthorized: 401,
	forbidden: 403,
	not_found: 404,
	conflict: 409,
	rule: 422,
} as const satisfies Record<ErrorKind, ContentfulStatusCode>;

// Errors of the HTTP layer itself (no session, bad signature, bad request).
export class HttpError extends Error {
	override readonly name = "HttpError";

	constructor(
		readonly status: ContentfulStatusCode,
		readonly code: string,
		message: string,
		readonly details?: Record<string, unknown>,
		readonly headers?: Record<string, string>,
	) {
		super(message);
	}
}

export function errorBody(
	code: string,
	message: string,
	details?: Readonly<Record<string, unknown>>,
): ErrorBody {
	return {
		error: { code, message, ...(details === undefined ? {} : { details }) },
	};
}

export function onError(error: Error, c: Context): Response {
	if (error instanceof HttpError) {
		if (error.headers !== undefined) {
			for (const [name, value] of Object.entries(error.headers)) {
				c.header(name, value);
			}
		}
		return c.json(
			errorBody(error.code, error.message, error.details),
			error.status,
		);
	}
	if (isDomainError(error)) {
		return c.json(
			errorBody(error.code, error.message, error.details),
			statusByKind[error.kind],
		);
	}
	if (error instanceof HTTPException && error.status < 500) {
		// e.g. a body that is not JSON.
		return c.json(
			errorBody("invalid_request", error.message),
			error.status as ContentfulStatusCode,
		);
	}
	if (isUniqueViolation(error)) {
		// Core checks first, so this is another request winning a race (two
		// parents starting a session at once).
		return c.json(
			errorBody("concurrent_update", "Something changed in the meantime"),
			409,
		);
	}
	console.error("Unexpected error", error);
	return c.json(errorBody("internal_error", "Something went wrong"), 500);
}

export function notFound(c: Context): Response {
	return c.json(errorBody("route_not_found", "No such route"), 404);
}
