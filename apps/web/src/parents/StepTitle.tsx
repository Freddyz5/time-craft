// A numbered step, as in a building manual: the number carries the order of
// the flow (1 actividad, 2 minutos, 3 cuándo).
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
				className="tabular -mt-1 w-7 shrink-0 text-[2rem] leading-none font-extrabold text-ink"
			>
				{number}
			</span>
			<div className="flex flex-col gap-0.5">
				<h2 id={id} className="text-lg leading-tight font-semibold">
					<span className="sr-only">Paso {number}: </span>
					{children}
				</h2>
				{hint && <p className="text-[0.9375rem] text-ink-soft">{hint}</p>}
			</div>
		</div>
	);
}
