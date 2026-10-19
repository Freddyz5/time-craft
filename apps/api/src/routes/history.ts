// What happened in a period (this week by default): sessions, time used per
// activity, requests, overrides and task reports.
import { Hono } from "hono";
import * as z from "zod";
import { type AppDeps, type AppEnv, actorOf } from "../http/context";
import { childParam, instant, validate } from "../http/validation";

const historyQuery = z.object({
	// Both or neither.
	from: instant.optional(),
	to: instant.optional(),
});

export function historyRoutes({ core }: AppDeps) {
	return new Hono<AppEnv>().get(
		"/children/:childId/history",
		validate("param", childParam),
		validate("query", historyQuery),
		async (c) => {
			const history = await core.getChildHistory(actorOf(c), {
				...c.req.valid("param"),
				...c.req.valid("query"),
			});
			return c.json(history, 200);
		},
	);
}
