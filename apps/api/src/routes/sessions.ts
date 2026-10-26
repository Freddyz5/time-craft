// The timer. Parents start, pause, resume and stop sessions; everyone in the
// family watches the live one. Every response carries serverTime, so a client
// computes the remaining time with its offset from the server's clock.
import { Hono } from "hono";
import * as z from "zod";
import { type AppDeps, type AppEnv, actorOf } from "../http/context";
import { childParam, id, instant, minutes, validate } from "../http/validation";

const sessionParam = z.object({ sessionId: id });

const startSessionBody = z.object({
	childId: id,
	activityId: id,
	minutes,
	// Omitted: start now. Otherwise later today.
	startAt: instant.optional(),
});

const pauseBody = z.object({ reason: z.string().optional() });

export function sessionRoutes({ core, clock }: AppDeps) {
	const withServerTime = <T extends object>(body: T) => ({
		serverTime: clock.now(),
		...body,
	});

	return new Hono<AppEnv>()
		.get(
			"/children/:childId/live-session",
			validate("param", childParam),
			async (c) => {
				const view = await core.getLiveSession(
					actorOf(c),
					c.req.valid("param"),
				);
				return c.json(view, 200);
			},
		)
		.post("/sessions", validate("json", startSessionBody), async (c) => {
			const session = await core.startDirectSession(
				actorOf(c),
				c.req.valid("json"),
			);
			return c.json(withServerTime({ session }), 201);
		})
		.post(
			"/sessions/:sessionId/start",
			validate("param", sessionParam),
			async (c) => {
				const session = await core.advanceScheduledSession(
					actorOf(c),
					c.req.valid("param"),
				);
				return c.json(withServerTime({ session }), 200);
			},
		)
		.post(
			"/sessions/:sessionId/cancel",
			validate("param", sessionParam),
			async (c) => {
				const session = await core.cancelScheduledSession(
					actorOf(c),
					c.req.valid("param"),
				);
				return c.json(withServerTime({ session }), 200);
			},
		)
		.post(
			"/sessions/:sessionId/pause",
			validate("param", sessionParam),
			validate("json", pauseBody),
			async (c) => {
				const session = await core.pauseSession(actorOf(c), {
					...c.req.valid("param"),
					...c.req.valid("json"),
				});
				return c.json(withServerTime({ session }), 200);
			},
		)
		.post(
			"/sessions/:sessionId/resume",
			validate("param", sessionParam),
			async (c) => {
				const session = await core.resumeSession(
					actorOf(c),
					c.req.valid("param"),
				);
				return c.json(withServerTime({ session }), 200);
			},
		)
		.post(
			"/sessions/:sessionId/stop",
			validate("param", sessionParam),
			async (c) => {
				const session = await core.stopSession(
					actorOf(c),
					c.req.valid("param"),
				);
				return c.json(withServerTime({ session }), 200);
			},
		);
}
