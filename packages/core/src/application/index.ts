// Use cases. Each one takes the ports, the actor (except the system entry
// points: resolveActor, the child sign-in guard, useRecoveryCode, handleJob)
// and its input, and checks permissions itself. `createCore` binds them to one set of ports for the
// api's composition root.
import type { Actor } from "../domain/actor";
import {
	assertCanChangeOwnPassword,
	assertChildCanSignIn,
	createChildAccount,
	listChildLogins,
	recordChildSignIn,
	regenerateRecoveryCode,
	resetPassword,
	resolveActor,
	revokeChildLogins,
	useRecoveryCode,
} from "./accounts";
import { getChildBalance } from "./balance";
import {
	createBonusTask,
	deactivateBonusTask,
	listBonusTasks,
	listPendingTaskReports,
	reportTask,
	reviewTask,
	updateBonusTask,
} from "./bonuses";
import type { CoreDeps } from "./context";
import { getChildHistory } from "./history";
import { getHousehold } from "./household";
import { handleJob } from "./jobs";
import { grantOverride } from "./overrides";
import { listCurrentPolicies, setPolicy } from "./policies";
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
export * from "./history";
export * from "./household";
export * from "./jobs";
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
		// Household and history
		getHousehold: (actor: Actor) => getHousehold(deps, actor),
		getChildHistory: bind(deps, getChildHistory),
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
		listCurrentPolicies: bind(deps, listCurrentPolicies),
		setPolicy: bind(deps, setPolicy),
		// Bonuses
		listBonusTasks: (actor: Actor) => listBonusTasks(deps, actor),
		listPendingTaskReports: (actor: Actor) =>
			listPendingTaskReports(deps, actor),
		createBonusTask: bind(deps, createBonusTask),
		updateBonusTask: bind(deps, updateBonusTask),
		deactivateBonusTask: bind(deps, deactivateBonusTask),
		reportTask: bind(deps, reportTask),
		reviewTask: bind(deps, reviewTask),
		// Accounts
		resolveActor: (input: { authUserId: string }) => resolveActor(deps, input),
		assertChildCanSignIn: (input: { authUserId: string }) =>
			assertChildCanSignIn(deps, input),
		recordChildSignIn: (input: { authUserId: string; succeeded: boolean }) =>
			recordChildSignIn(deps, input),
		assertCanChangeOwnPassword: (input: {
			authUserId: string;
			newPassword: string;
		}) => assertCanChangeOwnPassword(deps, input),
		createChildAccount: bind(deps, createChildAccount),
		listChildLogins: bind(deps, listChildLogins),
		revokeChildLogins: bind(deps, revokeChildLogins),
		resetPassword: bind(deps, resetPassword),
		useRecoveryCode: (input: Parameters<typeof useRecoveryCode>[1]) =>
			useRecoveryCode(deps, input),
		regenerateRecoveryCode: (actor: Actor) =>
			regenerateRecoveryCode(deps, actor),
		// Push
		registerSubscription: bind(deps, registerSubscription),
		removeSubscription: bind(deps, removeSubscription),
		// Scheduled jobs (QStash callback)
		handleJob: (input: { alertId: string }) => handleJob(deps, input),
	};
}

export type Core = ReturnType<typeof createCore>;
