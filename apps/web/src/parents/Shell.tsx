// The parents' frame: on the phone a header and a tab bar within thumb's
// reach; from a laptop width up, a side rail. The active tab wears a brick's
// two studs.

import { useQuery } from "@tanstack/react-query";
import {
	History,
	House,
	ListChecks,
	LogOut,
	type LucideIcon,
	Plus,
	SlidersHorizontal,
	UsersRound,
} from "lucide-react";
import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { BrandMark, Wordmark } from "../components/brand";
import { buttonClass } from "../components/ui";
import { api, call } from "../lib/api";
import { keys } from "../lib/queries";
import { signOut } from "../lib/session";
import { useParents } from "./context";

interface NavItem {
	href: string;
	label: string;
	Icon: LucideIcon;
}

const NAV: NavItem[] = [
	{ href: "/", label: "Inicio", Icon: House },
	{ href: "/historial", label: "Historial", Icon: History },
	{ href: "/reglas", label: "Reglas", Icon: SlidersHorizontal },
	{ href: "/bonos", label: "Bonos", Icon: ListChecks },
	{ href: "/cuentas", label: "Cuentas", Icon: UsersRound },
];

function isActive(location: string, href: string): boolean {
	return href === "/"
		? location === "/" || location === "/sesion"
		: location.startsWith(href);
}

function Studs() {
	return (
		<span aria-hidden="true" className="flex gap-1.5">
			<span className="h-1.5 w-3 rounded-t-[3px] bg-bonus" />
			<span className="h-1.5 w-3 rounded-t-[3px] bg-bonus" />
		</span>
	);
}

function ChildSwitch() {
	const { household, child, setChildId } = useParents();
	if (child === undefined) {
		return null;
	}
	if (household.children.length < 2) {
		return (
			<span className="truncate font-medium text-ink-soft">{child.name}</span>
		);
	}
	return (
		<label className="flex items-center gap-2">
			<span className="sr-only">Niño</span>
			<select
				value={child.id}
				onChange={(event) => setChildId(event.target.value)}
				className="min-h-10 rounded-full border-[1.5px] border-rule-strong bg-sheet px-3 font-medium"
			>
				{household.children.map((c) => (
					<option key={c.id} value={c.id}>
						{c.name}
					</option>
				))}
			</select>
		</label>
	);
}

// Whether the child has a session open (scheduled, running or paused), from
// whatever the screens already fetched: the shell never polls on its own.
// With one open, "Nueva sesión" can only explain why it can't start another,
// so it steps back to a quiet style.
function useSessionOpen(childId: string | undefined): boolean {
	const { data } = useQuery({
		queryKey: keys.live(childId ?? ""),
		queryFn: () =>
			call(
				api.children[":childId"]["live-session"].$get({
					param: { childId: childId ?? "" },
				}),
			),
		enabled: false,
	});
	return data?.live != null;
}

export function Shell({ children }: { children: ReactNode }) {
	const [location] = useLocation();
	const { parentName, child } = useParents();
	const sessionOpen = useSessionOpen(child?.id);

	return (
		<div className="min-h-dvh lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
			<a
				href="#contenido"
				className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-control focus:bg-ink focus:px-4 focus:py-2 focus:text-white"
			>
				Ir al contenido
			</a>

			{/* Phone header */}
			<header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b-[1.5px] border-rule bg-sheet/95 px-4 backdrop-blur-sm lg:hidden">
				<Link
					href="/"
					className="text-ink no-underline"
					aria-label="Time Craft, inicio"
				>
					<Wordmark />
				</Link>
				<div className="flex min-w-0 items-center gap-2">
					<ChildSwitch />
					<Link
						href="/sesion"
						aria-label="Nueva sesión"
						className={`grid size-10 shrink-0 place-items-center rounded-full no-underline ${
							sessionOpen
								? "border-[1.5px] border-rule-strong bg-sheet text-ink hover:bg-sheet-sunk"
								: "bg-ink text-white hover:bg-[#2a3038]"
						}`}
					>
						<Plus className="size-5" aria-hidden="true" />
					</Link>
				</div>
			</header>

			{/* Desktop rail */}
			<aside className="sticky top-0 hidden h-dvh flex-col gap-6 border-r-[1.5px] border-rule bg-sheet px-4 py-5 lg:flex">
				<Link
					href="/"
					className="px-2 text-ink no-underline"
					aria-label="Time Craft, inicio"
				>
					<Wordmark />
				</Link>
				<div className="px-2">
					<ChildSwitch />
				</div>
				<Link
					href="/sesion"
					className={`${buttonClass(sessionOpen ? "secondary" : "primary")} w-full`}
				>
					<Plus className="size-5" aria-hidden="true" />
					Nueva sesión
				</Link>
				<nav aria-label="Secciones" className="flex flex-col gap-2.5">
					{NAV.map(({ href, label, Icon }) => {
						const active = isActive(location, href);
						return (
							<Link
								key={href}
								href={href}
								aria-current={active ? "page" : undefined}
								className={`relative flex min-h-11 items-center gap-3 rounded-control px-3 font-medium no-underline transition-colors ${
									active
										? "bg-page text-ink"
										: "text-ink-soft hover:bg-sheet-sunk hover:text-ink"
								}`}
							>
								<Icon className="size-5" aria-hidden="true" />
								<span className="flex-1">{label}</span>
								{active && (
									// The active row is a brick: its studs on the top edge.
									<span className="absolute -top-1.5 left-3">
										<Studs />
									</span>
								)}
							</Link>
						);
					})}
				</nav>
				<div className="mt-auto flex items-center justify-between gap-2 border-t-[1.5px] border-rule px-2 pt-4">
					<span className="truncate text-ink-soft">{parentName}</span>
					<button
						type="button"
						onClick={() => void signOut()}
						className="inline-flex min-h-10 items-center gap-1.5 rounded-control px-2 text-ink-soft hover:bg-sheet-sunk hover:text-ink"
					>
						<LogOut className="size-4" aria-hidden="true" />
						Salir
					</button>
				</div>
			</aside>

			<main
				id="contenido"
				className="px-4 pt-5 pb-[calc(6.5rem+env(safe-area-inset-bottom))] lg:px-10 lg:pt-8 lg:pb-12"
			>
				{children}
			</main>

			{/* Phone tab bar */}
			<nav
				aria-label="Secciones"
				className="fixed inset-x-0 bottom-0 z-30 border-t-[1.5px] border-rule bg-sheet pb-[env(safe-area-inset-bottom)] lg:hidden"
			>
				<ul className="mx-auto grid max-w-lg grid-cols-5">
					{NAV.map(({ href, label, Icon }) => {
						const active = isActive(location, href);
						return (
							<li key={href}>
								<Link
									href={href}
									aria-current={active ? "page" : undefined}
									className={`relative flex min-h-16 flex-col items-center justify-center gap-1 text-[0.8125rem] font-medium no-underline ${
										active ? "text-ink" : "text-ink-faint"
									}`}
								>
									<span className="absolute top-0 left-1/2 -translate-x-1/2">
										{active && <Studs />}
									</span>
									<Icon
										className="size-6"
										strokeWidth={active ? 2.25 : 2}
										aria-hidden="true"
									/>
									{label}
								</Link>
							</li>
						);
					})}
				</ul>
			</nav>
		</div>
	);
}

// Small screens: a compact brand block for full-page states (loading,
// errors) that render before the shell.
export function StandaloneFrame({ children }: { children: ReactNode }) {
	return (
		<div className="grid min-h-dvh place-items-center px-4 py-10">
			<div className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
				<BrandMark className="size-12" />
				{children}
			</div>
		</div>
	);
}
