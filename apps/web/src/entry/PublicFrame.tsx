// The public pages' frame (login, recovery): the mark, one line on what the
// app is, a short row of bricks showing the idea, and the form on a plate.
// The child's login leaves the bricks out: to them, bricks are their time.
// The web's version sits in the bottom corner.
import type { ReactNode } from "react";
// The release writes the web's version here (scripts/release); Vite bundles
// only this field.
import { version } from "../../package.json";
import { Wordmark } from "../components/brand";
import { BrickRow, bricksFor } from "../components/bricks";

export function PublicFrame({
	title,
	lead,
	children,
	footer,
	bricks = true,
}: {
	title: string;
	lead?: ReactNode;
	children: ReactNode;
	footer?: ReactNode;
	bricks?: boolean;
}) {
	return (
		<div className="relative flex min-h-dvh flex-col items-center px-4 py-8 sm:justify-center sm:py-12">
			<p className="absolute right-4 bottom-2 text-sm text-ink-faint tabular-nums">
				v{version}
			</p>
			<div className="flex w-full max-w-[25rem] flex-col gap-6">
				<div className="flex flex-col gap-4">
					<Wordmark size="lg" />
					{bricks && (
						<div className="w-44">
							<BrickRow
								bricks={bricksFor(45, 60, 10, "var(--color-balance)")}
								perRow={6}
								gap="tight"
								label="Ejemplo: 45 de 60 minutos disponibles, en ladrillos de 10 minutos"
							/>
						</div>
					)}
				</div>
				<main className="plate flex flex-col gap-5 p-5 sm:p-6">
					<div className="flex flex-col gap-1.5">
						<h1 className="text-[1.75rem] leading-tight font-extrabold">
							{title}
						</h1>
						{lead && <p className="text-ink-soft">{lead}</p>}
					</div>
					{children}
				</main>
				{footer && <div className="px-1 text-ink-soft">{footer}</div>}
			</div>
		</div>
	);
}
