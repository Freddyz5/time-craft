// The family's activities: the parents add them, rename and recolour them,
// and deactivate or activate them again. Everyone reads them in /api/me.
import { Hono } from "hono";
import * as z from "zod";
import { type AppDeps, type AppEnv, actorOf } from "../http/context";
import { id, minutes, validate } from "../http/validation";

const activityParam = z.object({ activityId: id });

// Core checks the name's length and that colour and icon are in its lists.
const look = {
	color: z.string().max(20),
	icon: z.string().max(30),
};

const createBody = z.object({
	name: z.string(),
	...look,
	// A quota of its own for a child, in the same step.
	quota: z
		.object({
			childId: id,
			dailyLimitMinutes: minutes,
			weeklyLimitMinutes: minutes,
			weeklyBonusCapMinutes: minutes.optional(),
			carryOverExcess: z.boolean().optional(),
			warningMinutes: minutes.optional(),
			allowedDays: z.array(z.int()).max(7).optional(),
			graceMinutes: minutes.optional(),
		})
		.optional(),
});

const updateBody = z.object({
	name: z.string().optional(),
	color: look.color.optional(),
	icon: look.icon.optional(),
});

export function activityRoutes({ core }: AppDeps) {
	return new Hono<AppEnv>()
		.post("/activities", validate("json", createBody), async (c) => {
			const activity = await core.createActivity(
				actorOf(c),
				c.req.valid("json"),
			);
			return c.json({ activity }, 201);
		})
		.patch(
			"/activities/:activityId",
			validate("param", activityParam),
			validate("json", updateBody),
			async (c) => {
				const activity = await core.updateActivity(actorOf(c), {
					...c.req.valid("param"),
					...c.req.valid("json"),
				});
				return c.json({ activity }, 200);
			},
		)
		.post(
			"/activities/:activityId/deactivate",
			validate("param", activityParam),
			async (c) => {
				const activity = await core.deactivateActivity(
					actorOf(c),
					c.req.valid("param"),
				);
				return c.json({ activity }, 200);
			},
		)
		.post(
			"/activities/:activityId/activate",
			validate("param", activityParam),
			async (c) => {
				const activity = await core.activateActivity(
					actorOf(c),
					c.req.valid("param"),
				);
				return c.json({ activity }, 200);
			},
		);
}
