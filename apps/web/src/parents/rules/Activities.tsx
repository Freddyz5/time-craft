// Reglas › Actividades: the family's list (Juego and TV come with it). The
// parents add one with a name, a colour and an icon, and say whether it
// shares the child's general quota or has its own; they rename or recolour
// any of them, and deactivate the ones they no longer use (nothing is
// deleted). The api keeps the quotas right; this only asks and shows.

import { useQueryClient } from "@tanstack/react-query";
import { Check, Plus, Power, PowerOff, SlidersHorizontal } from "lucide-react";
import { useId, useState } from "react";
import {
	Button,
	ConfirmDialog,
	Field,
	inputClass,
	MinutesStepper,
	Segmented,
} from "../../components/ui";
import {
	ACTIVITY_COLORS,
	ACTIVITY_ICONS,
	type ActivityColorKey,
	type ActivityIconKey,
	activityLook,
	bagMembers,
	lookKeys,
} from "../../lib/activity";
import { api, call } from "../../lib/api";
import { minutesText, namesText } from "../../lib/format";
import { keys } from "../../lib/queries";
import type { Activity, Policy } from "../../lib/types";
import { useCommand } from "../../lib/useCommand";
import { useParents } from "../context";
import { type Amount, TotalNote } from "./limits";

// The same limit as the api's (core: MAX_ACTIVE_ACTIVITIES).
const MAX_ACTIVE = 6;
const NAME_MAX = 30;

function useInvalidateActivities(childId: string) {
	const client = useQueryClient();
	return () =>
		Promise.all([
			client.invalidateQueries({ queryKey: keys.me }),
			client.invalidateQueries({ queryKey: keys.policies(childId) }),
			client.invalidateQueries({ queryKey: keys.policyHistory(childId) }),
			client.invalidateQueries({ queryKey: ["balance"] }),
		]);
}

// The activity as a round tile in its colour.
export function ActivityTile({
	activity,
	size = "md",
}: {
	activity: { code: string; color?: string | null; icon?: string | null };
	size?: "sm" | "md";
}) {
	const look = activityLook(activity);
	return (
		<span
			className={`grid shrink-0 place-items-center rounded-full text-white ${size === "sm" ? "size-8" : "size-10"}`}
			style={{ background: look.color }}
			aria-hidden="true"
		>
			<look.Icon className={size === "sm" ? "size-4.5" : "size-5"} />
		</span>
	);
}

// The colours as round swatches; the chosen one carries a check.
function ColorPicker({
	value,
	onChange,
}: {
	value: ActivityColorKey;
	onChange: (color: ActivityColorKey) => void;
}) {
	const name = useId();
	return (
		<fieldset className="flex flex-col gap-1.5">
			<legend className="mb-1.5 font-semibold">Color</legend>
			<div className="flex flex-wrap gap-2.5">
				{(Object.keys(ACTIVITY_COLORS) as ActivityColorKey[]).map((key) => (
					<label
						key={key}
						className="grid size-11 cursor-pointer place-items-center rounded-full text-white shadow-[inset_0_2px_0_rgb(255_255_255/0.25),0_3px_0_rgb(0_0_0/0.25)] has-checked:ring-3 has-checked:ring-ink has-checked:ring-offset-2 has-checked:ring-offset-sheet has-focus-visible:outline-3 has-focus-visible:outline-offset-4 has-focus-visible:outline-focus"
						style={{ background: ACTIVITY_COLORS[key].color }}
					>
						<input
							type="radio"
							name={name}
							value={key}
							checked={value === key}
							onChange={() => onChange(key)}
							className="sr-only"
						/>
						<span className="sr-only">{ACTIVITY_COLORS[key].label}</span>
						{value === key && <Check className="size-5" aria-hidden="true" />}
					</label>
				))}
			</div>
		</fieldset>
	);
}

// The icons in a tray sunk into the plate; the chosen one is an ink tile.
function IconPicker({
	value,
	onChange,
}: {
	value: ActivityIconKey;
	onChange: (icon: ActivityIconKey) => void;
}) {
	const name = useId();
	return (
		<fieldset className="flex flex-col gap-1.5">
			<legend className="mb-1.5 font-semibold">Ícono</legend>
			<div className="grid grid-cols-5 gap-1 rounded-control border-[1.5px] border-rule-strong bg-sheet-sunk p-1 pb-1.5 shadow-[inset_0_2px_0_rgb(0_0_0/0.07)]">
				{(Object.keys(ACTIVITY_ICONS) as ActivityIconKey[]).map((key) => {
					const { Icon, label } = ACTIVITY_ICONS[key];
					return (
						<label
							key={key}
							className="flex min-h-12 cursor-pointer items-center justify-center rounded-md text-ink-soft transition-colors hover:text-ink has-checked:bg-ink has-checked:text-on-ink has-checked:shadow-[0_3px_0_var(--color-ink-side)] has-focus-visible:outline-3 has-focus-visible:outline-focus"
						>
							<input
								type="radio"
								name={name}
								value={key}
								checked={value === key}
								onChange={() => onChange(key)}
								aria-label={label}
								className="sr-only"
							/>
							<Icon className="size-6" aria-hidden="true" />
						</label>
					);
				})}
			</div>
		</fieldset>
	);
}

