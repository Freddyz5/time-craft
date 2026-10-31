// The Hono app: Better Auth at /api/auth/*, the REST routes under /api (all
// of them need a parent or the child signed in, except the recovery code),
// and the QStash callback at /internal/jobs.
// AppType is what the web's typed client uses: hc<AppType>("/").
import { Hono } from "hono";
// The release writes the api's version here (scripts/release).
import pkg from "../package.json" with { type: "json" };
import { type AppDeps, type AppEnv, resolveActor } from "./http/context";
import { notFound, onError } from "./http/errors";
import { accountRoutes, recoveryRoutes } from "./routes/accounts";
import { balanceRoutes } from "./routes/balance";
import { bonusTaskRoutes } from "./routes/bonus-tasks";
import { historyRoutes } from "./routes/history";
import { jobRoutes } from "./routes/jobs";
import { nativePushTokenRoutes } from "./routes/native-push-tokens";
import { overrideRoutes } from "./routes/overrides";
import { policyRoutes } from "./routes/policies";
import { pushSubscriptionRoutes } from "./routes/push-subscriptions";
import { requestRoutes } from "./routes/requests";
import { sessionRoutes } from "./routes/sessions";
import { taskReportRoutes } from "./routes/task-reports";

// Under /api, these answer without a session of ours.
const PUBLIC_PATHS = ["/api/auth/", "/api/recovery-code/use"];

function isPublic(path: string): boolean {
	return PUBLIC_PATHS.some((prefix) => path.startsWith(prefix));
}

export function createApp(deps: AppDeps) {
	const app = new Hono<AppEnv>();
	app.onError(onError);
	app.notFound(notFound);

	app.get("/health", (c) =>
		c.json({ ok: true, app: { name: "Time Craft", version: pkg.version } }),
	);
	app.on(["GET", "POST"], "/api/auth/*", (c) => deps.auth.handler(c.req.raw));
	app.use("/api/*", async (c, next) => {
		if (!isPublic(c.req.path)) {
			await resolveActor(deps, c);
		}
		await next();
	});

	return app
		.route("/api", accountRoutes(deps))
		.route("/api", recoveryRoutes(deps))
		.route("/api", balanceRoutes(deps))
		.route("/api", sessionRoutes(deps))
		.route("/api", historyRoutes(deps))
		.route("/api", requestRoutes(deps))
		.route("/api", overrideRoutes(deps))
		.route("/api", policyRoutes(deps))
		.route("/api", bonusTaskRoutes(deps))
		.route("/api", taskReportRoutes(deps))
		.route("/api", pushSubscriptionRoutes(deps))
		.route("/api", nativePushTokenRoutes(deps))
		.route("/", jobRoutes(deps));
}

export type AppType = ReturnType<typeof createApp>;
