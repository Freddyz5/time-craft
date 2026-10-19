// Use cases. Each one takes the ports, the actor (except the system entry
// points: resolveActor, useRecoveryCode) and its input, and checks
// permissions itself. `createCore` binds them to one set of ports for the
// api's composition root.
import type { Actor } from "../domain/actor";
import {
	createChildAccount,
	regenerateRecoveryCode,
	resetPassword,
	resolveActor,
	useRecoveryCode,
} from "./accounts";
import { getChildBalance } from "./balance";
import {
	createBonusTask,
	deactivateBonusTask,
	reportTask,
	reviewTask,
	updateBonusTask,
} from "./bonuses";
import type { CoreDeps } from "./context";
import { grantOverride } from "./overrides";
import { setPolicy } from "./policies";
import { registerSubscription, removeSubscription } from "./push";
import {
	approveRequest,
	cancelRequest,
	createRequest,
	listPendingRequests,
	rejectRequest,
} from "./requests";
import {
	advanceScheduledSession,
	cancelScheduledSession,
	getLiveSession,
	pauseSession,
	resumeSession,
	startDirectSession,
	stopSession,
} from "./sessions";

export * from "./accounts";
export * from "./balance";
export * from "./bonuses";
export type { CoreDeps, Tx } from "./context";
export * from "./overrides";
export * from "./policies";
export * from "./push";
export * from "./requests";
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
		// Requests
		createRequest: bind(deps, createRequest),
		listPendingRequests: (actor: Actor) => listPendingRequests(deps, actor),
		cancelRequest: bind(deps, cancelRequest),
		approveRequest: bind(deps, approveRequest),
		rejectRequest: bind(deps, rejectRequest),
		// Sessions
		startDirectSession: bind(deps, startDirectSession),
		advanceScheduledSession: bind(deps, advanceScheduledSession),
		cancelScheduledSession: bind(deps, cancelScheduledSession),
		pauseSession: bind(deps, pauseSession),
		resumeSession: bind(deps, resumeSession),
		stopSession: bind(deps, stopSession),
		// Overrides and limits
		grantOverride: bind(deps, grantOverride),
		setPolicy: bind(deps, setPolicy),
		// Bonuses
		createBonusTask: bind(deps, createBonusTask),
		updateBonusTask: bind(deps, updateBonusTask),
		deactivateBonusTask: bind(deps, deactivateBonusTask),
		reportTask: bind(deps, reportTask),
		reviewTask: bind(deps, reviewTask),
		// Accounts
		resolveActor: (input: { authUserId: string }) => resolveActor(deps, input),
		createChildAccount: bind(deps, createChildAccount),
		resetPassword: bind(deps, resetPassword),
		useRecoveryCode: (input: Parameters<typeof useRecoveryCode>[1]) =>
			useRecoveryCode(deps, input),
		regenerateRecoveryCode: (actor: Actor) =>
			regenerateRecoveryCode(deps, actor),
		// Push
		registerSubscription: bind(deps, registerSubscription),
		removeSubscription: bind(deps, removeSubscription),
	};
}

export type Core = ReturnType<typeof createCore>;
