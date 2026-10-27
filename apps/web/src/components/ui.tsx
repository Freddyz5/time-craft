// The shared controls, as building pieces: boxes are plates with studs on
// top, buttons are bricks that sink when pressed, fields are slots sunk into
// the plate. Ink for the main action, red only for actions that cut.
// Standard elements underneath (button, input, dialog), so they behave the
// way every phone expects.
import { LoaderCircle, Minus, Plus } from "lucide-react";
import {
	type ButtonHTMLAttributes,
	type ReactNode,
	useEffect,
	useId,
	useRef,
} from "react";
import { Brick } from "./bricks";

type Variant =
	| "primary"
	| "secondary"
	| "quiet"
	| "danger"
	| "pause"
	// White plastic in both themes, for a coloured plate (a running "Ahora").
	| "light";

// The brick variants live in global.css (@utility brick-*).
const variants: Record<Variant, string> = {
	primary: "brick brick-primary",
	secondary: "brick brick-secondary",
	quiet:
		"bg-transparent text-ink hover:bg-sheet-sunk active:bg-sheet-sunk disabled:text-ink-faint underline-offset-4",
	danger: "brick brick-danger",
	pause: "brick brick-pause",
	light: "brick brick-light",
};

const sizes = {
	md: "min-h-12 px-4 text-base gap-2",
	sm: "min-h-10 px-3 text-[0.9375rem] gap-1.5",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: Variant;
	size?: keyof typeof sizes;
	busy?: boolean;
	icon?: ReactNode;
	block?: boolean;
}

export function Button({
	variant = "secondary",
	size = "md",
	busy = false,
	icon,
	block = false,
	className = "",
	children,
	disabled,
	type = "button",
	...rest
}: ButtonProps) {
	return (
		<button
			type={type}
			disabled={disabled || busy}
			aria-busy={busy || undefined}
			className={`inline-flex select-none items-center justify-center rounded-control font-bold [text-wrap:balance] transition-colors duration-150 ${variants[variant]} ${sizes[size]} ${block ? "w-full" : ""} ${className}`}
			{...rest}
		>
			{busy ? (
				<LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
			) : (
				icon
			)}
			{children}
		</button>
	);
}

// A link that looks like a button (navigation, not an action).
export function buttonClass(
	variant: Variant = "secondary",
	size: keyof typeof sizes = "md",
): string {
	return `inline-flex select-none items-center justify-center rounded-control font-bold no-underline transition-colors duration-150 ${variants[variant]} ${sizes[size]}`;
}

// A plate: the box every screen is built from, with its studs on top and its
// edge below. `tone` tints its face and edge for the one state it reports
// (balance: a yes, on the child's side).
export function Callout({
	children,
	className = "",
	tone = "plain",
	as: Tag = "section",
	...rest
}: {
	children: ReactNode;
	className?: string;
	tone?: "plain" | "pause" | "stop" | "bonus" | "balance";
	as?: "section" | "div" | "article" | "li" | "form";
	"aria-labelledby"?: string;
	"aria-label"?: string;
	// Only to recolour the plate: --plate-face and --plate-side.
	style?: React.CSSProperties;
	onSubmit?: (event: React.SubmitEvent<HTMLFormElement>) => void;
}) {
	const tones = {
		plain: "",
		pause:
			"[--plate-face:var(--color-pause-tint)] [--plate-side:var(--color-pause)]",
		stop: "[--plate-face:var(--color-stop-tint)] [--plate-side:var(--color-stop)]",
		bonus:
			"[--plate-side:var(--color-bonus)] outline-3 -outline-offset-3 outline-bonus",
		balance:
			"[--plate-face:var(--color-balance-tint)] [--plate-side:var(--color-balance)]",
	};
	return (
		<Tag className={`plate ${tones[tone]} ${className}`} {...(rest as object)}>
			{children}
		</Tag>
	);
}

export function Field({
	label,
	hint,
	error,
	children,
	htmlFor,
}: {
	label: string;
	hint?: ReactNode;
	error?: string | null | undefined;
	children: ReactNode;
	htmlFor: string;
}) {
	return (
		<div className="flex flex-col gap-1.5">
			<label htmlFor={htmlFor} className="font-semibold text-ink">
				{label}
			</label>
			{children}
			{error ? (
				<p className="text-[0.9375rem] text-stop" role="alert">
					{error}
				</p>
			) : hint ? (
				<p className="text-[0.9375rem] text-ink-soft">{hint}</p>
			) : null}
		</div>
	);
}

