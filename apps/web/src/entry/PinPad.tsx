// The child's PIN: the digits typed so far drawn as studs on a brick, and a
// big 3×4 keypad of brick keys for a thumb (1–9, delete, 0, Entrar). A PIN
// is 6 to 12 digits, so the row starts with six empty studs and grows as it
// fills.
import { ArrowRight, Delete, LoaderCircle } from "lucide-react";

export const PIN_MIN = 6;
export const PIN_MAX = 12;

export function PinStuds({
	length,
	shake,
}: {
	length: number;
	// Changes on every wrong PIN: the row shakes once.
	shake: number;
}) {
	const slots = Math.min(PIN_MAX, Math.max(PIN_MIN, length));
	return (
		<div className="flex flex-col items-center gap-2">
			{/* The studs sit on top of a brick: each digit typed fills one. */}
			<div
				key={shake}
				aria-hidden="true"
				className={`flex flex-col items-center ${shake > 0 ? "motion-safe:animate-shake" : ""}`}
			>
				<div
					className="grid justify-center gap-2 px-3"
					style={{
						gridTemplateColumns: `repeat(${slots}, minmax(0, 1.25rem))`,
					}}
				>
					{Array.from({ length: slots }, (_, index) => (
						<span
							// biome-ignore lint/suspicious/noArrayIndexKey: slots are positions
							key={index}
							className={`relative block aspect-[2/1] rounded-t-[6px] transition-colors duration-150 ${
								index < length
									? "bg-bonus"
									: "border-[1.5px] border-b-0 border-rule-strong bg-sheet-sunk"
							}`}
						>
							{index < length && (
								<span className="absolute inset-x-1 top-0.5 h-0.5 rounded-full bg-white/45" />
							)}
						</span>
					))}
				</div>
				<span className="block h-3 w-full rounded-[4px] bg-bonus shadow-[inset_0_-3px_0_var(--color-bonus-side)]" />
			</div>
			<p className="sr-only" aria-live="polite">
				{length === 0
					? "Ningún número escrito"
					: length === 1
						? "1 número escrito"
						: `${length} números escritos`}
			</p>
		</div>
	);
}

const keyClass =
	"grid min-h-16 select-none place-items-center rounded-control leading-none";
const digitClass = `${keyClass} brick brick-secondary tabular pt-1.5 font-display text-[2rem] font-extrabold`;

export function PinPad({
	onDigit,
	onDelete,
	onSubmit,
	canSubmit,
	canDelete,
	busy,
}: {
	onDigit: (digit: string) => void;
	onDelete: () => void;
	onSubmit: () => void;
	canSubmit: boolean;
	canDelete: boolean;
	busy: boolean;
}) {
	const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
	return (
		<fieldset className="grid grid-cols-3 gap-2">
			<legend className="sr-only">Teclado del PIN</legend>
			{digits.map((digit) => (
				<button
					key={digit}
					type="button"
					onClick={() => onDigit(digit)}
					className={digitClass}
				>
					{digit}
				</button>
			))}
			<button
				type="button"
				onClick={onDelete}
				disabled={!canDelete}
				aria-label="Borrar el último número"
				className={`${keyClass} text-ink hover:bg-sheet-sunk active:bg-sheet-sunk disabled:text-ink-faint/60`}
			>
				<Delete className="size-7" aria-hidden="true" />
			</button>
			<button type="button" onClick={() => onDigit("0")} className={digitClass}>
				0
			</button>
			<button
				type="button"
				onClick={onSubmit}
				disabled={!canSubmit || busy}
				aria-busy={busy || undefined}
				className={`${keyClass} brick brick-primary gap-1 text-[1.0625rem] font-bold`}
			>
				{busy ? (
					<LoaderCircle className="size-6 animate-spin" aria-hidden="true" />
				) : (
					<span className="flex items-center gap-1">
						Entrar
						<ArrowRight className="size-5" aria-hidden="true" />
					</span>
				)}
			</button>
		</fieldset>
	);
}