interface Look {
	name: string;
	color: ActivityColorKey;
	icon: ActivityIconKey;
}

// Name, colour and icon, with the activity as it will look.
function LookFields({
	look,
	onChange,
	nameId,
}: {
	look: Look;
	onChange: (look: Look) => void;
	nameId: string;
}) {
	const preview = activityLook({
		code: "",
		color: look.color,
		icon: look.icon,
	});
	return (
		<div className="flex flex-col gap-5">
			<Field label="Nombre" htmlFor={nameId}>
				<input
					id={nameId}
					value={look.name}
					maxLength={NAME_MAX}
					onChange={(event) => onChange({ ...look, name: event.target.value })}
					className={inputClass}
					placeholder="Por ejemplo: Computadora"
					autoComplete="off"
				/>
			</Field>
			<ColorPicker
				value={look.color}
				onChange={(color) => onChange({ ...look, color })}
			/>
			<IconPicker
				value={look.icon}
				onChange={(icon) => onChange({ ...look, icon })}
			/>
			<p className="flex flex-wrap items-center gap-2 text-[0.9375rem] text-ink-soft">
				Así se verá:
				<span
					className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-bold text-white"
					style={{ background: preview.color }}
				>
					<preview.Icon className="size-4.5" aria-hidden="true" />
					{look.name.trim() || "Actividad"}
				</span>
			</p>
		</div>
	);
}

// The first colour no active activity uses yet.
function freeColor(activities: readonly Activity[]): ActivityColorKey {
	const used = new Set(
		activities.filter((a) => a.isActive).map((a) => lookKeys(a).color),
	);
	return (
		(Object.keys(ACTIVITY_COLORS) as ActivityColorKey[]).find(
			(key) => !used.has(key),
		) ?? "graphite"
	);
}

type QuotaChoice = "general" | "own";

// A new activity: its look and, for the child, which quota it uses.
function AddForm({
	policies,
	childId,
	onDone,
}: {
	policies: readonly Policy[];
	childId: string;
	onDone: () => void;
}) {
	const nameId = useId();
	const { activities, activeActivities, child } = useParents();
	const invalidate = useInvalidateActivities(childId);
	const [look, setLook] = useState<Look>({
		name: "",
		color: freeColor(activities),
		icon: "monitor",
	});
	const general = policies.find((policy) => policy.activityId === null);
	// Without a general quota (but with quotas), it needs its own.
	const needsOwn = policies.length > 0 && general === undefined;
	const [choice, setChoice] = useState<QuotaChoice>("general");
	const own = needsOwn || (policies.length > 0 && choice === "own");
	const [amount, setAmount] = useState<Amount>({ daily: 30, weekly: 150 });
	const name = look.name.trim() || "la nueva";
	const sharing = general
		? bagMembers(general, policies, activeActivities).map((a) => a.name)
		: [];
	const bags = policies.filter(
		(policy) =>
			policy.activityId === null ||
			activeActivities.some((a) => a.id === policy.activityId),
	);
	const before = bags.reduce(
		(total, bag) => ({
			daily: total.daily + bag.dailyLimitMinutes,
			weekly: total.weekly + bag.weeklyLimitMinutes,
		}),
		{ daily: 0, weekly: 0 },
	);

	const add = useCommand(
		() =>
			call(
				api.activities.$post({
					json: {
						name: look.name.trim(),
						color: look.color,
						icon: look.icon,
						...(own
							? {
									quota: {
										childId,
										dailyLimitMinutes: amount.daily,
										weeklyLimitMinutes: amount.weekly,
									},
								}
							: {}),
					},
				}),
			),
		{
			success: (result) => `«${result.activity.name}» agregada`,
			onSuccess: () => {
				onDone();
				void invalidate();
			},
		},
	);

	return (
		<form
			className="flex flex-col gap-5 border-t-[1.5px] border-rule pt-5"
			onSubmit={(event) => {
				event.preventDefault();
				add.mutate(undefined);
			}}
		>
			<LookFields look={look} onChange={setLook} nameId={nameId} />
			{policies.length > 0 && (
				<fieldset className="flex flex-col gap-3">
					<legend className="mb-1.5 font-semibold">
						Su tiempo{child ? `, para ${child.name}` : ""}
					</legend>
					{needsOwn ? (
						<p className="text-ink-soft">
							No hay cuota general: {name} necesita su cuota propia.
						</p>
					) : (
						<>
							<Segmented
								label="Qué cuota usa"
								value={choice}
								onChange={setChoice}
								options={[
									{ value: "general", label: "Comparte la general" },
									{ value: "own", label: "Cuota propia" },
								]}
							/>
							{choice === "general" && (
								<p className="text-ink-soft">
									La cuota general queda para{" "}
									{namesText([...sharing, look.name.trim() || "la nueva"])}.
								</p>
							)}
						</>
					)}
					{own && (
						<>
							<div className="grid gap-4 sm:grid-cols-2">
								<div className="flex flex-col gap-1.5">
									<label htmlFor={`${nameId}-daily`} className="font-medium">
										Por día
									</label>
									<MinutesStepper
										id={`${nameId}-daily`}
										label="Cuota propia: límite por día"
										value={amount.daily}
										onChange={(daily) => setAmount({ ...amount, daily })}
										step={10}
										max={1440}
									/>
								</div>
								<div className="flex flex-col gap-1.5">
									<label htmlFor={`${nameId}-weekly`} className="font-medium">
										Por semana
									</label>
									<MinutesStepper
										id={`${nameId}-weekly`}
										label="Cuota propia: límite por semana"
										value={amount.weekly}
										onChange={(weekly) => setAmount({ ...amount, weekly })}
										step={30}
										max={10080}
									/>
								</div>
							</div>
							{amount.weekly < amount.daily ? (
								<p className="text-[0.9375rem] text-stop">
									La semana no puede ser menor que el día.
								</p>
							) : (
								<TotalNote
									before={before}
									after={{
										daily: before.daily + amount.daily,
										weekly: before.weekly + amount.weekly,
									}}
								/>
							)}
						</>
					)}
				</fieldset>
			)}
			<div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
				<Button variant="quiet" disabled={add.isPending} onClick={onDone}>
					Cancelar
				</Button>
				<Button
					type="submit"
					variant="primary"
					icon={<Plus className="size-5" aria-hidden="true" />}
					busy={add.isPending}
					disabled={
						look.name.trim() === "" ||
						(own && (amount.daily < 1 || amount.weekly < amount.daily))
					}
				>
					Agregar
				</Button>
			</div>
		</form>
	);
}