// A field is a slot sunk into the plate: a darker floor and a shadow under
// its top edge.
const slotClass =
	"min-h-12 w-full rounded-control border-[1.5px] border-rule-strong bg-sheet-sunk px-3.5 text-ink shadow-[inset_0_2px_0_rgb(0_0_0/0.07)] transition-colors hover:border-ink-soft focus-visible:border-focus focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus/25 aria-invalid:border-stop disabled:text-ink-faint disabled:opacity-70";

export const inputClass = `${slotClass} text-base`;

// The − and + of a stepper: small square bricks.
const stepClass =
	"brick brick-secondary grid size-12 shrink-0 place-items-center rounded-control";

// Whole minutes with − / + (big targets for a thumb) and the value typed in
// the middle when needed.
export function MinutesStepper({
	id,
	value,
	onChange,
	min = 1,
	max,
	step = 5,
	label,
}: {
	id: string;
	value: number;
	onChange: (minutes: number) => void;
	min?: number;
	max: number;
	step?: number;
	label: string;
}) {
	const clamp = (minutes: number) =>
		Math.min(max, Math.max(min, Math.round(minutes)));
	const down = () =>
		onChange(clamp(value % step === 0 ? value - step : value - (value % step)));
	const up = () =>
		onChange(
			clamp(
				value % step === 0 ? value + step : value + (step - (value % step)),
			),
		);
	return (
		<div className="flex items-stretch gap-2">
			<button
				type="button"
				onClick={down}
				disabled={value <= min}
				aria-label={`Quitar ${step} minutos`}
				className={stepClass}
			>
				<Minus className="size-5" aria-hidden="true" />
			</button>
			<div className="relative flex-1">
				<input
					id={id}
					type="number"
					inputMode="numeric"
					min={min}
					max={max}
					step={1}
					value={Number.isFinite(value) ? value : ""}
					aria-label={label}
					onChange={(event) => {
						const next = Number.parseInt(event.target.value, 10);
						onChange(Number.isNaN(next) ? min : Math.min(max, next));
					}}
					onBlur={() => onChange(clamp(value))}
					className={`${slotClass} tabular appearance-none pt-1 pr-14 text-center font-display text-2xl font-extrabold [&::-webkit-inner-spin-button]:appearance-none`}
				/>
				<span className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-ink-soft">
					min
				</span>
			</div>
			<button
				type="button"
				onClick={up}
				disabled={value >= max}
				aria-label={`Sumar ${step} minutos`}
				className={stepClass}
			>
				<Plus className="size-5" aria-hidden="true" />
			</button>
		</div>
	);
}

// Two or three mutually exclusive options (radio semantics): a tray sunk into
// the plate, the chosen option raised in it as an ink tile.
export function Segmented<T extends string>({
	value,
	onChange,
	options,
	label,
}: {
	value: T;
	onChange: (value: T) => void;
	options: readonly { value: T; label: string }[];
	label: string;
}) {
	const name = useId();
	return (
		<fieldset className="flex gap-1 rounded-control border-[1.5px] border-rule-strong bg-sheet-sunk p-1 pb-1.5 shadow-[inset_0_2px_0_rgb(0_0_0/0.07)]">
			<legend className="sr-only">{label}</legend>
			{options.map((option) => (
				<label
					key={option.value}
					className="flex min-h-10 flex-1 items-center justify-center rounded-md px-3 text-center font-bold text-ink-soft transition-colors hover:text-ink has-checked:bg-ink has-checked:text-on-ink has-checked:shadow-[0_3px_0_var(--color-ink-side)] has-focus-visible:outline-3 has-focus-visible:outline-focus"
				>
					<input
						type="radio"
						name={name}
						value={option.value}
						checked={value === option.value}
						onChange={() => onChange(option.value)}
						className="sr-only"
					/>
					{option.label}
				</label>
			))}
		</fieldset>
	);
}

