// The parents' island at /padres: session guard, then the shell and its own
// routes (wouter, under the /padres base). Astro prerenders one HTML file per
// route, so a reload or a link from a push lands on the right screen.
import { useState } from "react";
import { Link, Route, Router, Switch } from "wouter";
import { AppProviders } from "../components/providers";
import { StandaloneFrame } from "../components/StandaloneFrame";
import { Button, buttonClass, LoadingBricks } from "../components/ui";
import { errorMessage } from "../lib/errors";
import { useRoleGuard } from "../lib/guard";
import { dropTrailingSlash } from "../lib/routing";
import { signOut } from "../lib/session";
import { Accounts } from "./Accounts";
import { BonusTasks } from "./BonusTasks";
import { ParentsProvider } from "./context";
import { History } from "./History";
import { Home } from "./Home";
import { NewSession } from "./NewSession";
import { Rules } from "./Rules";
import { Shell } from "./Shell";

function NotFound() {
	return (
		<div className="mx-auto flex max-w-md flex-col items-start gap-4 py-10">
			<h1 className="text-2xl font-bold">Esta página no existe</h1>
			<p className="text-ink-soft">Puede que el enlace esté incompleto.</p>
			<Link href="/" className={buttonClass("primary")}>
				Ir al inicio
			</Link>
		</div>
	);
}

function ParentsRoot() {
	const guard = useRoleGuard("parent");

	if (guard.status === "loading" || guard.status === "redirecting") {
		return (
			<StandaloneFrame>
				<LoadingBricks />
			</StandaloneFrame>
		);
	}
	if (guard.status === "no_role") {
		return (
			<StandaloneFrame>
				<h1 className="text-xl font-semibold">Esta cuenta no es de un padre</h1>
				<p className="text-ink-soft">
					Entraste con una cuenta que no pertenece a ninguna familia de Time
					Craft.
				</p>
				<Button variant="primary" onClick={() => void signOut()}>
					Entrar con otra cuenta
				</Button>
			</StandaloneFrame>
		);
	}
	if (guard.status === "error") {
		return (
			<StandaloneFrame>
				<h1 className="text-xl font-semibold">No pudimos abrir la app</h1>
				<p className="text-ink-soft">{errorMessage(guard.error)}</p>
				<Button variant="primary" onClick={guard.retry}>
					Reintentar
				</Button>
			</StandaloneFrame>
		);
	}

	return (
		<ParentsProvider household={guard.household}>
			<Shell>
				<Switch>
					<Route path="/" component={Home} />
					<Route path="/sesion" component={NewSession} />
					<Route path="/historial" component={History} />
					<Route path="/reglas" component={Rules} />
					<Route path="/bonos" component={BonusTasks} />
					<Route path="/cuentas" component={Accounts} />
					<Route component={NotFound} />
				</Switch>
			</Shell>
		</ParentsProvider>
	);
}

export default function ParentsApp() {
	useState(() => dropTrailingSlash("/padres"));

	return (
		<AppProviders>
			<Router base="/padres">
				<ParentsRoot />
			</Router>
		</AppProviders>
	);
}
