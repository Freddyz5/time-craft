// The child's island at /nino: session guard, then the shell and its own
// routes (wouter, under the /nino base). Astro prerenders one HTML file per
// route, so a reload or a link from a push lands on the right screen.
import { useState } from "react";
import { Link, Route, Router, Switch } from "wouter";
import { AppProviders } from "../components/providers";
import { StandaloneFrame } from "../components/StandaloneFrame";
import { Button, buttonClass, LoadingBricks } from "../components/ui";
import { useRoleGuard } from "../lib/guard";
import { dropTrailingSlash } from "../lib/routing";
import { signOut } from "../lib/session";
import { Ask } from "./Ask";
import { ChildProvider } from "./context";
import { childErrorMessage } from "./errors";
import { Home } from "./Home";
import { Notifications } from "./Notifications";
import { Shell } from "./Shell";
import { Tasks } from "./Tasks";

function NotFound() {
	return (
		<div className="mx-auto flex max-w-md flex-col items-start gap-4 py-10">
			<h1 className="text-[1.75rem] leading-tight font-extrabold">
				Esta página no existe
			</h1>
			<p className="text-ink-soft">Puede que el enlace esté incompleto.</p>
			<Link href="/" className={buttonClass("primary")}>
				Ir al inicio
			</Link>
		</div>
	);
}

function ChildRoot() {
	const guard = useRoleGuard("child");

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
				<h1 className="text-[1.5rem] leading-tight font-bold">
					Esta cuenta no es de ninguna familia
				</h1>
				<p className="text-ink-soft">
					Entra con el usuario y el PIN que te dieron mamá o papá.
				</p>
				<Button variant="primary" onClick={() => void signOut("/nino/entrar")}>
					Entrar con otra cuenta
				</Button>
			</StandaloneFrame>
		);
	}
	if (guard.status === "error") {
		return (
			<StandaloneFrame>
				<h1 className="text-[1.5rem] leading-tight font-bold">
					No pudimos abrir la app
				</h1>
				<p className="text-ink-soft">{childErrorMessage(guard.error)}</p>
				<Button variant="primary" onClick={guard.retry}>
					Reintentar
				</Button>
			</StandaloneFrame>
		);
	}

	return (
		<ChildProvider household={guard.household}>
			<Shell>
				<Switch>
					<Route path="/" component={Home} />
					<Route path="/pedir" component={Ask} />
					<Route path="/tareas" component={Tasks} />
					<Route path="/avisos" component={Notifications} />
					<Route component={NotFound} />
				</Switch>
			</Shell>
		</ChildProvider>
	);
}

export default function ChildApp() {
	useState(() => dropTrailingSlash("/nino"));

	return (
		<AppProviders>
			<Router base="/nino">
				<ChildRoot />
			</Router>
		</AppProviders>
	);
}
