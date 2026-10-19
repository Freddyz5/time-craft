// QStash calls back here when a job comes due (start, warning, end,
// auto_close). Only signed requests get in. core makes it idempotent: a
// repeated or stale delivery is answered 200 and ignored, so QStash stops
// retrying; any other failure answers 5xx and QStash retries.
import { Hono } from "hono";
import * as z from "zod";
import { JOBS_PATH } from "../adapters/qstash";
import type { AppDeps, AppEnv } from "../http/context";
import { HttpError } from "../http/errors";
import { id } from "../http/validation";

const jobMessage = z.object({ alertId: id });

function parseJob(body: string) {
	try {
		const result = jobMessage.safeParse(JSON.parse(body));
		if (result.success) {
			return result.data;
		}
	} catch {
		// Not JSON: same answer as a wrong shape.
	}
	throw new HttpError(400, "invalid_input", "Not a job message");
}

export function jobRoutes({ core, jobSignatures }: AppDeps) {
	return new Hono<AppEnv>().post(JOBS_PATH, async (c) => {
		const signature = c.req.header("upstash-signature");
		// The signature covers the raw body, so read it as text.
		const body = await c.req.text();
		if (
			signature === undefined ||
			!(await jobSignatures.verify({ signature, body }))
		) {
			throw new HttpError(401, "invalid_signature", "Invalid signature");
		}
		const outcome = await core.handleJob(parseJob(body));
		return c.json({ outcome }, 200);
	});
}
