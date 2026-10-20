// Cuentas: the child's login (create it, reset the PIN, see and close the
// devices where it is signed in), the parents' passwords, this device's
// notifications and the family's recovery code.
import { useQueryClient } from "@tanstack/react-query";
import {
	KeyRound,
	Lock,
	LogOut,
	MonitorSmartphone,
	RefreshCw,
} from "lucide-react";
import { useId, useState } from "react";
import { CopyCode } from "../components/CopyCode";
import { useToast } from "../components/toast";
import {
	Button,
	Callout,
	ConfirmDialog,
	Field,
	inputClass,
	LoadingBricks,
	Notice,
} from "../components/ui";
import { ApiError, api, call } from "../lib/api";
import { authClient } from "../lib/auth";
import { serverNow } from "../lib/clock";
import { labelFromUserAgent } from "../lib/device";
import { errorMessage } from "../lib/errors";
import { dateTimeText, relativeDayText, timeText } from "../lib/format";
import { keys, useChildLogins } from "../lib/queries";
import { signOut } from "../lib/session";
import type { HouseholdChild } from "../lib/types";
import { useParents } from "./context";
import { PushToggle } from "./PushSetting";
import { useCommand } from "./useCommand";

const PIN_PATTERN = /^\d{6,12}$/;

// A form that stays folded behind its button until needed, and folds again
// once saved: the page reads as a list of accounts, not a wall of fields.
function Reveal({
	label,
	children,
}: {
	label: string;
	children: (close: () => void) => React.ReactNode;
}) {
	const [open, setOpen] = useState(false);
	return open ? (
		children(() => setOpen(false))
	) : (
		<div>
			<Button
				size="sm"
				icon={<KeyRound className="size-4" aria-hidden="true" />}
				onClick={() => setOpen(true)}
			>
				{label}
			</Button>
		</div>
	);
}

// A new secret typed twice. `kind` decides the keyboard and the rule.
function SecretPair({
	kind,
	submitLabel,
	busy,
	onSubmit,
	onCancel,
	extra,
}: {
	kind: "pin" | "password";
	submitLabel: string;
	busy: boolean;
	onSubmit: (secret: string, reset: () => void) => void;
	onCancel?: () => void;
	extra?: React.ReactNode;
}) {
	const id = useId();
	const [value, setValue] = useState("");
	const [repeat, setRepeat] = useState("");
	const pin = kind === "pin";
	const valid = pin
		? PIN_PATTERN.test(value)
		: value.length >= 8 && value.length <= 128;
	const mismatch = repeat !== "" && repeat !== value;
	const inputProps = pin
		? {
				inputMode: "numeric" as const,
				pattern: "[0-9]*",
				maxLength: 12,
				autoComplete: "off",
			}
		: { autoComplete: "new-password", maxLength: 128 };
	return (
		<form
			className="flex flex-col gap-4"
			onSubmit={(event) => {
				event.preventDefault();
				if (valid && !mismatch) {
					onSubmit(value, () => {
						setValue("");
						setRepeat("");
					});
				}
			}}
		>
			{extra}
			<div className="grid gap-4 sm:grid-cols-2">
				<Field
					label={pin ? "PIN nuevo" : "Contraseña nueva"}
					htmlFor={`${id}-new`}
					hint={pin ? "De 6 a 12 números." : "De 8 caracteres o más."}
					error={
						value !== "" && !valid
							? pin
								? "Solo números, de 6 a 12."
								: "Le faltan caracteres: son 8 como mínimo."
							: null
					}
				>
					<input
						id={`${id}-new`}
						type="password"
						required
						value={value}
						aria-invalid={(value !== "" && !valid) || undefined}
						onChange={(event) =>
							setValue(
								pin
									? event.target.value.replace(/\D/g, "")
									: event.target.value,
							)
						}
						className={`${inputClass} ${pin ? "tabular tracking-[0.2em]" : ""}`}
						{...inputProps}
					/>
				</Field>
				<Field
					label={pin ? "Repite el PIN" : "Repite la contraseña"}
					htmlFor={`${id}-repeat`}
					error={mismatch ? "No coincide." : null}
				>
					<input
						id={`${id}-repeat`}
						type="password"
						required
						value={repeat}
						aria-invalid={mismatch || undefined}
						onChange={(event) =>
							setRepeat(
								pin
									? event.target.value.replace(/\D/g, "")
									: event.target.value,
							)
						}
						className={`${inputClass} ${pin ? "tabular tracking-[0.2em]" : ""}`}
						{...inputProps}
					/>
				</Field>
			</div>
			<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
				{onCancel && (
					<Button variant="quiet" disabled={busy} onClick={onCancel}>
						Cancelar
					</Button>
				)}
				<Button
					type="submit"
					variant="primary"
					busy={busy}
					disabled={!valid || repeat !== value}
				>
					{submitLabel}
				</Button>
			</div>
		</form>
	);
}

