// "Tus reglas": the agreement in force, in the child's words, folded under
// the batteries. The same policies the parents set, read from the api: the
// rules are visible to everyone, not only implied by the fractions.
import { ChevronDown, ScrollText } from "lucide-react";
import { activityById } from "../../lib/activity";
import { minutesText } from "../../lib/format";
import type { Policy } from "../../lib/types";
import { useChild } from "../context";

function rulesFor(policy: Policy): string[] {
	const rules = [
		`${minutesText(policy.dailyLimitMinutes)} al día y ${minutesText(policy.weeklyLimitMinutes)} a la semana.`,
	];
	if (policy.weeklyBonusCapMinutes > 0) {
		rules.push(
			`Con tareas ganas hasta ${minutesText(policy.weeklyBonusCapMinutes)} más por semana.`,
		);
	}
	if (policy.warningMinutes > 0) {
		rules.push(
			`Te avisamos ${minutesText(policy.warningMinutes)} antes de que se acabe una sesión.`,
		);
	}
	if (policy.carryOverExcess) {
		rules.push("Si un día te pasas, se descuenta del día siguiente.");
	}
	return rules;
}

export function Rules({ policies }: { policies: readonly Policy[] }) {
	const { activities, household } = useChild();
	if (policies.length === 0) {
		return null;
	}
	const ordered = [...policies].sort(
		(a, b) => Number(a.activityId !== null) - Number(b.activityId !== null),
	);
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
			<div className="flex flex-col gap-4 px-4 pb-4 sm:px-5 sm:pb-5">
				{ordered.map((policy) => {
					const activity = activityById(activities, policy.activityId);
					return (
						<div key={policy.id} className="flex flex-col gap-1.5">
							{policies.length > 1 && (
								<p className="font-semibold">
									{activity ? activity.name : "Para todo"}
								</p>
							)}
							<ul className="flex list-disc flex-col gap-1 pl-5 marker:text-ink-faint">
								{rulesFor(policy).map((rule) => (
									<li key={rule}>{rule}</li>
								))}
							</ul>
						</div>
					);
				})}
				<ul className="flex list-disc flex-col gap-1 pl-5 text-ink-soft marker:text-ink-faint">
					<li>
						Una sesión a la vez. Si se pasa del tiempo, lo extra también cuenta.
					</li>
					<li>
						Un pedido espera{" "}
						{minutesText(household.family.requestExpiryMinutes)} a que mamá o
						papá respondan.
					</li>
				</ul>
				<p className="text-[0.9375rem] text-ink-soft">
					Las ponen mamá y papá. Si cambian, aplican a toda la semana.
				</p>
			</div>
		</details>
	);
}
