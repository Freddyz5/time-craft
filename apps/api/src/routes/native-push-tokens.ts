// The Android app's push token (Firebase Cloud Messaging), for whoever is
// signed in. The app registers it after sign-in and removes it on sign-out.
import { Hono } from "hono";
import * as z from "zod";
import { type AppDeps, type AppEnv, actorOf } from "../http/context";
import { validate } from "../http/validation";

const registerBody = z.object({
	token: z.string(),
	platform: z.literal("android"),
	deviceLabel: z.string().optional(),
});

const removeBody = z.object({ token: z.string() });

export function nativePushTokenRoutes({ core }: AppDeps) {
	return new Hono<AppEnv>()
		.post("/native-push-tokens", validate("json", registerBody), async (c) => {
			const saved = await core.registerNativeToken(
				actorOf(c),
				c.req.valid("json"),
			);
			return c.json(
				{
					token: {
						id: saved.id,
						deviceLabel: saved.deviceLabel,
						createdAt: saved.createdAt,
					},
				},
				201,
			);
		})
		.delete("/native-push-tokens", validate("json", removeBody), async (c) => {
			await core.removeNativeToken(actorOf(c), c.req.valid("json"));
			return c.body(null, 204);
		});
}