function CreateChild() {
	const id = useId();
	const client = useQueryClient();
	const [name, setName] = useState("");
	const [username, setUsername] = useState("");
	const usernameOk = /^[a-z0-9_.]{3,30}$/.test(username);
	const create = useCommand(
		(input: { pin: string }) =>
			call(
				api.children.$post({
					json: { name: name.trim(), username, pin: input.pin },
				}),
			),
		{
			refresh: false,
			success: (result) => `Cuenta de ${result.child.name} creada`,
			onSuccess: () => void client.invalidateQueries({ queryKey: keys.me }),
		},
	);
	return (
		<Callout
			className="flex flex-col gap-4 p-4 sm:p-5"
			aria-labelledby={`${id}-title`}
		>
			<div className="flex flex-col gap-1">
				<h2 id={`${id}-title`} className="text-xl leading-tight font-semibold">
					Crear la cuenta del niño
				</h2>
				<p className="text-ink-soft">
					Entrará con su usuario y un PIN desde cualquier navegador. Solo podrá
					ver su saldo y pedir.
				</p>
			</div>
			<SecretPair
				kind="pin"
				submitLabel="Crear la cuenta"
				busy={create.isPending}
				onSubmit={(pin) => create.mutate({ pin })}
				extra={
					<div className="grid gap-4 sm:grid-cols-2">
						<Field label="Nombre" htmlFor={`${id}-name`}>
							<input
								id={`${id}-name`}
								required
								maxLength={100}
								autoComplete="off"
								value={name}
								onChange={(event) => setName(event.target.value)}
								className={inputClass}
							/>
						</Field>
						<Field
							label="Usuario"
							htmlFor={`${id}-username`}
							hint="Letras, números, puntos o guiones bajos (3 a 30)."
							error={
								username !== "" && !usernameOk
									? "Usa solo minúsculas, números, puntos o _ (3 a 30)."
									: null
							}
						>
							<input
								id={`${id}-username`}
								required
								autoCapitalize="none"
								autoComplete="off"
								spellCheck={false}
								maxLength={30}
								value={username}
								aria-invalid={(username !== "" && !usernameOk) || undefined}
								onChange={(event) =>
									setUsername(event.target.value.toLowerCase().trim())
								}
								className={inputClass}
							/>
						</Field>
					</div>
				}
			/>
		</Callout>
	);
}

