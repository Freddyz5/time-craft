import { Pool } from "@neondatabase/serverless";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";
import type {
	PgDatabase,
	PgQueryResultHKT,
	PgTransaction,
} from "drizzle-orm/pg-core";
import * as schema from "./schema";

export type Schema = typeof schema;

// Any Drizzle Postgres database with this schema: Neon at runtime, PGlite in
// tests. Code that receives a database should take this type.
export type Db = PgDatabase<PgQueryResultHKT, Schema>;
export type Transaction = PgTransaction<
	PgQueryResultHKT,
	Schema,
	ExtractTablesWithRelations<Schema>
>;

// neon-serverless driver: a Pool over WebSocket, needed for interactive
// transactions. Node 22+ and Bun have a global WebSocket, which the driver
// picks up, so neonConfig.webSocketConstructor is not set (Neon's docs only
// require it on Node 21 and earlier).
export function createDb(connectionString: string) {
	const pool = new Pool({ connectionString });
	// Neon closes idle connections (e.g. when the compute suspends). Without a
	// listener, that error event would crash the process.
	pool.on("error", (error: Error) => {
		console.error("Idle database connection error", error);
	});
	return drizzle({ client: pool, schema });
}
