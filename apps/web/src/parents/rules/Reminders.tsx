// The parents-only rules, short, where a decision is made (a new session, a
// request to answer), so they are not forgotten. Nothing when there are none.
import { NotebookPen } from "lucide-react";
import { useCustomRules } from "../../lib/queries";

export function Reminders({ childId }: { childId: string }) {
	const rules = useCustomRules(childId);
	const reminders = (rules.data?.rules ?? []).filter(
		(rule) => rule.parentsOnly,
	);
	if (reminders.length === 0) {
		return null;
	}
	return (
		<div className="flex flex-col gap-1.5 rounded-control border-[1.5px] border-rule-strong/40 bg-sheet-sunk px-3.5 py-3">
			<p className="flex items-center gap-2 font-semibold">
				<NotebookPen className="size-4.5 shrink-0" aria-hidden="true" />
				Para no olvidar
			</p>
			<ul className="flex list-disc flex-col gap-0.5 pl-5 marker:text-ink-faint">
				{reminders.map((rule) => (
					<li key={rule.id}>{rule.text}</li>
				))}
			</ul>
		</div>
	);
}
