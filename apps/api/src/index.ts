// Composition root for Vercel (and `bun run dev`): reads the environment,
// fails right away if something is missing, and wires the real adapters.
// Vercel's zero-config format: `export default app`.
import { createDb } from "@time-craft/db";
import { QStashJobScheduler, QStashSignatureVerifier } from "./adapters/qstash";
import { systemClock } from "./adapters/system";
import { WebPushNotifier } from "./adapters/web-push";
import { createContainer } from "./container";
import { parseEnv } from "./env";

const env = parseEnv(process.env);
const db = createDb(env.DATABASE_URL);

const qstash = {
	token: env.QSTASH_TOKEN,
	currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
	nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY,
	publicApiUrl: env.PUBLIC_API_URL,
	baseUrl: env.QSTASH_URL,
};

const { app } = createContainer({
	db,
	auth: {
		baseURL: env.BETTER_AUTH_URL,
		trustedOrigins: env.BETTER_AUTH_TRUSTED_ORIGINS,
		secret: env.BETTER_AUTH_SECRET,
		google:
			env.GOOGLE_CLIENT_ID !== undefined &&
			env.GOOGLE_CLIENT_SECRET !== undefined
				? {
						clientId: env.GOOGLE_CLIENT_ID,
						clientSecret: env.GOOGLE_CLIENT_SECRET,
					}
				: undefined,
	},
	clock: systemClock,
	jobs: new QStashJobScheduler(qstash),
	notifier: new WebPushNotifier(db, {
		subject: env.VAPID_SUBJECT,
		publicKey: env.VAPID_PUBLIC_KEY,
		privateKey: env.VAPID_PRIVATE_KEY,
	}),
	jobSignatures: new QStashSignatureVerifier(qstash),
});

export default app;
export type { AppType } from "./app";
