// The child's frame: a white bar with the mark, their name and the bell
// (Avisos), and three big tabs within thumb's reach: Inicio, Pedir, Tareas.
// From a laptop width up the tabs move into the top bar. The active tab
// wears a brick's two studs, as on the parents' side.
import { Bell, Hand, House, ListChecks, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { BrandMark, Studs } from "../components/brand";
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
				className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-control focus:bg-ink focus:px-4 focus:py-2 focus:text-white"
			>
				Ir al contenido
			</a>

			<header className="sticky top-0 z-30 border-b-[1.5px] border-rule bg-sheet/95 backdrop-blur-sm">
				<div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4 lg:h-16 lg:px-10">
					<Link
						href="/"
						className="flex min-w-0 items-center gap-2.5 text-ink no-underline"
						aria-label={`Time Craft, inicio de ${name}`}
					>
						<BrandMark className="size-8 shrink-0" />
						<span className="truncate text-lg font-bold tracking-[-0.01em]">
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
											className={`relative flex min-h-11 items-center gap-2 rounded-control px-3.5 font-medium no-underline transition-colors ${
												active
													? "bg-page text-ink"
													: "text-ink-soft hover:bg-sheet-sunk hover:text-ink"
											}`}
										>
											<Icon className="size-5" aria-hidden="true" />
											{label}
											{active && (
												<span className="absolute -top-1.5 left-3.5">
													<Studs />
												</span>
											)}
										</Link>
									</li>
								);
							})}
						</ul>
					</nav>

					<Link
						href="/avisos"
						aria-label="Avisos"
						aria-current={onAvisos ? "page" : undefined}
						className={`grid size-11 shrink-0 place-items-center rounded-full no-underline transition-colors ${
							onAvisos
								? "bg-ink text-white"
								: "border-[1.5px] border-rule-strong bg-sheet text-ink hover:bg-sheet-sunk"
						}`}
					>
						<Bell className="size-5" aria-hidden="true" />
					</Link>
				</div>
			</header>

			<main
				id="contenido"
				className="px-4 pt-5 pb-[calc(6.5rem+env(safe-area-inset-bottom))] lg:px-10 lg:pt-8 lg:pb-12"
			>
				{children}
			</main>

			<nav
				aria-label="Secciones"
				className="fixed inset-x-0 bottom-0 z-30 border-t-[1.5px] border-rule bg-sheet pb-[env(safe-area-inset-bottom)] lg:hidden"
			>
				<ul className="mx-auto grid max-w-lg grid-cols-3">
					{NAV.map(({ href, label, Icon }) => {
						const active = isActive(location, href);
						return (
							<li key={href}>
								<Link
									href={href}
									aria-current={active ? "page" : undefined}
									className={`relative flex min-h-16 flex-col items-center justify-center gap-1 text-[0.875rem] font-medium no-underline ${
										active ? "text-ink" : "text-ink-faint"
									}`}
								>
									<span className="absolute top-0 left-1/2 -translate-x-1/2">
										{active && <Studs />}
									</span>
									<Icon
										className="size-7"
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
