// The shared controls, in the manual's vocabulary: white callouts with a thin
// steel border, solid ink for the main action, red only for actions that cut.
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

type Variant = "primary" | "secondary" | "quiet" | "danger" | "pause";

const variants: Record<Variant, string> = {
	primary:
		"bg-ink text-on-ink hover:bg-ink/85 disabled:bg-sheet-sunk disabled:text-ink-faint",
	secondary:
		"bg-sheet text-ink border-[1.5px] border-rule-strong hover:bg-sheet-sunk active:bg-page disabled:text-ink-faint disabled:border-rule",
	quiet:
		"bg-transparent text-ink hover:bg-sheet-sunk active:bg-page disabled:text-ink-faint underline-offset-4",
	danger:
		"bg-stop text-white hover:bg-stop/90 disabled:bg-stop-tint disabled:text-stop-ink",
	pause: "bg-pause text-[#1d1000] hover:bg-pause/90 disabled:bg-pause-tint",
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
			className={`inline-flex select-none items-center justify-center rounded-control font-medium text-balance transition-colors duration-150 disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${block ? "w-full" : ""} ${className}`}
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
	return `inline-flex select-none items-center justify-center rounded-control font-medium no-underline transition-colors duration-150 ${variants[variant]} ${sizes[size]}`;
}

// The manual's white box. `tone` tints it for the one state it reports
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
	onSubmit?: (event: React.SubmitEvent<HTMLFormElement>) => void;
}) {
	const tones = {
		plain: "bg-sheet border-rule",
		pause: "bg-pause-tint border-pause",
		stop: "bg-stop-tint border-stop",
		bonus: "bg-bonus-tint border-bonus-side",
		balance: "bg-balance-tint border-balance",
	};
	return (
		<Tag
			className={`rounded-callout border-[1.5px] shadow-callout ${tones[tone]} ${className}`}
			{...(rest as object)}
		>
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
			<label htmlFor={htmlFor} className="font-medium text-ink">
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

export const inputClass =
	"min-h-12 w-full rounded-control border-[1.5px] border-rule-strong bg-sheet px-3.5 text-base text-ink transition-colors hover:border-ink-soft focus-visible:border-focus focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus/25 aria-invalid:border-stop disabled:bg-sheet-sunk disabled:text-ink-faint";

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
				className="grid size-12 shrink-0 place-items-center rounded-control border-[1.5px] border-rule-strong bg-sheet text-ink hover:bg-sheet-sunk disabled:border-rule disabled:text-ink-faint"
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
					className={`${inputClass} tabular appearance-none pr-14 text-center text-xl font-semibold [&::-webkit-inner-spin-button]:appearance-none`}
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
				className="grid size-12 shrink-0 place-items-center rounded-control border-[1.5px] border-rule-strong bg-sheet text-ink hover:bg-sheet-sunk disabled:border-rule disabled:text-ink-faint"
			>
				<Plus className="size-5" aria-hidden="true" />
			</button>
		</div>
	);
}

// Two or three mutually exclusive options (radio semantics).
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
		<fieldset className="flex gap-1 rounded-control border-[1.5px] border-rule-strong bg-sheet-sunk p-1">
			<legend className="sr-only">{label}</legend>
			{options.map((option) => (
				<label
					key={option.value}
					className="flex min-h-10 flex-1 cursor-pointer items-center justify-center rounded-[7px] px-3 text-center font-medium text-ink-soft transition-colors has-checked:bg-ink has-checked:text-on-ink has-focus-visible:outline-3 has-focus-visible:outline-focus"
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
				<span className="font-medium">{label}</span>
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
				className={`relative mt-0.5 h-8 w-13 shrink-0 rounded-full border-[1.5px] transition-colors ${checked ? "border-balance bg-balance" : "border-rule-strong bg-sheet-sunk"}`}
			>
				<span
					className={`absolute top-1/2 size-6 -translate-y-1/2 rounded-full bg-sheet shadow-[0_1px_3px_rgb(0_0_0/0.3)] transition-[left] duration-200 ease-out ${checked ? "left-[calc(100%-1.625rem)]" : "left-0.5"}`}
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
		info: "bg-sheet-sunk border-rule text-ink",
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
			className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-callout border-[1.5px] border-rule bg-sheet p-0 text-ink shadow-lift open:motion-safe:animate-rise"
		>
			<div className="flex flex-col gap-3 p-5">
				<h2 id={titleId} className="text-xl font-semibold">
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
			<h2 id={id} className="text-xl leading-tight font-semibold leading-tight">
				{children}
			</h2>
			{action}
		</div>
	);
}
