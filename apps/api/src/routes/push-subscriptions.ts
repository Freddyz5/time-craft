// This browser's Web Push subscription, for whoever is signed in. The body is
// what PushSubscription.toJSON() returns in the browser, plus a label.
import { Hono } from "hono";
import * as z from "zod";
import { type AppDeps, type AppEnv, actorOf } from "../http/context";
import { validate } from "../http/validation";

const subscribeBody = z.object({
	endpoint: z.string(),
	keys: z.object({ p256dh: z.string(), auth: z.string() }),
	deviceLabel: z.string().optional(),
});

const unsubscribeBody = z.object({ endpoint: z.string() });

export function pushSubscriptionRoutes({ core }: AppDeps) {
	return new Hono<AppEnv>()
		.post("/push-subscriptions", validate("json", subscribeBody), async (c) => {
			const { endpoint, keys, deviceLabel } = c.req.valid("json");
			const subscription = await core.registerSubscription(actorOf(c), {
				endpoint,
				p256dhKey: keys.p256dh,
				authKey: keys.auth,
				deviceLabel,
			});
			return c.json(
				{
					subscription: {
						id: subscription.id,
						deviceLabel: subscription.deviceLabel,
						createdAt: subscription.createdAt,
					},
				},
				201,
			);
		})
		.delete(
			"/push-subscriptions",
			validate("json", unsubscribeBody),
			async (c) => {
				await core.removeSubscription(actorOf(c), c.req.valid("json"));
				return c.body(null, 204);
			},
		);
}
