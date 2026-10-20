// /nino/entrar: the child signs in with their username and PIN. Two numbered
// steps (username, PIN); this browser remembers the username, never the PIN,
// so next time it opens straight on the keypad. Five wrong PINs in a row
// lock the account for a while: the page says how long, and counts it down.
import { Lock, Timer } from "lucide-react";
import {
	type SubmitEvent,
	useCallback,
	useEffect,
	useId,
	useState,
} from "react";
import { childErrorMessage } from "../child/errors";
import { StepTitle } from "../components/StepTitle";
import { Button, Field, inputClass, Notice } from "../components/ui";
import { ApiError, api, call } from "../lib/api";
import { authClient } from "../lib/auth";
import { useServerNow } from "../lib/clock";
import { countdown } from "../lib/format";
import { homeFor, safeNext } from "../lib/guard";
import { PIN_MAX, PIN_MIN, PinPad, PinStuds } from "./PinPad";
import { PublicFrame } from "./PublicFrame";

const USERNAME_KEY = "timecraft:child-username";

function storedUsername(): string | null {
	try {
		return window.localStorage.getItem(USERNAME_KEY);
	} catch {
		return null;
	}
}

function rememberUsername(username: string): void {
	try {
		window.localStorage.setItem(USERNAME_KEY, username);
	} catch {
		// Private mode: it is typed again next time.
	}
}

function readNext(): string | null {
	return new URLSearchParams(window.location.search).get("next");
}

// A wait the server imposed: the lockout after wrong PINs, or Better Auth's
// limit on attempts per minute. `until` is on the server's clock; `offsetMs`
// is how far the server's clock is from this device's (from its Date header),
// so the countdown is right even on a phone with the wrong time.
interface Wait {
	kind: "locked" | "rate";
	until: number;
	offsetMs: number;
}

interface SignInFailure {
	status: number;
	code?: string;
	message?: string;
	lockedUntil?: string;
}

function WaitPanel({ wait, remainingMs }: { wait: Wait; remainingMs: number }) {
	const locked = wait.kind === "locked";
	const Icon = locked ? Lock : Timer;
	return (
		<div
			role="status"
			className="flex flex-col items-center gap-2 rounded-control border-[1.5px] border-rule bg-sheet-sunk px-4 py-4 text-center"
		>
			<Icon className="size-6 text-ink-soft" aria-hidden="true" />
			<p className="text-lg leading-snug font-semibold">
				{locked ? "Tu cuenta descansa un rato" : "Muchos intentos seguidos"}
			</p>
			<p className="text-ink-soft">
				{locked
					? "Hubo varios PIN incorrectos seguidos."
					: "Probaste muchas veces en poco tiempo."}
			</p>
			<p className="mt-1 font-medium">Podrás probar otra vez en</p>
			<p className="tabular text-[2.5rem] leading-none font-extrabold tracking-[-0.02em]">
				{countdown(Math.max(0, remainingMs))}
			</p>
			{locked && (
				<p className="text-[0.9375rem] text-ink-soft">
					¿No recuerdas tu PIN? Pídele a mamá o papá que te pongan uno nuevo.
				</p>
			)}
		</div>
	);
}

