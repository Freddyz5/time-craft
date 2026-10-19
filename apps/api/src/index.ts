import { appInfo } from "@time-craft/core";
import { Hono } from "hono";

const app = new Hono();

app.get("/health", (c) => c.json({ ok: true, app: appInfo() }));

export default app;
