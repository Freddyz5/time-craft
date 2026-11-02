// What "Tus reglas" says, in the child's words: the limits in force (with
// their days and grace), the rules the parents wrote for the child and the
// ones every session follows. The child's Inicio folds it under the
// batteries; Reglas shows the parents the very same thing.
import { activityById, type NamedActivity } from "../lib/activity";
import { minutesText, weekDaysText } from "../lib/format";
import type { Policy } from "../lib/types";

function rulesFor(policy: Policy, weekStartDay: number): string[] {
	const rules = [
		`${minutesText(policy.dailyLimitMinutes)} al día y ${minutesText(policy.weeklyLimitMinutes)} a la semana.`,
	];
	if (policy.allowedDays.length < 7) {
		rules.push(
			`Tienes tiempo ${weekDaysText(policy.allowedDays, weekStartDay)}. Los otros días descansas.`,
		);
	}
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
	if (policy.graceMinutes > 0) {
		rules.push(
			`Cuando se acaba, tienes ${minutesText(policy.graceMinutes)} para avisar a mamá o papá que la detengan: ese tiempo no cuenta.`,
		);
	}
	if (policy.carryOverExcess) {
		rules.push("Si un día te pasas, se descuenta del día siguiente.");
	}
	return rules;
}

export function ChildRules({
	policies,
	activities,
	customRules,
	requestExpiryMinutes,
	weekStartDay,
}: {
	policies: readonly Policy[];
	activities: readonly NamedActivity[];
	// Only those written for the child.
	customRules: readonly { id: string; text: string }[];
	requestExpiryMinutes: number;
	weekStartDay: number;
}) {
	const ordered = [...policies].sort(
		(a, b) => Number(a.activityId !== null) - Number(b.activityId !== null),
	);
	return (
		<div className="flex flex-col gap-4">
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
							{rulesFor(policy, weekStartDay).map((rule) => (
								<li key={rule}>{rule}</li>
							))}
						</ul>
					</div>
				);
			})}
			{customRules.length > 0 && (
				<div className="flex flex-col gap-1.5">
					<p className="font-semibold">Acuerdos de la casa</p>
					<ul className="flex list-disc flex-col gap-1 pl-5 marker:text-ink-faint">
						{customRules.map((rule) => (
							<li key={rule.id}>{rule.text}</li>
						))}
					</ul>
				</div>
			)}
			<ul className="flex list-disc flex-col gap-1 pl-5 text-ink-soft marker:text-ink-faint">
				<li>
					Una sesión a la vez. Si se pasa del tiempo, lo extra también cuenta.
				</li>
				<li>
					Un pedido espera {minutesText(requestExpiryMinutes)} a que mamá o papá
					respondan.
				</li>
			</ul>
			<p className="text-[0.9375rem] text-ink-soft">
				Las ponen mamá y papá. Si cambian, aplican a toda la semana.
			</p>
		</div>
	);
}
