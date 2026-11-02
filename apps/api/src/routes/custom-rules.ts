// Rules the parents write, for the child or only for themselves. The child
// reads the ones for them; only parents write.
import { Hono } from "hono";
import * as z from "zod";
import { type AppDeps, type AppEnv, actorOf } from "../http/context";
import { childParam, id, validate } from "../http/validation";

const ruleParam = z.object({ ruleId: id });

const addBody = z.object({
	text: z.string(),
	// Omitted: false, the child reads it.
	parentsOnly: z.boolean().optional(),
});

const updateBody = z.object({
	text: z.string().optional(),
	parentsOnly: z.boolean().optional(),
});

const orderBody = z.object({ ruleIds: z.array(id).min(1) });

export function customRuleRoutes({ core }: AppDeps) {
	return (
		new Hono<AppEnv>()
			// In order. The child gets only those written for them.
			.get(
				"/children/:childId/custom-rules",
				validate("param", childParam),
				async (c) => {
					const rules = await core.listCustomRules(
						actorOf(c),
						c.req.valid("param"),
					);
					return c.json({ rules }, 200);
				},
			)
			.post(
				"/children/:childId/custom-rules",
				validate("param", childParam),
				validate("json", addBody),
				async (c) => {
					const rule = await core.addCustomRule(actorOf(c), {
						...c.req.valid("param"),
						...c.req.valid("json"),
					});
					return c.json({ rule }, 201);
				},
			)
			// Every rule of one list, in the new order.
			.put(
				"/children/:childId/custom-rules/order",
				validate("param", childParam),
				validate("json", orderBody),
				async (c) => {
					const rules = await core.reorderCustomRules(actorOf(c), {
						...c.req.valid("param"),
						...c.req.valid("json"),
					});
					return c.json({ rules }, 200);
				},
			)
			.patch(
				"/custom-rules/:ruleId",
				validate("param", ruleParam),
				validate("json", updateBody),
				async (c) => {
					const rule = await core.updateCustomRule(actorOf(c), {
						...c.req.valid("param"),
						...c.req.valid("json"),
					});
					return c.json({ rule }, 200);
				},
			)
			.delete(
				"/custom-rules/:ruleId",
				validate("param", ruleParam),
				async (c) => {
					const rule = await core.deleteCustomRule(
						actorOf(c),
						c.req.valid("param"),
					);
					return c.json({ rule }, 200);
				},
			)
	);
}
