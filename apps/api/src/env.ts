// Environment variables, validated once at startup: if one is missing or
// malformed, the api fails right away instead of halfway through a flow.
// Error messages name the variables, never their values.
import * as z from "zod";

// An empty value (`NAME=` in .env) counts as missing.
const blankAsMissing = (value: unknown) =>
	typeof value === "string" && value.trim() === "" ? undefined : value;

const required = z.preprocess(blankAsMissing, z.string().trim());
const optional = z.preprocess(blankAsMissing, z.string().trim().optional());
const url = z.preprocess(blankAsMissing, z.url());
const postgresUrl = z.preprocess(
	blankAsMissing,
	z.string().regex(/^postgres(ql)?:\/\//, "must be a postgres:// URL"),
);

export const envSchema = z
	.object({
		// Neon, pooled connection string (runtime).
		DATABASE_URL: postgresUrl,

		BETTER_AUTH_SECRET: z.preprocess(
			blankAsMissing,
			z.string().min(32, "must be at least 32 characters"),
		),
		// Where the web serves /api/auth (same origin as the web).
		BETTER_AUTH_URL: url,

		// Google sign-in, only on dev and production: both or neither.
		GOOGLE_CLIENT_ID: optional,
		GOOGLE_CLIENT_SECRET: optional,

		QSTASH_TOKEN: required,
		QSTASH_CURRENT_SIGNING_KEY: required,
		QSTASH_NEXT_SIGNING_KEY: required,
		// Only to use QStash's local development server.
		QSTASH_URL: z.preprocess(blankAsMissing, z.url().optional()),
		// The api's own public URL, which QStash calls back.
		PUBLIC_API_URL: url,

		VAPID_PUBLIC_KEY: required,
		VAPID_PRIVATE_KEY: required,
		VAPID_SUBJECT: z.preprocess(
			blankAsMissing,
			z
				.string()
				.regex(/^(mailto:|https:\/\/)/, "must be a mailto: or https:// URL"),
		),
	})
	.refine(
		(env) =>
			(env.GOOGLE_CLIENT_ID === undefined) ===
			(env.GOOGLE_CLIENT_SECRET === undefined),
		{
			message: "set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or neither",
			path: ["GOOGLE_CLIENT_SECRET"],
			// Report it together with any other problem.
			when: () => true,
		},
	);

export type Env = z.infer<typeof envSchema>;

export class InvalidEnvError extends Error {
	override readonly name = "InvalidEnvError";
}

export function parseEnv(source: Record<string, string | undefined>): Env {
	const result = envSchema.safeParse(source);
	if (!result.success) {
		const problems = result.error.issues.map((issue) => {
			const name = issue.path.join(".") || "environment";
			return issue.code === "invalid_type" && issue.input === undefined
				? `${name}: missing`
				: `${name}: ${issue.message}`;
		});
		throw new InvalidEnvError(
			`Invalid environment variables (see .env.example):\n  ${problems.join("\n  ")}`,
		);
	}
	return result.data;
}
