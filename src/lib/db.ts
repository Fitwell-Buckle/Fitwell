// Build-time guard: fails the build if any Client Component imports this module
// (directly or transitively), instead of shipping a runtime neon() crash to the
// browser. See the 2026-07-01 shipping-banner incident (portal outage).
import "server-only";
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

const sql = neon(process.env.DATABASE_URL!);

export const db = drizzle(sql, { schema });

export type Database = typeof db;
