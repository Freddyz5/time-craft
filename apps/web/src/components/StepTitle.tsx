// A numbered step, as in a building set's instructions: the number, printed
// on an ink tile, carries the order of the flow (1 actividad, 2 minutos,
// 3 cuándo).
import type { ReactNode } from "react";

export function StepTitle({
	number,
	id,
	children,
	hint,
}: {
	number: number;
	id: string;
	children: ReactNode;
	hint?: ReactNode;
}) {
	return (
		<div className="flex items-start gap-3">
			<span
				aria-hidden="true"
				className="tabular grid size-10 shrink-0 place-items-center rounded-control bg-ink pt-1 font-display text-[1.375rem] leading-none font-extrabold text-on-ink shadow-[inset_0_2px_0_rgb(255_255_255/0.14),0_3px_0_var(--color-ink-side)]"
			>
				{number}
			</span>
			<div className="flex flex-col gap-0.5 pt-1">
				<h2 id={id} className="text-[1.375rem] leading-tight font-bold">
					<span className="sr-only">Paso {number}: </span>
					{children}
				</h2>
				{hint && <p className="text-[0.9375rem] text-ink-soft">{hint}</p>}
			</div>
		</div>
	);
}
