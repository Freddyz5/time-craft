// /nino until Phase 5b builds the child's island. The guard already works:
// parents are sent to /padres and anyone signed out to /login.

import { AppProviders } from "../components/providers";
import { StandaloneFrame } from "../components/StandaloneFrame";
import { Button, LoadingBricks } from "../components/ui";
import { useRoleGuard } from "../lib/guard";
import { signOut } from "../lib/session";

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
			<Button variant="secondary" onClick={() => void signOut("/nino/entrar")}>
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
