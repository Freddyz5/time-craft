// /nino until Phase 5b builds the child's island. The guard already works:
// parents are sent to /padres and anyone signed out to /login.

import { AppProviders } from "../components/providers";
import { Button, LoadingBricks } from "../components/ui";
import { useRoleGuard } from "../lib/guard";
import { signOut } from "../lib/session";
import { StandaloneFrame } from "../parents/Shell";

function ChildRoot() {
	const guard = useRoleGuard("child");
	if (guard.status !== "ready") {
		return (
			<StandaloneFrame>
				<LoadingBricks />
			</StandaloneFrame>
		);
	}
	return (
		<StandaloneFrame>
			<h1 className="text-2xl font-bold">Hola, {guard.household.me.name}</h1>
			<p className="text-ink-soft">
				Muy pronto vas a ver aquí tus ladrillos de tiempo y pedir tus sesiones.
			</p>
			<Button variant="secondary" onClick={() => void signOut()}>
				Salir
			</Button>
		</StandaloneFrame>
	);
}

export default function ChildPlaceholder() {
	return (
		<AppProviders>
			<ChildRoot />
		</AppProviders>
	);
}
