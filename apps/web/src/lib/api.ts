// The typed client for the api (hc<AppType>) and one way to call it: `call`
// resolves to the success body or throws an ApiError with the api's code.
// The api lives on the same origin under /api (Vite's proxy in development,
// Vercel's rewrite in production), so cookies just work.
import type { AppType } from "@time-craft/api";
import { type ClientResponse, hc } from "hono/client";
import { noteServerTime } from "./clock";

export const api = hc<AppType>("/").api;

export class ApiError extends Error {
	override readonly name = "ApiError";

	constructor(
		readonly status: number,
		readonly code: string,
		message: string,
		readonly details: Record<string, unknown> = {},
	) {
		super(message);
	}
}

// The body of the successful responses of an endpoint (204 has none).
type SuccessBody<R> =
	R extends ClientResponse<infer Body, infer Status, infer _Format>
		? Status extends 204
			? null
			: Status extends 200 | 201
				? Body
				: never
		: never;

interface ErrorPayload {
	error?: {
		code?: string;
		message?: string;
		details?: Record<string, unknown>;
	};
	// Better Auth's own errors.
	code?: string;
	message?: string;
}

async function readError(response: Response): Promise<ApiError> {
	let payload: ErrorPayload = {};
	try {
		payload = (await response.json()) as ErrorPayload;
	} catch {
		// Not JSON (a proxy error page, for example).
	}
	const code = payload.error?.code ?? payload.code ?? `http_${response.status}`;
	const message =
		payload.error?.message ?? payload.message ?? response.statusText;
	return new ApiError(response.status, code, message, payload.error?.details);
}

export async function call<R extends ClientResponse<unknown, number, string>>(
	request: Promise<R>,
): Promise<SuccessBody<R>> {
	const sentAt = Date.now();
	let response: R;
	try {
		response = await request;
	} catch {
		throw new ApiError(0, "network_error", "No connection to the server");
	}
	const receivedAt = Date.now();
	if (!response.ok) {
		throw await readError(response as unknown as Response);
	}
	if (response.status === 204) {
		return null as SuccessBody<R>;
	}
	const body: unknown = await response.json();
	// Timer responses carry the server's clock: keep the offset fresh.
	if (
		typeof body === "object" &&
		body !== null &&
		"serverTime" in body &&
		typeof body.serverTime === "string"
	) {
		noteServerTime(body.serverTime, sentAt, receivedAt);
	}
	return body as SuccessBody<R>;
}
