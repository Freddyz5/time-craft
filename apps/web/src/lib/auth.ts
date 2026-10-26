// Better Auth's client: sign-in (Google, email + password, and the child's
// username + PIN), sign-out and changing one's own password. Whether someone
// is a parent or the child comes from /api/me, not from here.
import { usernameClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
	// Same origin: /api/auth on whatever host serves the web.
	basePath: "/api/auth",
	plugins: [usernameClient()],
});