function ChildDevices({ child }: { child: HouseholdChild }) {
	const { timeZone } = useParents();
	const logins = useChildLogins(child.id);
	const client = useQueryClient();
	const [confirmAll, setConfirmAll] = useState(false);
	const refresh = () =>
		client.invalidateQueries({ queryKey: keys.logins(child.id) });
	const childId = child.id;
	const closeOne = useCommand(
		(loginId: string) =>
			call(
				api.children[":childId"].logins[":loginId"].$delete({
					param: { childId, loginId },
				}),
			),
		{
			refresh: false,
			success: "Sesión cerrada en ese dispositivo",
			onSuccess: () => void refresh(),
		},
	);
	const closeAll = useCommand(
		() => call(api.children[":childId"].logins.$delete({ param: { childId } })),
		{
			refresh: false,
			success: (result) =>
				result.revoked === 1
					? "Sesión cerrada en 1 dispositivo"
					: `Sesión cerrada en ${result.revoked} dispositivos`,
			onSuccess: () => {
				setConfirmAll(false);
				void refresh();
			},
		},
	);
	const list = logins.data?.logins;
	const now = serverNow();

	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-wrap items-end justify-between gap-2">
				<h3 className="font-semibold">Dónde tiene la sesión abierta</h3>
				{list !== undefined && list.length > 1 && (
					<Button
						size="sm"
						variant="quiet"
						icon={<LogOut className="size-4" aria-hidden="true" />}
						onClick={() => setConfirmAll(true)}
					>
						Cerrar en todos
					</Button>
				)}
			</div>
			{list === undefined ? (
				logins.error ? (
					<Notice tone="error">{errorMessage(logins.error)}</Notice>
				) : (
					<LoadingBricks label="Buscando dispositivos…" />
				)
			) : list.length === 0 ? (
				<p className="text-ink-soft">
					Ningún dispositivo: {child.name} no tiene la sesión abierta en ningún
					lado.
				</p>
			) : (
				<ul className="flex flex-col">
					{list.map((login) => (
						<li
							key={login.id}
							className="flex items-center justify-between gap-3 border-t-[1.5px] border-rule py-3 first:border-t-0 first:pt-0"
						>
							<div className="flex min-w-0 items-start gap-3">
								<MonitorSmartphone
									className="mt-0.5 size-5 shrink-0 text-ink-soft"
									aria-hidden="true"
								/>
								<div className="min-w-0">
									<p className="font-medium">
										{labelFromUserAgent(login.userAgent)}
									</p>
									<p className="text-[0.9375rem] text-ink-soft">
										Entró {relativeDayText(login.createdAt, now, timeZone)} a
										las {timeText(login.createdAt, timeZone)}
										{" · "}último uso:{" "}
										{relativeDayText(login.updatedAt, now, timeZone)}
									</p>
								</div>
							</div>
							<Button
								size="sm"
								busy={closeOne.isPending && closeOne.variables === login.id}
								disabled={closeOne.isPending || closeAll.isPending}
								onClick={() => closeOne.mutate(login.id)}
							>
								Cerrar
							</Button>
						</li>
					))}
				</ul>
			)}
			<ConfirmDialog
				open={confirmAll}
				title={`¿Cerrar la sesión de ${child.name} en todos lados?`}
				confirmLabel="Cerrar en todos"
				busy={closeAll.isPending}
				onClose={() => setConfirmAll(false)}
				onConfirm={() => closeAll.mutate(undefined)}
			>
				Tendrá que volver a entrar con su usuario y su PIN en cada dispositivo.
			</ConfirmDialog>
		</div>
	);
}

function ChildAccount({ child }: { child: HouseholdChild }) {
	const { timeZone } = useParents();
	const client = useQueryClient();
	const childId = child.id;
	const locked =
		child.lockedUntil !== null && Date.parse(child.lockedUntil) > serverNow();
	const resetPin = useCommand(
		(input: { pin: string; reset: () => void }) =>
			call(
				api.children[":childId"].pin.$put({
					param: { childId },
					json: { pin: input.pin },
				}),
			),
		{
			refresh: false,
			success: locked
				? "PIN cambiado: ya puede volver a entrar"
				: "PIN cambiado",
			onSuccess: (_result, input) => {
				input.reset();
				void client.invalidateQueries({ queryKey: keys.me });
			},
		},
	);
	return (
		<Callout
			className="flex flex-col gap-5 p-4 sm:p-5"
			aria-labelledby="child-title"
		>
			<div className="flex flex-col gap-1">
				<h2 id="child-title" className="text-xl leading-tight font-semibold">
					Cuenta de {child.name}
				</h2>
				<p className="text-ink-soft">
					Entra con su usuario y su PIN. Solo ve su saldo y pide.
				</p>
			</div>
			{locked && (
				<Notice tone="error">
					<span className="flex items-center gap-2">
						<Lock className="size-4.5 shrink-0" aria-hidden="true" />
						Bloqueada hasta las {timeText(child.lockedUntil ?? "", timeZone)}{" "}
						por 5 PIN incorrectos seguidos. Un PIN nuevo la desbloquea.
					</span>
				</Notice>
			)}
			<div className="flex flex-col gap-3">
				<div className="flex flex-col gap-0.5">
					<h3 className="font-semibold">PIN</h3>
					<p className="text-ink-soft">
						Si lo olvidó, ponle uno nuevo. También quita el bloqueo.
					</p>
				</div>
				<Reveal label="Cambiar su PIN">
					{(close) => (
						<SecretPair
							kind="pin"
							submitLabel="Guardar PIN"
							busy={resetPin.isPending}
							onCancel={close}
							onSubmit={(pin, reset) =>
								resetPin.mutate({
									pin,
									reset: () => {
										reset();
										close();
									},
								})
							}
						/>
					)}
				</Reveal>
			</div>
			<div className="border-t-[1.5px] border-rule pt-5">
				<ChildDevices child={child} />
			</div>
		</Callout>
	);
}

