import { betterAuth } from "better-auth/minimal"
import { drizzleAdapter } from "@better-auth/drizzle-adapter"
import { username } from "better-auth/plugins"
import { db } from "@/db"
import * as schema from "@/db/schema"

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: /^postgres(?:ql)?:\/\//i.test(process.env.DATABASE_URL ?? "") ? "pg" : "sqlite",
    schema: {
      user: schema.authUsers,
      session: schema.authSessions,
      account: schema.authAccounts,
      verification: schema.authVerifications,
    },
  }),
  secret: process.env.AUTH_SECRET ?? "development-only-change-me-32chars",
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  emailAndPassword: { enabled: true, disableSignUp: true },
  plugins: [username({ displayUsername: false, immutableUsername: true })],
})
