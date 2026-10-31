// Builds the Android app's icons from the web's brand files (apps/web/brand
// and public/icons): the launcher icon, its adaptive foreground and the
// notification's silhouette. Run it after changing the mark (`bun run
// icons`); the outputs are committed.
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { Resvg } from "@resvg/resvg-js";

const web = new URL("../../web/", import.meta.url);
const res = new URL("../android/app/src/main/res/", import.meta.url);

// Launcher icon sizes (48 dp) and adaptive layer sizes (108 dp) per density.
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

function png(svg: string, size: number): Uint8Array {
	return new Resvg(svg, { fitTo: { mode: "width", value: size } })
		.render()
		.asPng();
}

const icon = await readFile(new URL("public/icons/icon.svg", web), "utf8");
const mark = await readFile(new URL("brand/mark.svg", web), "utf8");
const markBody = mark
	.replace(/^[\s\S]*?<svg[^>]*>/, "")
	.replace(/<\/svg>\s*$/, "")
	.replace(/\s*<title>[\s\S]*?<\/title>/, "")
	.trim();
const markViewBox = /viewBox="([^"]+)"/.exec(mark)?.[1] ?? "0 0 512 512";

// The adaptive icon's foreground: the mark inside the 66 dp safe circle of a
// 108 dp layer; the launcher draws the plate color behind it.
const [, , markWidth = 512, markHeight = 512] = markViewBox
	.split(/\s+/)
	.map(Number);
const scale = 60 / Math.max(markWidth, markHeight);
const foreground = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108"><g transform="translate(${(108 - markWidth * scale) / 2} ${(108 - markHeight * scale) / 2}) scale(${scale})">${markBody}</g></svg>`;

for (const [density, factor] of Object.entries(DENSITIES)) {
	const dir = new URL(`mipmap-${density}/`, res);
	await mkdir(dir, { recursive: true });
	const launcher = png(icon, Math.round(48 * factor));
	await writeFile(new URL("ic_launcher.png", dir), launcher);
	await writeFile(new URL("ic_launcher_round.png", dir), launcher);
	await writeFile(
		new URL("ic_launcher_foreground.png", dir),
		png(foreground, Math.round(108 * factor)),
	);
}

// The notification's small icon: the web push badge (white on transparent),
// 24 dp at xxxhdpi; Android scales it for the other densities.
const drawable = new URL("drawable-xxxhdpi/", res);
await mkdir(drawable, { recursive: true });
await copyFile(
	new URL("public/icons/badge-96.png", web),
	new URL("ic_stat_timecraft.png", drawable),
);
console.log("Icons written to android/app/src/main/res");
