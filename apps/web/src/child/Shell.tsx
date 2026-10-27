// The child's frame: a plate across the top with the mark, their name and the
// bell (Avisos), and three big tabs within thumb's reach: Inicio, Pedir,
// Tareas. From a laptop width up the tabs move into the top bar. The active
// tab is a yellow tile, as on the parents' side.
import { Bell, Hand, House, ListChecks, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { BrandMark } from "../components/brand";
import { useChild } from "./context";

interface NavItem {
	href: string;
	label: string;
	Icon: LucideIcon;
}

const NAV: NavItem[] = [
	{ href: "/", label: "Inicio", Icon: House },
	{ href: "/pedir", label: "Pedir", Icon: Hand },
	{ href: "/tareas", label: "Tareas", Icon: ListChecks },
];

function isActive(location: string, href: string): boolean {
	return href === "/" ? location === "/" : location.startsWith(href);
}

export function Shell({ children }: { children: ReactNode }) {
	const [location] = useLocation();
	const { name } = useChild();
	const onAvisos = location.startsWith("/avisos");

	return (
		<div className="min-h-dvh">
			<a
				href="#contenido"
				className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-control focus:bg-ink focus:px-4 focus:py-2 focus:text-on-ink"
			>
				Ir al contenido
			</a>

			<header className="sticky top-0 z-30 bg-sheet shadow-[0_4px_0_var(--color-sheet-side),0_12px_20px_-14px_var(--color-shadow)]">
				<div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-4 lg:h-[4.5rem] lg:px-10">
					<Link
						href="/"
						className="flex min-w-0 items-center gap-2.5 text-ink no-underline"
						aria-label={`Time Craft, inicio de ${name}`}
					>
						<BrandMark className="size-10 shrink-0" />
						<span className="truncate pt-1 font-display text-[1.375rem] leading-none font-extrabold tracking-[-0.01em]">
							Hola, {name}
						</span>
					</Link>

					<nav aria-label="Secciones" className="hidden lg:block">
						<ul className="flex items-center gap-2">
							{NAV.map(({ href, label, Icon }) => {
								const active = isActive(location, href);
								return (
									<li key={href}>
										<Link
											href={href}
											aria-current={active ? "page" : undefined}
											className={`flex min-h-11 items-center gap-2 rounded-control px-3.5 font-bold no-underline transition-colors ${
												active
													? "tile-on"
													: "text-ink-soft hover:bg-sheet-sunk hover:text-ink"
											}`}
										>
											<Icon className="size-5" aria-hidden="true" />
											{label}
										</Link>
									</li>
								);
							})}
						</ul>
					</nav>

					{/* The bell is a round stud: ink while Avisos is open. */}
					<Link
						href="/avisos"
						aria-label="Avisos"
						aria-current={onAvisos ? "page" : undefined}
						className={`grid size-11 shrink-0 place-items-center rounded-full no-underline transition-transform active:translate-y-0.5 ${
							onAvisos
								? "bg-ink text-on-ink shadow-[inset_0_0_0_4px_rgb(255_255_255/0.14),0_3px_0_var(--color-ink-side)]"
								: "bg-raised text-ink shadow-[inset_0_0_0_1.5px_var(--color-rule),0_3px_0_var(--color-raised-side)]"
						}`}
					>
						<Bell className="size-5" aria-hidden="true" />
					</Link>
				</div>
			</header>

			<main
				id="contenido"
				className="px-4 pt-7 pb-[calc(7.5rem+env(safe-area-inset-bottom))] lg:px-10 lg:pt-10 lg:pb-12"
			>
				{children}
			</main>

			<nav
				aria-label="Secciones"
				className="studs-top fixed inset-x-0 bottom-0 z-30 bg-sheet pb-[env(safe-area-inset-bottom)] shadow-[0_-12px_20px_-14px_var(--color-shadow)] lg:hidden"
			>
				<ul className="mx-auto grid max-w-lg grid-cols-3">
					{NAV.map(({ href, label, Icon }) => {
						const active = isActive(location, href);
						return (
							<li key={href}>
								<Link
									href={href}
									aria-current={active ? "page" : undefined}
									className={`flex min-h-20 flex-col items-center justify-center gap-1 text-[0.875rem] font-bold no-underline ${
										active ? "text-ink" : "text-ink-faint"
									}`}
								>
									<span
										className={`grid h-9 w-14 place-items-center rounded-control ${active ? "tile-on" : ""}`}
									>
										<Icon
											className="size-7"
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
