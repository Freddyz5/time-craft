// The rules parents write in their own words, in two lists: those the child
// reads in «Tus reglas», and reminders only mom and dad see ("Solo después
// de comer"). They only inform: nothing in the app reads them. A rule opens
// to edit its text, move it up or down, send it to the other list or delete
// it (with a confirmation).
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import {
	Button,
	Callout,
	ConfirmDialog,
	inputClass,
	Switch,
} from "../../components/ui";
import { api, call } from "../../lib/api";
import { keys } from "../../lib/queries";
import type { CustomRule } from "../../lib/types";
import { useCommand } from "../../lib/useCommand";

const TEXT_MAX = 200;

function useInvalidateRules(childId: string) {
	const client = useQueryClient();
	return () =>
		client.invalidateQueries({ queryKey: keys.customRules(childId) });
}

function RuleEditor({
	rule,
	list,
	childId,
	childName,
	onClose,
}: {
	rule: CustomRule;
	// The list it belongs to, in order.
	list: readonly CustomRule[];
	childId: string;
	childName: string;
	onClose: () => void;
}) {
	const id = useId();
	const [text, setText] = useState(rule.text);
	const [parentsOnly, setParentsOnly] = useState(rule.parentsOnly);
	const [confirm, setConfirm] = useState(false);
	const invalidate = useInvalidateRules(childId);
	const index = list.findIndex((other) => other.id === rule.id);

	const save = useCommand(
		() =>
			call(
				api["custom-rules"][":ruleId"].$patch({
					param: { ruleId: rule.id },
					json: { text: text.trim(), parentsOnly },
				}),
			),
		{
			success: "Regla guardada",
			refresh: false,
			onSuccess: () => {
				onClose();
				void invalidate();
			},
		},
	);
	const move = useCommand(
		(step: -1 | 1) => {
			const ids = list.map((other) => other.id);
			ids.splice(index, 1);
			ids.splice(index + step, 0, rule.id);
			return call(
				api.children[":childId"]["custom-rules"].order.$put({
					param: { childId },
					json: { ruleIds: ids },
				}),
			);
		},
		{ refresh: false, onSuccess: () => void invalidate() },
	);
	const remove = useCommand(
		() =>
			call(
				api["custom-rules"][":ruleId"].$delete({ param: { ruleId: rule.id } }),
			),
		{
			success: "Regla borrada",
			refresh: false,
			onSuccess: () => {
				setConfirm(false);
				onClose();
				void invalidate();
			},
		},
	);
	const unchanged =
		text.trim() === rule.text && parentsOnly === rule.parentsOnly;
	const busy = save.isPending || move.isPending || remove.isPending;

	return (
		<form
			className="flex flex-col gap-4"
			onSubmit={(event) => {
				event.preventDefault();
				save.mutate(undefined);
			}}
		>
			<div className="flex flex-col gap-1.5">
				<label htmlFor={`${id}-text`} className="font-semibold">
					Regla
				</label>
				<textarea
					id={`${id}-text`}
					rows={2}
					maxLength={TEXT_MAX}
					value={text}
					onChange={(event) => setText(event.target.value)}
					className={`${inputClass} py-3`}
				/>
			</div>
			<Switch
				id={`${id}-parents`}
				checked={parentsOnly}
				onChange={setParentsOnly}
				label="Solo para mamá y papá"
				description={`${childName} no la ve.`}
			/>
			<div className="flex flex-wrap gap-2">
				<Button
					size="sm"
					icon={<ArrowUp className="size-4" aria-hidden="true" />}
					disabled={index <= 0 || busy}
					onClick={() => move.mutate(-1)}
				>
					Subir
				</Button>
				<Button
					size="sm"
					icon={<ArrowDown className="size-4" aria-hidden="true" />}
					disabled={index === list.length - 1 || busy}
					onClick={() => move.mutate(1)}
				>
					Bajar
				</Button>
			</div>
			<div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
				<Button
					variant="quiet"
					icon={<Trash2 className="size-4.5" aria-hidden="true" />}
					disabled={busy}
					onClick={() => setConfirm(true)}
				>
					Borrar
				</Button>
				<div className="flex flex-col-reverse gap-2 sm:flex-row">
					<Button variant="quiet" disabled={busy} onClick={onClose}>
						Cancelar
					</Button>
					<Button
						type="submit"
						variant="primary"
						busy={save.isPending}
						disabled={unchanged || text.trim() === "" || busy}
					>
						Guardar
					</Button>
				</div>
			</div>
			<ConfirmDialog
				open={confirm}
				title="¿Borrar esta regla?"
				confirmLabel="Borrar"
				busy={remove.isPending}
				onClose={() => setConfirm(false)}
				onConfirm={() => remove.mutate(undefined)}
			>
				«{rule.text}» deja de estar anotada
				{rule.parentsOnly ? "." : ` y ${childName} ya no la ve.`}
			</ConfirmDialog>
		</form>
	);
}