export default function ChildLoginPage() {
	const [next] = useState(readNext);
	const [remembered] = useState(storedUsername);
	const usernameId = useId();
	const stepId = useId();
	const [username, setUsername] = useState(remembered ?? "");
	const [step, setStep] = useState<"username" | "pin">(
		remembered ? "pin" : "username",
	);
	const [pin, setPin] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [info, setInfo] = useState<string | null>(null);
	const [shake, setShake] = useState(0);
	const [wait, setWait] = useState<Wait | null>(null);
	// Ticks every second (the server offset is unknown before signing in;
	// each wait carries its own).
	const now = useServerNow();
	const remainingMs = wait === null ? 0 : wait.until - (now + wait.offsetMs);
	const waiting = wait !== null && remainingMs > 0;

	// Already signed in: straight to your side.
	useEffect(() => {
		call(api.me.$get())
			.then((household) => {
				window.location.replace(safeNext(next, household.me.kind));
			})
			.catch(() => undefined);
	}, [next]);

	// The wait is over: the keypad comes back.
	useEffect(() => {
		if (wait !== null && remainingMs <= 0) {
			setWait(null);
			setError(null);
			setInfo("Ya puedes probar otra vez.");
		}
	}, [wait, remainingMs]);

	const submit = useCallback(async () => {
		if (busy || waiting || pin.length < PIN_MIN) {
			return;
		}
		setBusy(true);
		setError(null);
		setInfo(null);
		let retryAfter: number | null = null;
		let serverDate: number | null = null;
		const result = await authClient.signIn.username(
			{ username, password: pin },
			{
				onError: (context) => {
					const header = context.response.headers.get("X-Retry-After");
					retryAfter = header === null ? null : Number(header);
					const date = context.response.headers.get("date");
					serverDate = date === null ? null : Date.parse(date);
				},
			},
		);
		if (result.error) {
			const failure = result.error as SignInFailure;
			setBusy(false);
			setPin("");
			const offsetMs =
				serverDate === null || Number.isNaN(serverDate)
					? 0
					: serverDate - Date.now();
			if (failure.code === "child_locked") {
				const until = Date.parse(failure.lockedUntil ?? "");
				setWait({
					kind: "locked",
					until: Number.isNaN(until) ? Date.now() + 15 * 60_000 : until,
					offsetMs,
				});
			} else if (failure.status === 429) {
				const seconds =
					retryAfter !== null && Number.isFinite(retryAfter) ? retryAfter : 60;
				setWait({
					kind: "rate",
					until: Date.now() + seconds * 1000,
					offsetMs: 0,
				});
			} else if (
				failure.code === "INVALID_USERNAME_OR_PASSWORD" ||
				failure.status === 401
			) {
				setError(
					"Ese usuario y ese PIN no coinciden. Revisa tu PIN y prueba otra vez.",
				);
				setShake((count) => count + 1);
			} else {
				setError(
					childErrorMessage(
						new ApiError(
							failure.status,
							failure.code ?? `http_${failure.status}`,
							failure.message ?? "",
						),
					),
				);
			}
			return;
		}
		rememberUsername(username);
		try {
			const household = await call(api.me.$get());
			window.location.assign(
				household.me.kind === "child"
					? safeNext(next, "child")
					: homeFor(household.me.kind),
			);
		} catch (cause) {
			if (cause instanceof ApiError && cause.code === "no_role") {
				await authClient.signOut().catch(() => undefined);
				setError("Esta cuenta no pertenece a ninguna familia de Time Craft.");
				setBusy(false);
			} else {
				window.location.assign(homeFor("child"));
			}
		}
	}, [busy, waiting, pin, username, next]);

	const typeDigit = useCallback((digit: string) => {
		setError(null);
		setInfo(null);
		setPin((current) =>
			current.length >= PIN_MAX ? current : `${current}${digit}`,
		);
	}, []);
	const deleteDigit = useCallback(() => {
		setPin((current) => current.slice(0, -1));
	}, []);

	// The PC's keyboard works too: digits, Backspace and Enter.
	useEffect(() => {
		if (step !== "pin" || waiting) {
			return;
		}
		const onKey = (event: KeyboardEvent) => {
			if (event.metaKey || event.ctrlKey || event.altKey) {
				return;
			}
			if (/^[0-9]$/.test(event.key)) {
				event.preventDefault();
				typeDigit(event.key);
			} else if (event.key === "Backspace") {
				event.preventDefault();
				deleteDigit();
			} else if (event.key === "Enter") {
				event.preventDefault();
				void submit();
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [step, waiting, typeDigit, deleteDigit, submit]);

	function chooseUsername(event: SubmitEvent<HTMLFormElement>) {
		event.preventDefault();
		// Read the form itself: the browser's autofill may not reach state.
		const typed = String(
			new FormData(event.currentTarget).get("username") ?? "",
		).trim();
		if (typed === "") {
			setError("Escribe tu usuario.");
			return;
		}
		setUsername(typed);
		setError(null);
		setInfo(null);
		setPin("");
		setStep("pin");
	}

	function changeUser() {
		setStep("username");
		setUsername("");
		setPin("");
		setError(null);
		setInfo(null);
	}

	const footer = (
		<p>
			¿Eres mamá o papá?{" "}
			<a href="/login" className="font-medium text-ink underline">
				Entra con tu correo
			</a>
		</p>
	);

	if (step === "username") {
		return (
			<PublicFrame
				title="¡Hola!"
				lead="Entra para ver tu tiempo y pedir más."
				footer={footer}
			>
				{error && <Notice tone="error">{error}</Notice>}
				<form
					className="flex flex-col gap-4"
					onSubmit={chooseUsername}
					noValidate
				>
					<StepTitle
						number={1}
						id={stepId}
						hint="El que te dieron mamá o papá."
					>
						Tu usuario
					</StepTitle>
					<Field label="Usuario" htmlFor={usernameId}>
						<input
							id={usernameId}
							name="username"
							type="text"
							autoComplete="username"
							autoCapitalize="none"
							autoCorrect="off"
							spellCheck={false}
							enterKeyHint="next"
							required
							value={username}
							onChange={(event) => setUsername(event.target.value)}
							className={`${inputClass} min-h-14 text-lg`}
						/>
					</Field>
					<Button type="submit" variant="primary" block className="min-h-14">
						Siguiente
					</Button>
				</form>
			</PublicFrame>
		);
	}

	return (
		<PublicFrame
			title={`¡Hola, ${username}!`}
			lead={
				<>
					¿No eres {username}?{" "}
					<button
						type="button"
						onClick={changeUser}
						className="-mx-1 rounded-control px-1 font-medium text-ink underline underline-offset-4"
					>
						Cambiar
					</button>
				</>
			}
			footer={footer}
		>
			<StepTitle number={2} id={stepId} hint="Tócalo en el teclado.">
				Tu PIN
			</StepTitle>
			{waiting && wait !== null ? (
				// The keypad steps aside until the wait is over.
				<WaitPanel wait={wait} remainingMs={remainingMs} />
			) : (
				<>
					<PinStuds length={pin.length} shake={shake} />
					{error && <Notice tone="error">{error}</Notice>}
					{info && <Notice tone="success">{info}</Notice>}
					<PinPad
						onDigit={typeDigit}
						onDelete={deleteDigit}
						onSubmit={() => void submit()}
						canSubmit={pin.length >= PIN_MIN}
						canDelete={pin.length > 0}
						busy={busy}
					/>
				</>
			)}
		</PublicFrame>
	);
}
