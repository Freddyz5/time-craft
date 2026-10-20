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
	return (
		new Hono<AppEnv>()
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
			// Current and closed policies, newest first.
			.get(
				"/children/:childId/policies/history",
				validate("param", childParam),
				async (c) => {
					const policies = await core.listPolicyHistory(
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
			)
			// The activity goes back to the global quota; its policy stays in the
			// history. policy is null if it had none.
			.delete(
				"/children/:childId/policies/:activityId",
				validate("param", childParam.extend({ activityId: id })),
				async (c) => {
					const policy = await core.clearActivityPolicy(
						actorOf(c),
						c.req.valid("param"),
					);
					return c.json({ policy }, 200);
				},
			)
	);
}
