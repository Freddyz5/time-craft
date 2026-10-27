// Bonos: the catalog of tasks that earn minutes. The child sees the active
// ones and reports them; a parent reviews each report in Inicio. Created and
// edited in place; a deactivated task stays below, folded, for the record.
import { useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Pencil, Plus, PowerOff } from "lucide-react";
import { useId, useState } from "react";
import { AmountBricks } from "../components/bricks";
import {
	Button,
	Callout,
	ConfirmDialog,
	Field,
	inputClass,
	LoadingBricks,
	MinutesStepper,
	Notice,
} from "../components/ui";
import { api, call } from "../lib/api";
import { errorMessage } from "../lib/errors";
import { minutesText, secondsText } from "../lib/format";
import { keys, useBalance, useBonusTasks } from "../lib/queries";
import type { BonusTask } from "../lib/types";
import { useCommand } from "../lib/useCommand";
import { useParents } from "./context";

interface TaskFields {
	name: string;
	description: string;
	rewardMinutes: number;
	// null: as many times as the child wants (the weekly cap still applies).
	maxPerWeek: number | null;
}

const EMPTY: TaskFields = {
	name: "",
	description: "",
	rewardMinutes: 15,
	maxPerWeek: null,
};

function fieldsOf(task: BonusTask): TaskFields {
	return {
		name: task.name,
		description: task.description ?? "",
		rewardMinutes: task.rewardMinutes,
		maxPerWeek: task.maxPerWeek,
	};
}

function TaskForm({
	initial,
	submitLabel,
	busy,
	onSubmit,
	onCancel,
}: {
	initial: TaskFields;
	submitLabel: string;
	busy: boolean;
	onSubmit: (fields: TaskFields) => void;
	onCancel: () => void;
}) {
	const id = useId();
	const [fields, setFields] = useState(initial);
	const limited = fields.maxPerWeek !== null;
	return (
		<form
			className="flex flex-col gap-4"
			onSubmit={(event) => {
				event.preventDefault();
				onSubmit({
					...fields,
					name: fields.name.trim(),
					description: fields.description.trim(),
				});
			}}
		>
			<Field label="Tarea" htmlFor={`${id}-name`}>
				<input
					id={`${id}-name`}
					maxLength={80}
					required
					value={fields.name}
					onChange={(event) =>
						setFields({ ...fields, name: event.target.value })
					}
					className={inputClass}
					placeholder="Ordenar el cuarto"
				/>
			</Field>
			<Field
				label="Detalle (opcional)"
				htmlFor={`${id}-description`}
				hint="Qué cuenta como hecha, para que no haya dudas."
			>
				<textarea
					id={`${id}-description`}
					maxLength={255}
					rows={2}
					value={fields.description}
					onChange={(event) =>
						setFields({ ...fields, description: event.target.value })
					}
					className={`${inputClass} py-3`}
					placeholder="Cama tendida, ropa guardada y juguetes en su caja"
				/>
			</Field>
			<div className="grid gap-4 sm:grid-cols-2">
				<div className="flex flex-col gap-1.5">
					<label htmlFor={`${id}-reward`} className="font-medium">
						Minutos que gana
					</label>
					<MinutesStepper
						id={`${id}-reward`}
						label="Minutos que gana"
						value={fields.rewardMinutes}
						onChange={(rewardMinutes) =>
							setFields({ ...fields, rewardMinutes })
						}
						max={1440}
					/>
				</div>
				<div className="flex flex-col gap-1.5">
					<span className="font-medium">Veces por semana</span>
					<label className="flex min-h-12 items-center gap-3">
						<input
							type="checkbox"
							checked={limited}
							onChange={(event) =>
								setFields({
									...fields,
									maxPerWeek: event.target.checked ? 3 : null,
								})
							}
							className="size-5 accent-ink"
						/>
						Con un máximo
					</label>
					{limited ? (
						<input
							type="number"
							inputMode="numeric"
							min={1}
							max={100}
							aria-label="Máximo de veces por semana"
							value={fields.maxPerWeek ?? 1}
							onChange={(event) =>
								setFields({
									...fields,
									maxPerWeek: Math.min(
										100,
										Math.max(1, Number(event.target.value) || 1),
									),
								})
							}
							className={`${inputClass} tabular max-w-32`}
						/>
					) : (
						<p className="text-[0.9375rem] text-ink-soft">
							Sin máximo: el tope de bonos manda.
						</p>
					)}
				</div>
			</div>
			<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
				<Button variant="quiet" disabled={busy} onClick={onCancel}>
					Cancelar
				</Button>
				<Button
					type="submit"
					variant="primary"
					busy={busy}
					disabled={fields.name.trim() === "" || fields.rewardMinutes < 1}
				>
					{submitLabel}
				</Button>
			</div>
		</form>
	);
}