function MyPassword() {
	const toast = useToast();
	const id = useId();
	const [current, setCurrent] = useState("");
	const [busy, setBusy] = useState(false);
	return (
		<div className="flex flex-col gap-3">
			<h3 className="font-semibold">Mi contraseña</h3>
			<Reveal label="Cambiar mi contraseña">
				{(close) => (
					<SecretPair
						onCancel={close}
						kind="password"
						submitLabel="Cambiar mi contraseña"
						busy={busy}
						extra={
							<Field label="Contraseña actual" htmlFor={`${id}-current`}>
								<input
									id={`${id}-current`}
									type="password"
									autoComplete="current-password"
									required
									value={current}
									onChange={(event) => setCurrent(event.target.value)}
									className={inputClass}
								/>
							</Field>
						}
						onSubmit={(newPassword, reset) => {
							setBusy(true);
							void authClient
								.changePassword({
									currentPassword: current,
									newPassword,
									revokeOtherSessions: false,
								})
								.then((result) => {
									if (result.error) {
										const code = result.error.code ?? "";
										toast.show(
											"error",
											code === "CREDENTIAL_ACCOUNT_NOT_FOUND"
												? "Entras con Google y no tienes contraseña. El otro padre puede ponerte una."
												: errorMessage(
														new ApiError(
															result.error.status,
															code,
															result.error.message ?? "",
														),
													),
										);
										return;
									}
									reset();
									setCurrent("");
									close();
									toast.show("success", "Tu contraseña cambió");
								})
								.finally(() => setBusy(false));
						}}
					/>
				)}
			</Reveal>
		</div>
	);
}

function OtherParentPassword({
	parent,
}: {
	parent: { id: string; name: string };
}) {
	const parentId = parent.id;
	const reset = useCommand(
		(input: { password: string; clear: () => void }) =>
			call(
				api.parents[":parentId"].password.$put({
					param: { parentId },
					json: { newPassword: input.password },
				}),
			),
		{
			refresh: false,
			success: `Contraseña de ${parent.name} cambiada. Díselo en persona.`,
			onSuccess: (_result, input) => input.clear(),
		},
	);
	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-col gap-0.5">
				<h3 className="font-semibold">Contraseña de {parent.name}</h3>
				<p className="text-ink-soft">
					Si la olvidó, ponle una nueva y díselo en persona.
				</p>
			</div>
			<Reveal label={`Cambiar la contraseña de ${parent.name}`}>
				{(close) => (
					<SecretPair
						kind="password"
						submitLabel={`Cambiar la de ${parent.name}`}
						busy={reset.isPending}
						onCancel={close}
						onSubmit={(password, clear) =>
							reset.mutate({
								password,
								clear: () => {
									clear();
									close();
								},
							})
						}
					/>
				)}
			</Reveal>
		</div>
	);
}

