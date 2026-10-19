// /recuperar: the last resort when both parents lost access. The family's
// recovery code resets one parent's password; it is single-use, so the api
// returns a new code, shown here exactly once.
import { type SubmitEvent, useId, useState } from "react";
import { CopyCode } from "../components/CopyCode";
import { Button, Field, inputClass, Notice } from "../components/ui";
import { api, call } from "../lib/api";
import { errorMessage } from "../lib/errors";
import { PublicFrame } from "./PublicFrame";

export default function RecoveryPage() {
	const emailId = useId();
	const codeId = useId();
	const passwordId = useId();
	const repeatId = useId();
	const [email, setEmail] = useState("");
	const [code, setCode] = useState("");
	const [password, setPassword] = useState("");
	const [repeat, setRepeat] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [newCode, setNewCode] = useState<string | null>(null);

	const mismatch = repeat !== "" && repeat !== password;
	const tooShort = password !== "" && password.length < 8;

	async function submit(event: SubmitEvent<HTMLFormElement>) {
		event.preventDefault();
		if (mismatch || tooShort) {
			return;
		}
		setBusy(true);
		setError(null);
		try {
			const result = await call(
				api["recovery-code"].use.$post({
					json: {
						email: email.trim(),
						code: code.trim(),
						newPassword: password,
					},
				}),
			);
			setNewCode(result.recoveryCode);
		} catch (cause) {
			setError(errorMessage(cause));
		} finally {
			setBusy(false);
		}
	}

	if (newCode !== null) {
		return (
			<PublicFrame
				title="Listo: ya puedes entrar"
				lead="Tu contraseña cambió. El código que usaste ya no sirve; este es el nuevo."
			>
				<CopyCode code={newCode} />
				<Notice>
					Guárdalo en un lugar seguro, fuera de este teléfono. Solo se muestra
					esta vez.
				</Notice>
				<a
					href="/login"
					className="inline-flex min-h-12 items-center justify-center rounded-control bg-ink px-4 font-medium text-white no-underline hover:bg-[#2a3038]"
				>
					Ir a entrar
				</a>
			</PublicFrame>
		);
	}

	return (
		<PublicFrame
			title="Recuperar el acceso"
			lead="Con el código de recuperación de la familia, uno de los padres elige una contraseña nueva."
			footer={
				<p>
					<a href="/login" className="font-medium text-ink underline">
						Volver a entrar
					</a>
				</p>
			}
		>
			{error && <Notice tone="error">{error}</Notice>}
			<form
				className="flex flex-col gap-4"
				onSubmit={(event) => void submit(event)}
				noValidate
			>
				<Field label="Tu correo" htmlFor={emailId}>
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
				<Field
					label="Código de recuperación"
					htmlFor={codeId}
					hint="El que guardaron al configurar el hogar."
				>
					<input
						id={codeId}
						autoComplete="off"
						autoCapitalize="characters"
						spellCheck={false}
						required
						value={code}
						onChange={(event) => setCode(event.target.value)}
						className={`${inputClass} tabular tracking-[0.04em]`}
					/>
				</Field>
				<Field
					label="Contraseña nueva"
					htmlFor={passwordId}
					hint="De 8 caracteres o más."
					error={tooShort ? "Le faltan caracteres: son 8 como mínimo." : null}
				>
					<input
						id={passwordId}
						type="password"
						autoComplete="new-password"
						required
						value={password}
						aria-invalid={tooShort || undefined}
						onChange={(event) => setPassword(event.target.value)}
						className={inputClass}
					/>
				</Field>
				<Field
					label="Repite la contraseña"
					htmlFor={repeatId}
					error={mismatch ? "No coincide con la de arriba." : null}
				>
					<input
						id={repeatId}
						type="password"
						autoComplete="new-password"
						required
						value={repeat}
						aria-invalid={mismatch || undefined}
						onChange={(event) => setRepeat(event.target.value)}
						className={inputClass}
					/>
				</Field>
				<Button
					type="submit"
					variant="primary"
					block
					busy={busy}
					disabled={
						email.trim() === "" ||
						code.trim() === "" ||
						password === "" ||
						repeat === "" ||
						mismatch ||
						tooShort
					}
				>
					Cambiar la contraseña
				</Button>
			</form>
		</PublicFrame>
	);
}
