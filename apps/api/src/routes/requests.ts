// The child asks (to start, or for extra time once the quota is used up);
// a parent approves, possibly fewer minutes and to start later today, or
// rejects. The child may withdraw a pending request.
import { Hono } from "hono";
import * as z from "zod";
import { type AppDeps, type AppEnv, actorOf } from "../http/context";
import { id, instant, minutes, validate } from "../http/validation";

const requestParam = z.object({ requestId: id });

const createRequestBody = z.object({
	requestType: z.enum(["start", "extra_time"]),
	activityId: id,
	requestedMinutes: minutes,
	// Required for extra_time.
	reason: z.string().optional(),
});

const approveBody = z.object({
	approvedMinutes: minutes,
	// Omitted: start now. Otherwise later today.
	startAt: instant.optional(),
	note: z.string().optional(),
});

const rejectBody = z.object({ note: z.string().optional() });

export function requestRoutes({ core, clock }: AppDeps) {
	return new Hono<AppEnv>()
		.get("/requests", async (c) => {
			const requests = await core.listPendingRequests(actorOf(c));
			return c.json({ requests }, 200);
		})
		.post("/requests", validate("json", createRequestBody), async (c) => {
			const request = await core.createRequest(actorOf(c), c.req.valid("json"));
			return c.json({ request }, 201);
		})
		.post(
			"/requests/:requestId/cancel",
			validate("param", requestParam),
			async (c) => {
				const request = await core.cancelRequest(
					actorOf(c),
					c.req.valid("param"),
				);
				return c.json({ request }, 200);
			},
		)
		.post(
			"/requests/:requestId/approve",
			validate("param", requestParam),
			validate("json", approveBody),
			async (c) => {
				const result = await core.approveRequest(actorOf(c), {
					...c.req.valid("param"),
					...c.req.valid("json"),
				});
				// It creates a session: timer responses carry serverTime.
				return c.json({ serverTime: clock.now(), ...result }, 200);
			},
		)
		.post(
			"/requests/:requestId/reject",
			validate("param", requestParam),
			validate("json", rejectBody),
			async (c) => {
				const request = await core.rejectRequest(actorOf(c), {
					...c.req.valid("param"),
					...c.req.valid("json"),
				});
				return c.json({ request }, 200);
			},
		);
}
