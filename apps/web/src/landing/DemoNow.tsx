// The landing's example session: "Ahora" as the app draws it, a 20-minute
// Juego session counting down on its tile while its tower of bricks drains. It is a
// demonstration (labelled as such on the page), not anyone's data: it starts
// at 12:59 and starts over when it reaches the end.
import { Gamepad2 } from "lucide-react";
import { useEffect, useState } from "react";
import { BrickTower, bricksFor } from "../components/bricks";

const PLANNED_MINUTES = 20;
const START_SECONDS = 12 * 60 + 59;

function clock(seconds: number): string {
	const minutes = Math.floor(seconds / 60);
	return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function DemoNow() {
	const [left, setLeft] = useState(START_SECONDS);
	useEffect(() => {
		const timer = setInterval(
			() => setLeft((seconds) => (seconds <= 0 ? START_SECONDS : seconds - 1)),
			1000,
		);
		return () => clearInterval(timer);
	}, []);
	const used = PLANNED_MINUTES - Math.ceil(left / 60);
	return (
		<div className="plate flex flex-col gap-4 p-5 text-white [--color-focus:#ffffff] [--plate-face:var(--color-game)] [--plate-side:var(--color-game-side)]">
			<div className="flex items-center justify-between gap-2">
				<p className="font-display text-[1.375rem] leading-tight font-bold">
					Ahora
				</p>
				<span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 font-bold text-game">
					<Gamepad2 className="size-4" aria-hidden="true" />
					Juego
				</span>
			</div>
			<div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 rounded-control bg-black/25 px-4 pt-3 pb-3 shadow-[inset_0_3px_0_rgb(0_0_0/0.22),inset_0_-2px_0_rgb(255_255_255/0.1)]">
				<p className="tabular pt-1 font-display text-[4rem] leading-none font-extrabold tracking-[-0.02em] sm:text-[4.5rem]">
					{clock(left)}
				</p>
				<BrickTower
					bricks={bricksFor(
						left / 60,
						PLANNED_MINUTES,
						10,
						"#ffffff",
						"rgb(255 255 255 / 0.6)",
					)}
					label={`Quedan ${Math.ceil(left / 60)} de ${PLANNED_MINUTES} minutos`}
				/>
			</div>
			<p className="text-white/85">
				Lleva {used} min de {PLANNED_MINUTES} min · la inició mamá
			</p>
		</div>
	);
}
