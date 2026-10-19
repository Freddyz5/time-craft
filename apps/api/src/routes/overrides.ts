// Extra time a parent grants directly once the quota is used up, always
// with a reason. It starts a new session (now or later today).
import { Hono } from "hono";
import * as z from "zod";
import { type AppDeps, type AppEnv, actorOf } from "../http/context";
import { id, instant, minutes, validate } from "../http/validation";

const grantOverrideBody = z.object({
	childId: id,
	activityId: id,
	extraMinutes: minutes,
	reason: z.string(),
	// Omitted: start now. Otherwise later today.
	startAt: instant.optional(),
});

export function overrideRoutes({ core, clock }: AppDeps) {
	return new Hono<AppEnv>().post(
		"/overrides",
		validate("json", grantOverrideBody),
		async (c) => {
			const result = await core.grantOverride(actorOf(c), c.req.valid("json"));
			return c.json({ serverTime: clock.now(), ...result }, 201);
		},
	);
}
