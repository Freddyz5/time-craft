// «Arma tu pedido»: the minutes the child can ask for, as a row of bricks.
// Tapping one picks every brick up to it; the picked ones lift and take the
// activity's colour. The last brick may be worth less (what is left: 35 min
// is three bricks and a half one). Radio inputs underneath, so arrow keys and
// screen readers work as with any choice.
import { useId } from "react";
import { Brick } from "../../components/bricks";

export function BrickPicker({
	options,
	value,
	onChange,
	unit,
	color,
	rest,
	label,
}: {
	// Minutes each brick stands for, cumulative: [10, 20, 30, 35].
	options: readonly number[];
	value: number;
	onChange: (minutes: number) => void;
	unit: number;
	// The picked bricks' colour (the activity's).
	color: string;
	// How unpicked bricks look: still available (green) or only possible
	// (an empty socket, for extra time).
	rest: "balance" | "socket";
	label: string;
}) {
	const name = useId();
	const picked = options.indexOf(value);
	return (
		<fieldset>
			<legend className="sr-only">{label}</legend>
			<div
				className="grid gap-x-1.5 gap-y-2"
				style={{
					gridTemplateColumns: `repeat(${Math.min(6, Math.max(3, options.length))}, minmax(0, 1fr))`,
				}}
			>
				{options.map((minutes, index) => {
					const isPicked = index <= picked;
					const previous = index === 0 ? 0 : (options[index - 1] ?? 0);
					const half = minutes - previous <= unit / 2;
					return (
						<label
							key={minutes}
							className="cursor-pointer rounded-control px-0.5 pt-2 pb-1 has-focus-visible:outline-3 has-focus-visible:outline-focus"
						>
							<input
								type="radio"
								name={name}
								value={minutes}
								checked={value === minutes}
								onChange={() => onChange(minutes)}
								className="sr-only"
								aria-label={`${minutes} minutos`}
							/>
							<span
								className={`block motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out-quick ${
									isPicked ? "-translate-y-1.5" : ""
								}`}
							>
								<Brick
									fill={1}
									color={isPicked ? color : "var(--color-balance)"}
									socket={!isPicked && rest === "socket"}
									half={half}
								/>
							</span>
							<span
								className={`tabular mt-1 block text-center text-[0.875rem] ${
									index === picked ? "font-semibold text-ink" : "text-ink-soft"
								}`}
								aria-hidden="true"
							>
								{minutes}
							</span>
						</label>
					);
				})}
			</div>
		</fieldset>
	);
}
