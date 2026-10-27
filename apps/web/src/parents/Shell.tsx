// The parents' frame: on the phone a plate across the top and a tab bar
// within thumb's reach; from a laptop width up, a side rail. The active tab
// is a yellow tile raised on the bar.

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
import { Wordmark } from "../components/brand";
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

function ChildSwitch() {
	const { household, child, setChildId } = useParents();
	if (child === undefined) {
		return null;
	}
	if (household.children.length < 2) {
		return (
			<span className="truncate font-semibold text-ink-soft">{child.name}</span>
		);
	}
	return (
		<label className="flex items-center gap-2">
			<span className="sr-only">Niño</span>
			<select
				value={child.id}
				onChange={(event) => setChildId(event.target.value)}
				className="min-h-10 rounded-full border-[1.5px] border-rule-strong bg-sheet-sunk px-3 font-semibold"
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
		<div className="min-h-dvh lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]">
			<a
				href="#contenido"
				className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-control focus:bg-ink focus:px-4 focus:py-2 focus:text-on-ink"
			>
				Ir al contenido
			</a>

			{/* Phone header: a plate across the top. */}
			<header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 bg-sheet px-4 shadow-[0_4px_0_var(--color-sheet-side),0_12px_20px_-14px_var(--color-shadow)] lg:hidden">
				<Link
					href="/"
					className="text-ink no-underline"
					aria-label="Time Craft, inicio"
				>
					<Wordmark />
				</Link>
				<div className="flex min-w-0 items-center gap-2.5">
					<ChildSwitch />
					<Link
						href="/sesion"
						aria-label="Nueva sesión"
						className={`grid size-11 shrink-0 place-items-center rounded-full no-underline transition-transform active:translate-y-0.5 ${
							sessionOpen
								? "bg-raised text-ink shadow-[inset_0_0_0_1.5px_var(--color-rule),0_3px_0_var(--color-raised-side)]"
								: "bg-ink text-on-ink shadow-[inset_0_0_0_4px_rgb(255_255_255/0.14),0_3px_0_var(--color-ink-side)]"
						}`}
					>
						<Plus className="size-5" strokeWidth={2.5} aria-hidden="true" />
					</Link>
				</div>
			</header>

			{/* Desktop rail: a plate down the side. */}
			<aside className="sticky top-0 z-20 hidden h-dvh flex-col gap-6 bg-sheet px-4 py-5 shadow-[4px_0_0_var(--color-sheet-side),12px_0_24px_-16px_var(--color-shadow)] lg:flex">
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
				<nav aria-label="Secciones" className="flex flex-col gap-2">
					{NAV.map(({ href, label, Icon }) => {
						const active = isActive(location, href);
						return (
							<Link
								key={href}
								href={href}
								aria-current={active ? "page" : undefined}
								className={`flex min-h-11 items-center gap-3 rounded-control px-3 font-bold no-underline transition-colors ${
									active
										? "tile-on"
										: "text-ink-soft hover:bg-sheet-sunk hover:text-ink"
								}`}
							>
								<Icon className="size-5" aria-hidden="true" />
								<span className="flex-1">{label}</span>
							</Link>
						);
					})}
				</nav>
				<div className="mt-auto flex items-center justify-between gap-2 border-t-[1.5px] border-rule px-2 pt-4">
					<span className="truncate text-ink-soft">{parentName}</span>
					<button
						type="button"
						onClick={() => void signOut()}
						className="inline-flex min-h-10 items-center gap-1.5 rounded-control px-2 font-semibold text-ink-soft hover:bg-sheet-sunk hover:text-ink"
					>
						<LogOut className="size-4" aria-hidden="true" />
						Salir
					</button>
				</div>
			</aside>

			<main
				id="contenido"
				className="px-4 pt-7 pb-[calc(7rem+env(safe-area-inset-bottom))] lg:px-10 lg:pt-10 lg:pb-12"
			>
				{children}
			</main>

			{/* Phone tab bar: a plate with its studs; the active tab is a yellow
			    tile. */}
			<nav
				aria-label="Secciones"
				className="studs-top fixed inset-x-0 bottom-0 z-30 bg-sheet pb-[env(safe-area-inset-bottom)] shadow-[0_-12px_20px_-14px_var(--color-shadow)] lg:hidden"
			>
				<ul className="mx-auto grid max-w-lg grid-cols-5">
					{NAV.map(({ href, label, Icon }) => {
						const active = isActive(location, href);
						return (
							<li key={href}>
								<Link
									href={href}
									aria-current={active ? "page" : undefined}
									className={`flex min-h-[4.5rem] flex-col items-center justify-center gap-1 text-[0.8125rem] font-bold no-underline ${
										active ? "text-ink" : "text-ink-faint"
									}`}
								>
									<span
										className={`grid h-8 w-12 place-items-center rounded-control ${active ? "tile-on" : ""}`}
									>
										<Icon
											className="size-[1.375rem]"
											strokeWidth={active ? 2.25 : 2}
											aria-hidden="true"
										/>
									</span>
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