function useInvalidateTasks() {
	const client = useQueryClient();
	return () => client.invalidateQueries({ queryKey: keys.bonusTasks });
}

function payload(fields: TaskFields) {
	return {
		name: fields.name,
		description: fields.description === "" ? null : fields.description,
		rewardMinutes: fields.rewardMinutes,
		maxPerWeek: fields.maxPerWeek,
	};
}

function TaskItem({ task }: { task: BonusTask }) {
	const [editing, setEditing] = useState(false);
	const [confirm, setConfirm] = useState(false);
	const invalidate = useInvalidateTasks();
	const taskId = task.id;
	const update = useCommand(
		(fields: TaskFields) =>
			call(
				api["bonus-tasks"][":taskId"].$put({
					param: { taskId },
					json: payload(fields),
				}),
			),
		{
			refresh: false,
			success: "Tarea guardada",
			onSuccess: () => {
				setEditing(false);
				void invalidate();
			},
		},
	);
	const deactivate = useCommand(
		() =>
			call(
				api["bonus-tasks"][":taskId"].deactivate.$post({ param: { taskId } }),
			),
		{
			refresh: false,
			success: `«${task.name}» desactivada`,
			onSuccess: () => {
				setConfirm(false);
				void invalidate();
			},
		},
	);

	if (editing) {
		return (
			<li className="border-t-[1.5px] border-rule pt-4 first:border-t-0 first:pt-0">
				<TaskForm
					initial={fieldsOf(task)}
					submitLabel="Guardar"
					busy={update.isPending}
					onSubmit={(fields) => update.mutate(fields)}
					onCancel={() => setEditing(false)}
				/>
			</li>
		);
	}

	return (
		<li className="flex flex-col gap-3 border-t-[1.5px] border-rule pt-4 first:border-t-0 first:pt-0 sm:flex-row sm:items-start sm:justify-between">
			<div className="flex min-w-0 flex-col gap-1.5">
				<h3 className={`font-semibold ${task.isActive ? "" : "text-ink-soft"}`}>
					{task.name}
				</h3>
				{task.description && (
					<p className="text-ink-soft">{task.description}</p>
				)}
				<div className="flex items-center gap-3">
					<AmountBricks
						minutes={task.rewardMinutes}
						color={task.isActive ? "var(--color-bonus)" : "var(--color-ghost)"}
						size="sm"
						label={`Gana ${minutesText(task.rewardMinutes)}`}
					/>
					<p className="tabular text-[0.9375rem] text-ink-soft">
						+{minutesText(task.rewardMinutes)}
						{task.maxPerWeek !== null &&
							` · hasta ${task.maxPerWeek} ${task.maxPerWeek === 1 ? "vez" : "veces"} por semana`}
					</p>
				</div>
			</div>
			{task.isActive && (
				<div className="flex shrink-0 gap-2">
					<Button
						size="sm"
						icon={<Pencil className="size-4" aria-hidden="true" />}
						onClick={() => setEditing(true)}
					>
						Editar
					</Button>
					<Button
						size="sm"
						variant="quiet"
						icon={<PowerOff className="size-4" aria-hidden="true" />}
						onClick={() => setConfirm(true)}
					>
						Desactivar
					</Button>
				</div>
			)}
			<ConfirmDialog
				open={confirm}
				title={`¿Desactivar «${task.name}»?`}
				confirmLabel="Desactivar"
				busy={deactivate.isPending}
				onClose={() => setConfirm(false)}
				onConfirm={() => deactivate.mutate(undefined)}
			>
				El niño ya no podrá reportarla. Los reportes que estén pendientes
				todavía se pueden revisar. Desde la app no se puede volver a activar:
				tendrías que crearla de nuevo.
			</ConfirmDialog>
		</li>
	);
}