// What a deactivation does to the child's quotas, in words.
function deactivateText(
	activity: Activity,
	policies: readonly Policy[],
	active: readonly Activity[],
): string {
	const own = policies.some((policy) => policy.activityId === activity.id);
	const general = policies.find((policy) => policy.activityId === null);
	const parts = [
		`${activity.name} deja de aparecer para pedir o empezar sesiones. Sus sesiones quedan en el historial y puedes volver a activarla.`,
	];
	if (own) {
		parts.push("Su cuota propia se cierra.");
	} else if (general) {
		const left = bagMembers(general, policies, active).filter(
			(a) => a.id !== activity.id,
		);
		parts.push("Lo que usó esta semana deja de contar en la cuota general.");
		if (left.length === 1) {
			parts.push(
				`La cuota general queda solo para ${left[0]?.name}, así que pasa a ser su cuota propia.`,
			);
		}
	}
	return parts.join(" ");
}

function ActivityRow({
	activity,
	policies,
	childId,
	canActivate,
}: {
	activity: Activity;
	policies: readonly Policy[];
	childId: string;
	canActivate: boolean;
}) {
	const nameId = useId();
	const { activeActivities } = useParents();
	const invalidate = useInvalidateActivities(childId);
	const [editing, setEditing] = useState(false);
	const [confirm, setConfirm] = useState(false);
	const current = lookKeys(activity);
	const [look, setLook] = useState<Look>({
		name: activity.name,
		color: current.color,
		icon: current.icon,
	});
	const activityId = activity.id;
	const own = policies.find((policy) => policy.activityId === activity.id);
	const general = policies.find((policy) => policy.activityId === null);
	const status = !activity.isActive
		? "Desactivada."
		: own
			? `Cuota propia: ${minutesText(own.dailyLimitMinutes)} al día.`
			: general
				? "Comparte la cuota general."
				: policies.length > 0
					? "Sin cuota todavía: no se puede usar hasta que le pongas una."
					: "";

	const save = useCommand(
		() =>
			call(
				api.activities[":activityId"].$patch({
					param: { activityId },
					json: { name: look.name.trim(), color: look.color, icon: look.icon },
				}),
			),
		{
			success: (result) => `«${result.activity.name}» guardada`,
			onSuccess: () => {
				setEditing(false);
				void invalidate();
			},
		},
	);
	const deactivate = useCommand(
		() =>
			call(
				api.activities[":activityId"].deactivate.$post({
					param: { activityId },
				}),
			),
		{
			success: `${activity.name} desactivada`,
			onSuccess: () => {
				setConfirm(false);
				void invalidate();
			},
			onError: () => setConfirm(false),
		},
	);
	const activate = useCommand(
		() =>
			call(
				api.activities[":activityId"].activate.$post({
					param: { activityId },
				}),
			),
		{
			success: `${activity.name} activada`,
			onSuccess: () => void invalidate(),
		},
	);
	const unchanged =
		look.name.trim() === activity.name &&
		look.color === current.color &&
		look.icon === current.icon;

	return (
		<li className="flex flex-col gap-4 border-t-[1.5px] border-rule pt-4 first:border-t-0 first:pt-0">
			<div className="flex items-center gap-3">
				<ActivityTile activity={activity} />
				<div className="flex min-w-0 flex-1 flex-col">
					<h3 className="text-lg leading-tight font-bold">{activity.name}</h3>
					{status && <p className="text-[0.9375rem] text-ink-soft">{status}</p>}
				</div>
			</div>
			{editing ? (
				<form
					className="flex flex-col gap-5"
					onSubmit={(event) => {
						event.preventDefault();
						save.mutate(undefined);
					}}
				>
					<LookFields look={look} onChange={setLook} nameId={nameId} />
					<div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
						<Button
							variant="quiet"
							disabled={save.isPending}
							onClick={() => setEditing(false)}
						>
							Cancelar
						</Button>
						<Button
							type="submit"
							variant="primary"
							busy={save.isPending}
							disabled={unchanged || look.name.trim() === ""}
						>
							Guardar
						</Button>
					</div>
				</form>
			) : (
				<div className="flex flex-wrap gap-2">
					<Button
						size="sm"
						icon={<SlidersHorizontal className="size-4" aria-hidden="true" />}
						onClick={() => setEditing(true)}
					>
						Cambiar
					</Button>
					{activity.isActive ? (
						activeActivities.length > 1 && (
							<Button
								size="sm"
								variant="quiet"
								icon={<PowerOff className="size-4" aria-hidden="true" />}
								onClick={() => setConfirm(true)}
							>
								Desactivar
							</Button>
						)
					) : (
						<Button
							size="sm"
							variant="quiet"
							icon={<Power className="size-4" aria-hidden="true" />}
							busy={activate.isPending}
							disabled={!canActivate}
							onClick={() => activate.mutate(undefined)}
						>
							Activar
						</Button>
					)}
				</div>
			)}
			<ConfirmDialog
				open={confirm}
				title={`¿Desactivar ${activity.name}?`}
				confirmLabel="Desactivar"
				tone="primary"
				busy={deactivate.isPending}
				onClose={() => setConfirm(false)}
				onConfirm={() => deactivate.mutate(undefined)}
			>
				{deactivateText(activity, policies, activeActivities)}
			</ConfirmDialog>
		</li>
	);
}

