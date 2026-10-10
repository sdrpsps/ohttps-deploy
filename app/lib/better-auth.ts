import { betterAuth } from "better-auth/minimal"
import { drizzleAdapter } from "@better-auth/drizzle-adapter"
import { username } from "better-auth/plugins"
import { db } from "@/db"
import * as schema from "@/db/schema"
import { loadPocketIdConfig, pocketIdPlugin } from "@/lib/pocket-id"

export const pocketIdConfig = loadPocketIdConfig()

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
  account: { accountLinking: { enabled: false } },
  // Keep provider tokens private and prevent OAuth users from adding a password fallback.
  disabledPaths: ["/get-access-token", "/refresh-token", "/account-info", "/link-social", "/unlink-account", "/set-password"],
  onAPIError: { errorURL: "/login?authError=1" },
  logger: { log(level) { console[level]("Authentication operation reported an error or warning") } },
  plugins: [username({ displayUsername: false, immutableUsername: true }), ...(pocketIdConfig ? [pocketIdPlugin(pocketIdConfig)] : [])],
})
