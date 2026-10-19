// The child's daily and weekly limits. Changing them creates a new policy
// (the old one is closed, so the history stays); it applies to the whole
// current week.
import { Hono } from "hono";
import * as z from "zod";
import { type AppDeps, type AppEnv, actorOf } from "../http/context";
import { childParam, id, minutes, validate } from "../http/validation";

const setPolicyBody = z.object({
	// Omitted or null: the global quota (all activities share it).
	activityId: id.nullable().optional(),
	dailyLimitMinutes: minutes,
	weeklyLimitMinutes: minutes,
	// Omitted: keep the current value (or the default).
	weeklyBonusCapMinutes: minutes.optional(),
	carryOverExcess: z.boolean().optional(),
	warningMinutes: minutes.optional(),
});

export function policyRoutes({ core }: AppDeps) {
	return new Hono<AppEnv>()
		.get(
			"/children/:childId/policies",
			validate("param", childParam),
			async (c) => {
				const policies = await core.listCurrentPolicies(
					actorOf(c),
					c.req.valid("param"),
				);
				return c.json({ policies }, 200);
			},
		)
		.post(
			"/children/:childId/policies",
			validate("param", childParam),
			validate("json", setPolicyBody),
			async (c) => {
				const policy = await core.setPolicy(actorOf(c), {
					...c.req.valid("param"),
					...c.req.valid("json"),
				});
				return c.json({ policy }, 201);
			},
		);
}