function AddRule({
	childId,
	parentsOnly,
	placeholder,
}: {
	childId: string;
	parentsOnly: boolean;
	placeholder: string;
}) {
	const id = useId();
	const [text, setText] = useState("");
	const invalidate = useInvalidateRules(childId);
	const add = useCommand(
		() =>
			call(
				api.children[":childId"]["custom-rules"].$post({
					param: { childId },
					json: { text: text.trim(), parentsOnly },
				}),
			),
		{
			success: "Regla anotada",
			refresh: false,
			onSuccess: () => {
				setText("");
				void invalidate();
			},
		},
	);
	return (
		<form
			className="flex flex-col gap-2 sm:flex-row"
			onSubmit={(event) => {
				event.preventDefault();
				add.mutate(undefined);
			}}
		>
			<label htmlFor={id} className="sr-only">
				Nueva regla
			</label>
			<input
				id={id}
				maxLength={TEXT_MAX}
				value={text}
				onChange={(event) => setText(event.target.value)}
				placeholder={placeholder}
				className={inputClass}
			/>
			<Button
				type="submit"
				icon={<Plus className="size-5" aria-hidden="true" />}
				busy={add.isPending}
				disabled={text.trim() === ""}
				className="shrink-0"
			>
				Agregar
			</Button>
		</form>
	);
}

export function CustomRuleList({
	childId,
	childName,
	parentsOnly,
	rules,
	title,
	description,
	placeholder,
}: {
	childId: string;
	childName: string;
	parentsOnly: boolean;
	// Both lists, in order; this one shows its own.
	rules: readonly CustomRule[];
	title: string;
	description: string;
	placeholder: string;
}) {
	const headingId = useId();
	const [editing, setEditing] = useState<string | null>(null);
	const list = rules.filter((rule) => rule.parentsOnly === parentsOnly);
	return (
		<Callout
			className="flex flex-col gap-4 p-4 sm:p-5"
			aria-labelledby={headingId}
		>
			<div className="flex flex-col gap-1">
				<h2 id={headingId} className="text-[1.375rem] leading-tight font-bold">
					{title}
				</h2>
				<p className="text-ink-soft">{description}</p>
			</div>
			{list.length === 0 ? (
				<p className="text-ink-soft">Todavía no hay ninguna.</p>
			) : (
				<ol className="flex flex-col">
					{list.map((rule) => (
						<li
							key={rule.id}
							className="border-t-[1.5px] border-rule py-3 first:border-t-0 first:pt-0"
						>
							{editing === rule.id ? (
								<RuleEditor
									rule={rule}
									list={list}
									childId={childId}
									childName={childName}
									onClose={() => setEditing(null)}
								/>
							) : (
								<div className="flex items-start gap-3">
									<p className="min-w-0 flex-1 pt-2 break-words">{rule.text}</p>
									<Button
										size="sm"
										variant="quiet"
										className="w-10 shrink-0 px-0"
										aria-label={`Cambiar «${rule.text}»`}
										icon={<Pencil className="size-4.5" aria-hidden="true" />}
										onClick={() => setEditing(rule.id)}
									/>
								</div>
							)}
						</li>
					))}
				</ol>
			)}
			<AddRule
				childId={childId}
				parentsOnly={parentsOnly}
				placeholder={placeholder}
			/>
		</Callout>
	);
}
