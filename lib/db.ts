import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/drizzle/schema";

const connectionString =
  process.env.DATABASE_URL ?? "postgres://orkut:orkut@localhost:5432/orkut";

// Cache the client on globalThis so Next's dev-mode hot reload cannot build a
// fresh pool of 10 connections every time this module is re-evaluated. Without
// this, a long dev session exhausts Postgres with "sorry, too many clients
// already" while the app still appears to work.
const globalForDb = globalThis as unknown as { __orkutPg?: ReturnType<typeof postgres> };

const client = globalForDb.__orkutPg ?? postgres(connectionString, { max: 10 });
if (process.env.NODE_ENV !== "production") globalForDb.__orkutPg = client;

export const db = drizzle(client, { schema });