export function Activities({
	policies,
	childId,
}: {
	policies: readonly Policy[];
	childId: string;
}) {
	const { activities, activeActivities } = useParents();
	const [adding, setAdding] = useState(false);
	const inactive = activities.filter((a) => !a.isActive);
	const full = activeActivities.length >= MAX_ACTIVE;
	return (
		<div className="flex flex-col gap-5">
			<ul className="flex flex-col gap-4">
				{activeActivities.map((activity) => (
					<ActivityRow
						key={activity.id}
						activity={activity}
						policies={policies}
						childId={childId}
						canActivate={!full}
					/>
				))}
			</ul>
			{adding ? (
				<AddForm
					policies={policies}
					childId={childId}
					onDone={() => setAdding(false)}
				/>
			) : (
				<div className="flex flex-col gap-1.5">
					<div className="flex">
						<Button
							icon={<Plus className="size-5" aria-hidden="true" />}
							disabled={full}
							onClick={() => setAdding(true)}
						>
							Agregar actividad
						</Button>
					</div>
					{full && (
						<p className="text-[0.9375rem] text-ink-soft">
							Ya hay {MAX_ACTIVE} actividades, el máximo. Desactiva una para
							agregar otra.
						</p>
					)}
				</div>
			)}
			{inactive.length > 0 && (
				<details className="group flex flex-col gap-4 border-t-[1.5px] border-rule pt-4">
					<summary className="cursor-pointer font-semibold text-ink-soft hover:text-ink">
						Desactivadas ({inactive.length})
					</summary>
					<ul className="mt-4 flex flex-col gap-4">
						{inactive.map((activity) => (
							<ActivityRow
								key={activity.id}
								activity={activity}
								policies={policies}
								childId={childId}
								canActivate={!full}
							/>
						))}
					</ul>
				</details>
			)}
		</div>
	);
}
