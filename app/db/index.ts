import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { loadConfig } from "../lib/config";
import * as schema from "./schema";

const config = loadConfig();
const dbPath = config.DATABASE_URL.startsWith("file:") ? config.DATABASE_URL.slice(5) : config.DATABASE_URL;
const isLocalSqlite = dbPath !== ":memory:" && !/^https?:\/\//i.test(dbPath) && !/^libsql:\/\//i.test(dbPath);
if (isLocalSqlite) mkdirSync(dirname(dbPath), { recursive: true, mode: 0o700 });
const client = createClient({ url: dbPath === ":memory:" ? "file::memory:" : dbPath.startsWith("libsql://") || /^https?:\/\//i.test(dbPath) ? dbPath : `file:${dbPath}`, authToken: process.env.TURSO_AUTH_TOKEN });
export const databaseReady = isLocalSqlite
  ? client.execute("PRAGMA busy_timeout = 10000").then(() => client.execute("PRAGMA journal_mode = WAL")).then(() => undefined)
  : Promise.resolve();
export const db = drizzle(client, { schema });
export { client };
