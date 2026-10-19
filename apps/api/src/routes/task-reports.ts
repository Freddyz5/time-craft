// The child reports a task done; a parent approves it (with the minutes
// earned, the task's reward by default) or rejects it.
import { Hono } from "hono";
import * as z from "zod";
import { type AppDeps, type AppEnv, actorOf } from "../http/context";
import { id, minutes, validate } from "../http/validation";

const reportParam = z.object({ reportId: id });

const reportBody = z.object({
	bonusTaskId: id,
	note: z.string().optional(),
});

const reviewBody = z.discriminatedUnion("decision", [
	z.object({
		decision: z.literal("approve"),
		awardedMinutes: minutes.optional(),
		note: z.string().optional(),
	}),
	z.object({
		decision: z.literal("reject"),
		note: z.string().optional(),
	}),
]);

export function taskReportRoutes({ core }: AppDeps) {
	return new Hono<AppEnv>()
		.get("/task-reports", async (c) => {
			const reports = await core.listPendingTaskReports(actorOf(c));
			return c.json({ reports }, 200);
		})
		.post("/task-reports", validate("json", reportBody), async (c) => {
			const report = await core.reportTask(actorOf(c), c.req.valid("json"));
			return c.json({ report }, 201);
		})
		.post(
			"/task-reports/:reportId/review",
			validate("param", reportParam),
			validate("json", reviewBody),
			async (c) => {
				const report = await core.reviewTask(actorOf(c), {
					...c.req.valid("param"),
					...c.req.valid("json"),
				});
				return c.json({ report }, 200);
			},
		);
}
