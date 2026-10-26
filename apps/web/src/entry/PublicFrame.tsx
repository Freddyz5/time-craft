// The public pages' frame (login, recovery): the mark, one line on what the
// app is, a short row of bricks showing the idea, and the form in a callout.
// The child's login leaves the bricks out: to them, bricks are their time.
import type { ReactNode } from "react";
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
		<div className="flex min-h-dvh flex-col items-center px-4 py-8 sm:justify-center sm:py-12">
			<div className="flex w-full max-w-[25rem] flex-col gap-6">
				<div className="flex flex-col gap-4">
					<Wordmark />
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
				<main className="flex flex-col gap-5 rounded-callout border-[1.5px] border-rule bg-sheet p-5 shadow-callout sm:p-6">
					<div className="flex flex-col gap-1.5">
						<h1 className="text-2xl font-bold tracking-[-0.01em]">{title}</h1>
						{lead && <p className="text-ink-soft">{lead}</p>}
					</div>
					{children}
				</main>
				{footer && <div className="px-1 text-ink-soft">{footer}</div>}
			</div>
		</div>
	);
}