export function Switch({
	checked,
	onChange,
	label,
	description,
	id,
}: {
	checked: boolean;
	onChange: (checked: boolean) => void;
	label: string;
	description?: string;
	id: string;
}) {
	return (
		<div className="flex items-start justify-between gap-4">
			<label htmlFor={id} className="flex flex-col gap-0.5">
				<span className="font-semibold">{label}</span>
				{description && (
					<span className="text-[0.9375rem] text-ink-soft">{description}</span>
				)}
			</label>
			<button
				id={id}
				type="button"
				role="switch"
				aria-checked={checked}
				onClick={() => onChange(!checked)}
				className={`relative mt-0.5 h-8 w-13 shrink-0 rounded-full border-[1.5px] shadow-[inset_0_2px_0_rgb(0_0_0/0.12)] transition-colors ${checked ? "border-balance bg-balance" : "border-rule-strong bg-sheet-sunk"}`}
			>
				{/* The knob is a stud seen from above. */}
				<span
					className={`absolute top-1/2 size-6 -translate-y-1/2 rounded-full bg-white shadow-[inset_0_0_0_3px_rgb(0_0_0/0.06),0_2px_0_rgb(0_0_0/0.25)] transition-[left] duration-200 ease-out ${checked ? "left-[calc(100%-1.625rem)]" : "left-0.5"}`}
				/>
			</button>
		</div>
	);
}

export function Notice({
	tone = "info",
	children,
	action,
}: {
	tone?: "info" | "error" | "success";
	children: ReactNode;
	action?: ReactNode;
}) {
	const tones = {
		info: "bg-sheet-sunk border-rule-strong/40 text-ink",
		error: "bg-stop-tint border-stop text-stop-ink",
		success: "bg-balance-tint border-balance text-balance-ink",
	};
	return (
		<div
			role={tone === "error" ? "alert" : "status"}
			className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-control border-[1.5px] px-3.5 py-3 ${tones[tone]}`}
		>
			<div className="min-w-0 flex-1">{children}</div>
			{action}
		</div>
	);
}

// A confirmation for actions that cannot be undone. Native <dialog>: focus
// stays inside and Escape closes it.
export function ConfirmDialog({
	open,
	title,
	children,
	confirmLabel,
	tone = "danger",
	busy = false,
	onConfirm,
	onClose,
}: {
	open: boolean;
	title: string;
	children: ReactNode;
	confirmLabel: string;
	tone?: "danger" | "primary";
	busy?: boolean;
	onConfirm: () => void;
	onClose: () => void;
}) {
	const ref = useRef<HTMLDialogElement>(null);
	const titleId = useId();
	useEffect(() => {
		const dialog = ref.current;
		if (dialog === null) {
			return;
		}
		if (open && !dialog.open) {
			dialog.showModal();
		} else if (!open && dialog.open) {
			dialog.close();
		}
	}, [open]);
	return (
		<dialog
			ref={ref}
			aria-labelledby={titleId}
			onClose={onClose}
			onClick={(event) => {
				if (event.target === ref.current) {
					onClose();
				}
			}}
			onKeyDown={() => undefined}
			className="plate m-auto w-[min(26rem,calc(100vw-2rem))] overflow-visible p-0 text-ink open:motion-safe:animate-rise"
		>
			<div className="flex flex-col gap-3 p-5">
				<h2 id={titleId} className="text-[1.375rem] leading-tight font-bold">
					{title}
				</h2>
				<div className="text-ink-soft">{children}</div>
				<div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
					<Button variant="secondary" onClick={onClose} disabled={busy}>
						Volver
					</Button>
					<Button
						variant={tone === "danger" ? "danger" : "primary"}
						onClick={onConfirm}
						busy={busy}
					>
						{confirmLabel}
					</Button>
				</div>
			</div>
		</dialog>
	);
}

// Loading: three bricks drop onto each other in turn, like a small tower
// being built, instead of a generic spinner.
const LOADING_BRICKS = [
	"var(--color-balance)",
	"var(--color-bonus)",
	"var(--color-game)",
];

export function LoadingBricks({ label = "Cargando…" }: { label?: string }) {
	return (
		<div
			role="status"
			className="flex flex-col items-center gap-3 py-10 text-ink-soft"
		>
			<div className="flex w-10 flex-col-reverse gap-px" aria-hidden="true">
				{LOADING_BRICKS.map((color, index) => (
					<div
						key={color}
						className="motion-safe:animate-brick-stack"
						style={{ animationDelay: `${index * 220}ms` }}
					>
						<Brick fill={1} color={color} />
					</div>
				))}
			</div>
			<span>{label}</span>
		</div>
	);
}

export function SectionTitle({
	id,
	children,
	action,
}: {
	id?: string;
	children: ReactNode;
	action?: ReactNode;
}) {
	return (
		<div className="flex items-end justify-between gap-3">
			<h2 id={id} className="text-[1.375rem] leading-tight font-bold">
				{children}
			</h2>
			{action}
		</div>
	);
}