export function BonusTasks() {
	const { child } = useParents();
	const tasks = useBonusTasks();
	const balance = useBalance(child?.id);
	const [creating, setCreating] = useState(false);
	const invalidate = useInvalidateTasks();
	const create = useCommand(
		(fields: TaskFields) =>
			call(api["bonus-tasks"].$post({ json: payload(fields) })),
		{
			refresh: false,
			success: (result) => `«${result.task.name}» creada`,
			onSuccess: () => {
				setCreating(false);
				void invalidate();
			},
		},
	);

	const all = tasks.data?.tasks ?? [];
	const active = all.filter((task) => task.isActive);
	const inactive = all.filter((task) => !task.isActive);
	const cap = balance.data?.balances.find(
		(b) => b.activityId === null,
	)?.bonusCapSeconds;

	return (
		<div className="mx-auto flex max-w-3xl flex-col gap-5">
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div className="flex flex-col gap-1">
					<h1 className="text-[2rem] leading-tight font-extrabold">
						Tareas de bono
					</h1>
					<p className="text-ink-soft">
						Lo que {child?.name ?? "el niño"} puede hacer para ganar minutos.
						{cap !== undefined &&
							` Suman a la semana hasta ${secondsText(cap)}, el tope de bonos.`}
					</p>
				</div>
				{!creating && (
					<Button
						variant="primary"
						icon={<Plus className="size-5" aria-hidden="true" />}
						onClick={() => setCreating(true)}
					>
						Nueva tarea
					</Button>
				)}
			</div>

			{creating && (
				<Callout
					className="flex flex-col gap-4 p-4 sm:p-5"
					aria-labelledby="new-task"
				>
					<h2 id="new-task" className="text-[1.375rem] leading-tight font-bold">
						Nueva tarea
					</h2>
					<TaskForm
						initial={EMPTY}
						submitLabel="Crear tarea"
						busy={create.isPending}
						onSubmit={(fields) => create.mutate(fields)}
						onCancel={() => setCreating(false)}
					/>
				</Callout>
			)}

			{tasks.data === undefined ? (
				tasks.error ? (
					<Notice tone="error">{errorMessage(tasks.error)}</Notice>
				) : (
					<LoadingBricks />
				)
			) : (
				<>
					<Callout
						className="flex flex-col gap-4 p-4 sm:p-5"
						aria-labelledby="active-tasks"
					>
						<h2
							id="active-tasks"
							className="text-[1.375rem] leading-tight font-bold"
						>
							Activas
							{active.length > 0 && (
								<span className="font-normal text-ink-soft">
									{" "}
									· {active.length}
								</span>
							)}
						</h2>
						{active.length === 0 ? (
							<p className="text-ink-soft">
								No hay tareas activas. Crea la primera: por ejemplo «Hacer los
								deberes» por 15 min.
							</p>
						) : (
							<ul className="flex flex-col gap-4">
								{active.map((task) => (
									<TaskItem key={task.id} task={task} />
								))}
							</ul>
						)}
					</Callout>

					{inactive.length > 0 && (
						<details className="group rounded-callout border-[1.5px] border-rule bg-sheet-sunk">
							<summary className="flex min-h-12 list-none items-center justify-between gap-3 rounded-callout px-4 font-semibold [&::-webkit-details-marker]:hidden">
								Desactivadas · {inactive.length}
								<ChevronRight
									className="size-5 text-ink-soft transition-transform group-open:rotate-90"
									aria-hidden="true"
								/>
							</summary>
							<ul className="flex flex-col gap-4 px-4 pt-1 pb-4">
								{inactive.map((task) => (
									<TaskItem key={task.id} task={task} />
								))}
							</ul>
						</details>
					)}
				</>
			)}
		</div>
	);
}
