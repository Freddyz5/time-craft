// Client-side session guard. The page is static, so the browser asks the api
// who is signed in (/api/me) and sends each person where they belong:
// nobody → that side's login (/login for parents, /nino/entrar for the
// child), a parent → /padres, the child → /nino. The api enforces every
// permission anyway; this only avoids showing the wrong screen.
import { useEffect } from "react";
import { ApiError } from "./api";
import { useHousehold } from "./queries";
import type { Household } from "./types";

export type Role = "parent" | "child";

const HOME: Record<Role, string> = { parent: "/padres", child: "/nino" };
const LOGIN: Record<Role, string> = { parent: "/login", child: "/nino/entrar" };

export function homeFor(role: Role): string {
	return HOME[role];
}

// The login for that side, coming back here afterwards (unless here is just
// the side's home, where it lands anyway).
export function loginUrl(role: Role): string {
	const login = LOGIN[role];
	const here = `${window.location.pathname}${window.location.search}`;
	return here === "/" || here === homeFor(role) || here.startsWith(login)
		? login
		: `${login}?next=${encodeURIComponent(here)}`;
}

// Only paths of this app, never another origin.
export function safeNext(next: string | null, role: Role): string {
	const home = homeFor(role);
	if (next === null || !next.startsWith(home) || next.startsWith("//")) {
		return home;
	}
	return next;
}

export type GuardState =
	| { status: "loading" }
	| { status: "redirecting" }
	| { status: "no_role" }
	| { status: "error"; error: unknown; retry: () => void }
	| { status: "ready"; household: Household };

export function useRoleGuard(role: Role): GuardState {
	const query = useHousehold();
	const error = query.error;
	const kind = query.data?.me.kind;
	const unauthenticated = error instanceof ApiError && error.status === 401;
	const wrongRole = kind !== undefined && kind !== role;

	useEffect(() => {
		if (unauthenticated) {
			window.location.replace(loginUrl(role));
		} else if (wrongRole && kind !== undefined) {
			window.location.replace(homeFor(kind));
		}
	}, [unauthenticated, wrongRole, kind, role]);

	if (unauthenticated || wrongRole) {
		return { status: "redirecting" };
	}
	if (error instanceof ApiError && error.code === "no_role") {
		return { status: "no_role" };
	}
	if (error !== null) {
		return { status: "error", error, retry: () => void query.refetch() };
	}
	if (query.data === undefined) {
		return { status: "loading" };
	}
	return { status: "ready", household: query.data };
}
