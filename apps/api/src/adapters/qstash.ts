// QStash: delayed jobs (a message with notBefore that QStash posts back to
// /internal/jobs) and the signature check of those callbacks.
import type { JobScheduler, ScheduledJob } from "@time-craft/core";
import { Client, QstashError, Receiver } from "@upstash/qstash";

export const JOBS_PATH = "/internal/jobs";

// What QStash posts back. Only the alert id: core reloads the rest.
export interface JobMessage {
	alertId: string;
}

export interface QStashConfig {
	token: string;
	currentSigningKey: string;
	nextSigningKey: string;
	// The api's public URL; the callback goes to its /internal/jobs.
	publicApiUrl: string;
	// QStash's regional URL (default: EU) or its local development server.
	baseUrl?: string | undefined;
}

export function jobsUrl(publicApiUrl: string): string {
	return new URL(JOBS_PATH, publicApiUrl).toString();
}

export class QStashJobScheduler implements JobScheduler {
	private readonly client: Client;
	private readonly callbackUrl: string;

	constructor(config: QStashConfig) {
		// Everything explicit: the SDK would otherwise read QSTASH_* and
		// QSTASH_DEV from the environment on its own.
		this.client = new Client({
			token: config.token,
			baseUrl: config.baseUrl ?? "https://qstash.upstash.io",
			devMode: false,
			enableTelemetry: false,
		});
		this.callbackUrl = jobsUrl(config.publicApiUrl);
	}

	async schedule(job: ScheduledJob): Promise<string> {
		const body: JobMessage = { alertId: job.alertId };
		const { messageId } = await this.client.publishJSON({
			url: this.callbackUrl,
			body,
			// Unix seconds. A time already past is delivered right away.
			notBefore: Math.ceil(job.runAt.getTime() / 1000),
			retries: 3,
			label: job.alertType,
		});
		return messageId;
	}

	async cancel(providerMessageId: string): Promise<void> {
		try {
			await this.client.messages.cancel(providerMessageId);
		} catch (error) {
			// Already delivered or cancelled: nothing to do.
			if (error instanceof QstashError && error.status === 404) {
				return;
			}
			throw error;
		}
	}
}

// Checks the Upstash-Signature header of a callback against the raw body.
export interface JobSignatureVerifier {
	verify(input: { signature: string; body: string }): Promise<boolean>;
}

export class QStashSignatureVerifier implements JobSignatureVerifier {
	private readonly receiver: Receiver;
	private readonly url: string;

	constructor(config: Omit<QStashConfig, "token" | "baseUrl">) {
		this.receiver = new Receiver({
			currentSigningKey: config.currentSigningKey,
			nextSigningKey: config.nextSigningKey,
			devMode: false,
		});
		// The signature covers the URL QStash called, which is the one the
		// message was published to.
		this.url = jobsUrl(config.publicApiUrl);
	}

	async verify(input: { signature: string; body: string }): Promise<boolean> {
		try {
			return await this.receiver.verify({
				signature: input.signature,
				body: input.body,
				url: this.url,
				clockTolerance: 5,
			});
		} catch {
			return false;
		}
	}
}
