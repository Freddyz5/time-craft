// "/": whoever arrives goes to their side, or to /login.
import { useEffect } from "react";
import { LoadingBricks } from "../components/ui";
import { api, call } from "../lib/api";
import { homeFor } from "../lib/guard";

export default function RoleRedirect() {
	useEffect(() => {
		call(api.me.$get())
			.then((household) => window.location.replace(homeFor(household.me.kind)))
			// Signed out, offline or the server failing: /login says which.
			.catch(() => window.location.replace("/login"));
	}, []);
	return (
		<div className="grid min-h-dvh place-items-center">
			<LoadingBricks />
		</div>
	);
}
