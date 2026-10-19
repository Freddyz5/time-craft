// What the api returns, inferred from AppType: JSON shapes (dates are ISO
// strings). Screens import these instead of redeclaring them.
import type { InferResponseType } from "hono/client";
import type { api } from "./api";

type Child = (typeof api.children)[":childId"];

export type Household = InferResponseType<typeof api.me.$get, 200>;
export type HouseholdChild = Household["children"][number];
export type Activity = Household["activities"][number];

export type BalanceView = InferResponseType<Child["balance"]["$get"], 200>;
export type Balance = BalanceView["balances"][number];

export type LiveView = InferResponseType<Child["live-session"]["$get"], 200>;
export type Live = NonNullable<LiveView["live"]>;
export type Session = Live["session"];

export type ChildRequest = InferResponseType<
	typeof api.requests.$get,
	200
>["requests"][number];

export type TaskReport = InferResponseType<
	(typeof api)["task-reports"]["$get"],
	200
>["reports"][number];

export type BonusTask = InferResponseType<
	(typeof api)["bonus-tasks"]["$get"],
	200
>["tasks"][number];

export type Policy = InferResponseType<
	Child["policies"]["$get"],
	200
>["policies"][number];

export type History = InferResponseType<Child["history"]["$get"], 200>;

export type LoginSession = InferResponseType<
	Child["logins"]["$get"],
	200
>["logins"][number];
