// Which automatic lines of «Tus reglas» the child reads: one switch per kind
// that shows today, with the words the child sees. Turning one off only
// takes it out of «Tus reglas»; the rule keeps working.
import { useQueryClient } from "@tanstack/react-query";
import { useId } from "react";
import type { RuleLine } from "../../components/ChildRules";
import { Switch } from "../../components/ui";
import { api, call } from "../../lib/api";
import { keys } from "../../lib/queries";
import type { HiddenRuleKey } from "../../lib/types";
import { useCommand } from "../../lib/useCommand";

const NAMES: Record<HiddenRuleKey, string> = {
	limits: "Límites del día y la semana",
	days: "Días con tiempo",
	bonus: "Bonos por tareas",
	warning: "Aviso antes del final",
	grace: "Gracia al terminar",
	carry_over: "Exceso al día siguiente",
	one_session: "Una sesión a la vez",
	request_wait: "Cuánto espera un pedido",
	week_change: "Quién las pone y desde cuándo valen",
};

export function RuleVisibility({
	childId,
	childName,
	lines,
	hidden,
}: {
	childId: string;
	childName: string;
	// The automatic lines «Tus reglas» shows before hiding any.
	lines: readonly RuleLine[];
	hidden: readonly HiddenRuleKey[];
}) {
	const id = useId();
	const client = useQueryClient();
	const toggle = useCommand(
		({ key, visible }: { key: HiddenRuleKey; visible: boolean }) => {
			const route = api.children[":childId"]["hidden-rules"][":ruleKey"];
			const param = { param: { childId, ruleKey: key } };
			return call(visible ? route.$delete(param) : route.$put(param));
		},
		{
			success: (_, { visible }) =>
				visible ? `${childName} vuelve a verla` : `${childName} ya no la ve`,
			refresh: false,
			onSuccess: (output) =>
				client.setQueryData(keys.hiddenRules(childId), output),
		},
	);
	return (
		<div className="flex flex-col gap-4 border-t-[1.5px] border-rule pt-4">
			<div className="flex flex-col gap-1">
				<h3 className="font-display text-lg leading-tight font-bold">
					Reglas automáticas que ve
				</h3>
				<p className="text-ink-soft">
					Salen solas de lo que defines arriba. Si alguna lo confunde, apágala:
					sigue valiendo, solo deja de aparecer en «Tus reglas».
				</p>
			</div>
			{lines.map((line) => (
				<Switch
					key={line.key}
					id={`${id}-${line.key}`}
					checked={!hidden.includes(line.key)}
					onChange={(visible) => toggle.mutate({ key: line.key, visible })}
					label={NAMES[line.key]}
					description={`«${line.text}»`}
				/>
			))}
		</div>
	);
}
