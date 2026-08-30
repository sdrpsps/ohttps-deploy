import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { loadConfig } from "../lib/config";
import * as schema from "./schema";

const config = loadConfig();
const dbPath = config.DATABASE_URL.startsWith("file:") ? config.DATABASE_URL.slice(5) : config.DATABASE_URL;
if (dbPath !== ":memory:") mkdirSync(dirname(dbPath), { recursive: true, mode: 0o700 });
const client = createClient({ url: dbPath === ":memory:" ? "file::memory:" : `file:${dbPath}` });
export const db = drizzle(client, { schema });
export { client };
