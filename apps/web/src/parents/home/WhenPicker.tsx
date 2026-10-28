// "¿Cuándo empieza?": now, or at a time later today (the api accepts until
// the end of the family's day). Times are the family's wall clock.
import { useId } from "react";
import { inputClass, Segmented } from "../../components/ui";
import { serverNow } from "../../lib/clock";
import { timeText, todayAt } from "../../lib/format";

export interface When {
	mode: "now" | "later";
	// "HH:mm" in the family's zone.
	time: string;
}

// Half an hour from now, on a five-minute mark, but never past 23:55.
export function defaultLater(timeZone: string): string {
	const soon = serverNow() + 30 * 60_000;
	const [h = "0", m = "0"] = timeText(soon, timeZone).split(":");
	const minutes = Math.min(
		23 * 60 + 55,
		Number(h) * 60 + Math.ceil(Number(m) / 5) * 5,
	);
	const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
	const mm = String(minutes % 60).padStart(2, "0");
	// After 23:25 "later today" barely exists; the input still caps it.
	return `${hh}:${mm}`;
}

export function startAtFor(when: When, timeZone: string): string | undefined {
	return when.mode === "now"
		? undefined
		: todayAt(when.time, serverNow(), timeZone);
}

export function laterIsValid(when: When, timeZone: string): boolean {
	if (when.mode === "now") {
		return true;
	}
	return (
		/^\d{2}:\d{2}$/.test(when.time) &&
		when.time > timeText(serverNow(), timeZone)
	);
}

export function WhenPicker({
	value,
	onChange,
	timeZone,
}: {
	value: When;
	onChange: (when: When) => void;
	timeZone: string;
}) {
	const timeId = useId();
	const valid = laterIsValid(value, timeZone);
	return (
		<div className="flex flex-col gap-3">
			<Segmented
				label="Cuándo empieza"
				value={value.mode}
				onChange={(mode) => onChange({ ...value, mode })}
				options={[
					{ value: "now", label: "Ahora" },
					{ value: "later", label: "Más tarde hoy" },
				]}
			/>
			{value.mode === "later" && (
				<div className="flex flex-col gap-1.5">
					<label htmlFor={timeId} className="font-medium">
						Hora de inicio
					</label>
					{/* min and step only guide the browser's picker. The step counts
					    from min (now), so most five-minute marks fail the browser's
					    own check: forms holding this picker set noValidate and
					    rely on laterIsValid. */}
					<input
						id={timeId}
						type="time"
						step={300}
						min={timeText(serverNow(), timeZone)}
						max="23:59"
						value={value.time}
						aria-invalid={!valid || undefined}
						onChange={(event) =>
							onChange({ ...value, time: event.target.value })
						}
						className={`${inputClass} tabular max-w-40`}
					/>
					<p
						className={`text-[0.9375rem] ${valid ? "text-ink-soft" : "text-stop"}`}
					>
						{valid
							? "Mientras espera no gasta tiempo. Si al llegar la hora queda menos, dura lo que quede."
							: "Elige una hora de hoy que todavía no haya pasado."}
					</p>
				</div>
			)}
		</div>
	);
}
