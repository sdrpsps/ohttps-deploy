import "dotenv/config";
import type { Config } from "drizzle-kit";

export default {
  schema: "./app/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: { url: process.env.DATABASE_URL ?? "./data/ssl-deploy.db" },
} satisfies Config;