function RecoveryCode() {
	const { household, timeZone } = useParents();
	const client = useQueryClient();
	const [confirm, setConfirm] = useState(false);
	const [code, setCode] = useState<string | null>(null);
	const createdAt = household.family.recoveryCodeCreatedAt;
	const regenerate = useCommand(() => call(api["recovery-code"].$post()), {
		refresh: false,
		onSuccess: (result) => {
			setConfirm(false);
			setCode(result.recoveryCode);
			void client.invalidateQueries({ queryKey: keys.me });
		},
	});
	return (
		<Callout
			className="flex flex-col gap-4 p-4 sm:p-5"
			aria-labelledby="recovery-title"
		>
			<div className="flex flex-col gap-1">
				<h2 id="recovery-title" className="text-xl leading-tight font-semibold">
					Código de recuperación
				</h2>
				<p className="text-ink-soft">
					El último recurso si los dos pierden el acceso: con él, un padre pone
					una contraseña nueva en «Recuperar el acceso». Sirve una sola vez.
				</p>
			</div>
			{code !== null ? (
				<>
					<CopyCode code={code} />
					<Notice>
						Guárdalo fuera de este teléfono (impreso o en un gestor de
						contraseñas) y avísale al otro padre: el código anterior ya no
						sirve. No se vuelve a mostrar.
					</Notice>
					<div>
						<Button variant="primary" onClick={() => setCode(null)}>
							Ya lo guardé
						</Button>
					</div>
				</>
			) : (
				<div className="flex flex-wrap items-center justify-between gap-3">
					<p className="flex items-center gap-2">
						<KeyRound className="size-5 text-ink-soft" aria-hidden="true" />
						{createdAt
							? `Creado el ${dateTimeText(createdAt, timeZone)}.`
							: "Todavía no hay un código."}
					</p>
					<Button
						icon={<RefreshCw className="size-4.5" aria-hidden="true" />}
						onClick={() => setConfirm(true)}
					>
						{createdAt ? "Generar uno nuevo" : "Generar código"}
					</Button>
				</div>
			)}
			<ConfirmDialog
				open={confirm}
				title="¿Generar un código nuevo?"
				confirmLabel="Generar"
				tone={createdAt ? "danger" : "primary"}
				busy={regenerate.isPending}
				onClose={() => setConfirm(false)}
				onConfirm={() => regenerate.mutate(undefined)}
			>
				{createdAt
					? "El código que tienen guardado deja de servir en este momento. El nuevo se muestra una sola vez."
					: "Se muestra una sola vez: tenlo a mano para guardarlo."}
			</ConfirmDialog>
		</Callout>
	);
}

export function Accounts() {
	const { household, child, parentId, parentName } = useParents();
	const others = household.parents.filter((parent) => parent.id !== parentId);
	return (
		<div className="mx-auto flex max-w-3xl flex-col gap-5">
			<div className="flex flex-col gap-1">
				<h1 className="text-[1.75rem] leading-tight font-bold tracking-[-0.01em]">
					Cuentas
				</h1>
				<p className="text-ink-soft">{household.family.name}</p>
			</div>

			{child === undefined ? (
				<CreateChild />
			) : (
				<ChildAccount key={child.id} child={child} />
			)}

			<Callout
				className="flex flex-col gap-5 p-4 sm:p-5"
				aria-labelledby="parents-title"
			>
				<div className="flex flex-col gap-1">
					<h2
						id="parents-title"
						className="text-xl leading-tight font-semibold"
					>
						Padres
					</h2>
					<p className="text-ink-soft">
						Entraste como {parentName}. Sin registro público: solo entran los
						padres de la familia.
					</p>
				</div>
				<MyPassword />
				{others.map((parent) => (
					<div key={parent.id} className="border-t-[1.5px] border-rule pt-5">
						<OtherParentPassword parent={parent} />
					</div>
				))}
			</Callout>

			<Callout
				className="flex flex-col gap-3 p-4 sm:p-5"
				aria-labelledby="push-title"
			>
				<div className="flex flex-col gap-1">
					<h2 id="push-title" className="text-xl leading-tight font-semibold">
						Avisos en este dispositivo
					</h2>
					<p className="text-ink-soft">
						Solicitudes, tareas reportadas, aviso previo, fin y cierres
						automáticos.
					</p>
				</div>
				<PushToggle />
			</Callout>

			<RecoveryCode />

			<div className="flex justify-center pb-2 lg:hidden">
				<Button
					variant="quiet"
					icon={<LogOut className="size-5" aria-hidden="true" />}
					onClick={() => void signOut()}
				>
					Cerrar sesión en este dispositivo
				</Button>
			</div>
		</div>
	);
}
