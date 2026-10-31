// Writes every sound of the web's catalogue as android/app/src/main/res/raw/
// tc_<id>.wav, for the notification channels (Alerts.java). Run it after
// changing apps/web/src/lib/sounds.ts (`bun run sounds`); the files are
// committed.
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { SOUNDS } from "../../web/src/lib/sounds";
import { render, wav } from "./synth";

const raw = new URL("../android/app/src/main/res/raw/", import.meta.url);
await mkdir(raw, { recursive: true });
for (const file of await readdir(raw)) {
	if (file.startsWith("tc_")) {
		await rm(new URL(file, raw));
	}
}
for (const [id, sound] of Object.entries(SOUNDS)) {
	await writeFile(new URL(`tc_${id}.wav`, raw), wav(render(sound.tones)));
}
console.log(`${Object.keys(SOUNDS).length} sounds written to res/raw`);
