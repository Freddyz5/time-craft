// /login for parents: Google first (where the environment has it), then email
// and password. There is no sign-up: only the parents the seed created get in.
import { GOOGLE_CLIENT_ID } from "astro:env/client";
import { Eye, EyeOff } from "lucide-react";
import { type SubmitEvent, useEffect, useId, useState } from "react";
import { Button, Field, inputClass, Notice } from "../components/ui";
import { ApiError, api, call } from "../lib/api";
import { authClient } from "../lib/auth";
import { errorMessage } from "../lib/errors";
import { homeFor, safeNext } from "../lib/guard";
import { PublicFrame } from "./PublicFrame";

const googleErrors: Record<string, string> = {
	signup_disabled:
		"Ese correo de Google no es de un padre de la familia. Usa el correo con el que te dieron de alta.",
};

function GoogleLogo() {
	return (
		<svg viewBox="0 0 48 48" className="size-5" aria-hidden="true">
			<path
				fill="#FFC107"
				d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
			/>
			<path
				fill="#FF3D00"
				d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
			/>
			<path
				fill="#4CAF50"
				d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"
			/>
			<path
				fill="#1976D2"
				d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
			/>
		</svg>
	);
}

function readParams() {
	const params = new URLSearchParams(window.location.search);
	return { next: params.get("next"), error: params.get("error") };
}

export default function LoginPage() {
	const [{ next, error: googleError }] = useState(readParams);
	const emailId = useId();
	const passwordId = useId();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [showPassword, setShowPassword] = useState(false);
	const [busy, setBusy] = useState<"email" | "google" | null>(null);
	const [error, setError] = useState<string | null>(
		googleError === null
			? null
			: (googleErrors[googleError] ??
					"No se pudo entrar con Google. Prueba otra vez o usa tu correo y contraseña."),
	);

	// Already signed in: straight to your side.
	useEffect(() => {
		call(api.me.$get())
			.then((household) => {
				window.location.replace(safeNext(next, household.me.kind));
			})
			.catch(() => undefined);
	}, [next]);

	async function afterSignIn() {
		try {
			const household = await call(api.me.$get());
			window.location.assign(safeNext(next, household.me.kind));
		} catch (cause) {
			if (cause instanceof ApiError && cause.code === "no_role") {
				await authClient.signOut().catch(() => undefined);
				setError("Esta cuenta no pertenece a ninguna familia de Time Craft.");
			} else {
				window.location.assign(homeFor("parent"));
			}
			setBusy(null);
		}
	}

	async function submit(event: SubmitEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		setBusy("email");
		const result = await authClient.signIn.email({
			email: email.trim(),
			password,
		});
		if (result.error) {
			setBusy(null);
			setError(
				errorMessage(
					new ApiError(
						result.error.status,
						result.error.status === 429
							? "TOO_MANY_REQUESTS"
							: (result.error.code ?? `http_${result.error.status}`),
						result.error.message ?? "",
					),
				),
			);
			return;
		}
		await afterSignIn();
	}

	async function google() {
		setError(null);
		setBusy("google");
		const target = safeNext(next, "parent");
		const result = await authClient.signIn.social({
			provider: "google",
			callbackURL: target,
			errorCallbackURL: "/login",
		});
		if (result.error) {
			setBusy(null);
			setError(
				"No se pudo abrir Google. Prueba otra vez o usa tu correo y contraseña.",
			);
		}
	}

	return (
		<PublicFrame
			title="Entrar"
			lead="Para los padres: el saldo, la sesión en vivo y las solicitudes del niño."
			footer={
				<p>
					¿Los dos perdieron el acceso?{" "}
					<a href="/recuperar" className="font-medium text-ink underline">
						Usar el código de recuperación
					</a>
				</p>
			}
		>
			{error && <Notice tone="error">{error}</Notice>}

			{GOOGLE_CLIENT_ID && (
				<>
					<Button
						variant="secondary"
						block
						icon={<GoogleLogo />}
						busy={busy === "google"}
						disabled={busy !== null}
						onClick={() => void google()}
					>
						Continuar con Google
					</Button>
					<div
						className="flex items-center gap-3 text-ink-faint"
						aria-hidden="true"
					>
						<span className="h-px flex-1 bg-rule" />
						<span className="text-[0.9375rem]">o con tu correo</span>
						<span className="h-px flex-1 bg-rule" />
					</div>
				</>
			)}

			<form
				className="flex flex-col gap-4"
				onSubmit={(event) => void submit(event)}
				noValidate
			>
				<Field label="Correo" htmlFor={emailId}>
					<input
						id={emailId}
						type="email"
						inputMode="email"
						autoComplete="email"
						required
						value={email}
						onChange={(event) => setEmail(event.target.value)}
						className={inputClass}
					/>
				</Field>
				<Field label="Contraseña" htmlFor={passwordId}>
					<div className="relative">
						<input
							id={passwordId}
							type={showPassword ? "text" : "password"}
							autoComplete="current-password"
							required
							value={password}
							onChange={(event) => setPassword(event.target.value)}
							className={`${inputClass} pr-12`}
						/>
						<button
							type="button"
							onClick={() => setShowPassword((shown) => !shown)}
							aria-label={
								showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
							}
							aria-pressed={showPassword}
							className="absolute top-1/2 right-1 grid size-10 -translate-y-1/2 place-items-center rounded-control text-ink-soft hover:bg-sheet-sunk hover:text-ink"
						>
							{showPassword ? (
								<EyeOff className="size-5" aria-hidden="true" />
							) : (
								<Eye className="size-5" aria-hidden="true" />
							)}
						</button>
					</div>
				</Field>
				<Button
					type="submit"
					variant="primary"
					block
					busy={busy === "email"}
					disabled={busy !== null || email.trim() === "" || password === ""}
				>
					Entrar
				</Button>
			</form>
		</PublicFrame>
	);
}
