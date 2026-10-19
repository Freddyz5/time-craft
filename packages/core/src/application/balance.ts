import type { Actor } from "../domain/actor";
import type { Balance } from "../domain/balance";
import { loadChild, loadFamily } from "./access";
import { type CoreDeps, transaction } from "./context";
import { childBalances } from "./quota";

export interface ChildBalanceView {
	serverTime: Date;
	childId: string;
	// One per current policy: usually a single global one. Empty if the
	// parents have not set limits yet.
	balances: Balance[];
}

// What the child has left: consumed today and this week (the open session
// included), capped bonus, available time and when it recharges.
export async function getChildBalance(
	deps: CoreDeps,
	actor: Actor,
	input: { childId: string },
): Promise<ChildBalanceView> {
	return transaction(deps, async (tx) => {
		const child = await loadChild(tx, actor, input.childId, "see the balance");
		const family = await loadFamily(tx, child.familyId);
		const balances = await childBalances(tx, family, child.id);
		return {
			serverTime: tx.now,
			childId: child.id,
			balances: balances.map((entry) => entry.balance),
		};
	});
}
