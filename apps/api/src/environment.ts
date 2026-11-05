// Which deployment this is: production, dev (Vercel's Preview of the dev
// branch), another Preview deployment, or a machine (local, tests). /health
// says it, so a web can check that its /api reaches the api of its own
// environment. The web works its own out the same way (apps/web/astro.config.ts).
export type Environment = "production" | "dev" | "preview" | "local";

// Vercel's system variables; both are missing outside Vercel.
export interface VercelVariables {
	VERCEL_ENV?: string | undefined;
	VERCEL_GIT_COMMIT_REF?: string | undefined;
}

export function environmentOf(vars: VercelVariables): Environment {
	if (vars.VERCEL_ENV === "production") {
		return "production";
	}
	if (vars.VERCEL_ENV === "preview") {
		return vars.VERCEL_GIT_COMMIT_REF === "dev" ? "dev" : "preview";
	}
	return "local";
}
