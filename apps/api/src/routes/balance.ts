// What the child has left: today, this week, bonuses and when it recharges.
import { Hono } from "hono";
import { type AppDeps, type AppEnv, actorOf } from "../http/context";
import { childParam, validate } from "../http/validation";

export function balanceRoutes({ core }: AppDeps) {
	return new Hono<AppEnv>().get(
		"/children/:childId/balance",
		validate("param", childParam),
		async (c) => {
			const view = await core.getChildBalance(actorOf(c), c.req.valid("param"));
			return c.json(view, 200);
		},
	);
}
