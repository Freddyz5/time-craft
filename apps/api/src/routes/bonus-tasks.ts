// The parents' catalog of tasks that earn bonus minutes. The child sees the
// active ones, to report them.
import { Hono } from "hono";
import * as z from "zod";
import { type AppDeps, type AppEnv, actorOf } from "../http/context";
import { id, minutes, validate } from "../http/validation";

const taskParam = z.object({ taskId: id });

const taskBody = z.object({
	name: z.string(),
	description: z.string().nullable().optional(),
	rewardMinutes: minutes,
	// null or omitted: no limit on times per week.
	maxPerWeek: z.int().nullable().optional(),
});

export function bonusTaskRoutes({ core }: AppDeps) {
	return (
		new Hono<AppEnv>()
			.get("/bonus-tasks", async (c) => {
				const tasks = await core.listBonusTasks(actorOf(c));
				return c.json({ tasks }, 200);
			})
			.post("/bonus-tasks", validate("json", taskBody), async (c) => {
				const task = await core.createBonusTask(
					actorOf(c),
					c.req.valid("json"),
				);
				return c.json({ task }, 201);
			})
			// Replaces the editable fields.
			.put(
				"/bonus-tasks/:taskId",
				validate("param", taskParam),
				validate("json", taskBody),
				async (c) => {
					const task = await core.updateBonusTask(actorOf(c), {
						...c.req.valid("param"),
						...c.req.valid("json"),
					});
					return c.json({ task }, 200);
				},
			)
			.post(
				"/bonus-tasks/:taskId/deactivate",
				validate("param", taskParam),
				async (c) => {
					const task = await core.deactivateBonusTask(
						actorOf(c),
						c.req.valid("param"),
					);
					return c.json({ task }, 200);
				},
			)
	);
}
