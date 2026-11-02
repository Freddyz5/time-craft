// "Tus reglas": the agreement in force, in the child's words, folded under
// the batteries. The same policies and rules the parents set, read from the
// api: the rules are visible to everyone, not only implied by the fractions.
import { ChevronDown, ScrollText } from "lucide-react";
import { ChildRules } from "../../components/ChildRules";
import type { CustomRule, Policy } from "../../lib/types";
import { useChild } from "../context";

export function Rules({
	policies,
	customRules,
}: {
	policies: readonly Policy[];
	customRules: readonly CustomRule[];
}) {
	const { activities, household } = useChild();
	if (policies.length === 0 && customRules.length === 0) {
		return null;
	}
	return (
		<details className="plate group">
			<summary className="flex min-h-14 list-none items-center gap-3 rounded-callout px-4 font-semibold sm:px-5 [&::-webkit-details-marker]:hidden">
				<ScrollText className="size-5 shrink-0" aria-hidden="true" />
				<span className="flex-1 text-lg">Tus reglas</span>
				<ChevronDown
					className="size-5 shrink-0 text-ink-soft group-open:rotate-180 motion-safe:transition-transform motion-safe:duration-200"
					aria-hidden="true"
				/>
			</summary>
			<div className="px-4 pb-4 sm:px-5 sm:pb-5">
				<ChildRules
					policies={policies}
					activities={activities}
					customRules={customRules}
					requestExpiryMinutes={household.family.requestExpiryMinutes}
					weekStartDay={household.family.weekStartDay}
				/>
			</div>
		</details>
	);
}
