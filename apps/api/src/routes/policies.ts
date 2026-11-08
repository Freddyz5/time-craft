// The child's daily and weekly limits, the days they can be used and the
// grace after the end. Changing them creates a new policy (the old one is
// closed, so the history stays); it applies to the whole current week. The
// general quota is shared by two or more activities; the others have their
// own.
import { Hono } from "hono";
import * as z from "zod";
import { type AppDeps, type AppEnv, actorOf } from "../http/context";
import { childParam, id, minutes, validate } from "../http/validation";

const limits = z.object({
	dailyLimitMinutes: minutes,
	weeklyLimitMinutes: minutes,
	// Omitted: keep the current value (or the default).
	weeklyBonusCapMinutes: minutes.optional(),
	carryOverExcess: z.boolean().optional(),
	warningMinutes: minutes.optional(),
	// 0 = Sunday ... 6 = Saturday.
	allowedDays: z.array(z.int()).max(7).optional(),
	graceMinutes: minutes.optional(),
});

const setPolicyBody = limits.extend({
	// Omitted or null: the general quota (the activities without their own
	// share it).
	activityId: id.nullable().optional(),
});

const quotaLayoutBody = z.object({
	// The general quota, shared by every active activity not in `own`; null
	// when there is none.
	general: limits.nullable(),
	// The activities with a quota of their own.
	own: z.array(limits.extend({ activityId: id })).max(50),
});

export function policyRoutes({ core }: AppDeps) {
	return (
		new Hono<AppEnv>()
			.get(
				"/children/:childId/policies",
				validate("param", childParam),
				async (c) => {
					const { policies, totals } = await core.listQuotas(
						actorOf(c),
						c.req.valid("param"),
					);
					return c.json({ policies, totals }, 200);
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
			// How the time is split, in one step: the general quota and the
			// activities with their own. Returns the current policies.
			.post(
				"/children/:childId/quota-layout",
				validate("param", childParam),
				validate("json", quotaLayoutBody),
				async (c) => {
					const policies = await core.setQuotaLayout(actorOf(c), {
						...c.req.valid("param"),
						...c.req.valid("json"),
					});
					return c.json({ policies }, 200);
				},
			)
			// The activity goes back to the general quota; its policy stays in
			// the history. policy is null if it had none.
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
