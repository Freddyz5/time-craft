// Use cases. Each one takes the ports, the actor and its input, and checks
// permissions itself. `createCore` binds them to one set of ports for the
// api's composition root.
import type { Actor } from "../domain/actor";
import { getChildBalance } from "./balance";
import type { CoreDeps } from "./context";
import {
	advanceScheduledSession,
	cancelScheduledSession,
	getLiveSession,
	pauseSession,
	resumeSession,
	startDirectSession,
	stopSession,
} from "./sessions";

export * from "./balance";
export type { CoreDeps, Tx } from "./context";
export * from "./sessions";

type ActorUseCase<I, O> = (
	deps: CoreDeps,
	actor: Actor,
	input: I,
) => Promise<O>;

function bind<I, O>(deps: CoreDeps, useCase: ActorUseCase<I, O>) {
	return (actor: Actor, input: I): Promise<O> => useCase(deps, actor, input);
}

export function createCore(deps: CoreDeps) {
	return {
		// Balance and timer
		getChildBalance: bind(deps, getChildBalance),
		getLiveSession: bind(deps, getLiveSession),
		// Sessions
		startDirectSession: bind(deps, startDirectSession),
		advanceScheduledSession: bind(deps, advanceScheduledSession),
		cancelScheduledSession: bind(deps, cancelScheduledSession),
		pauseSession: bind(deps, pauseSession),
		resumeSession: bind(deps, resumeSession),
		stopSession: bind(deps, stopSession),
	};
}

export type Core = ReturnType<typeof createCore>;
