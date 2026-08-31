import { randomBytes } from "node:crypto"
import { eq } from "drizzle-orm"
import { auth } from "@/lib/better-auth"
import { db } from "@/db"
import { authUsers } from "@/db/schema"

export { auth }

/** Ensure the fixed single-admin account exists without exposing sign-up publicly. */
export async function ensureAdmin() {
  const [existing] = await db
    .select({ id: authUsers.id })
    .from(authUsers)
    .where(eq(authUsers.username, "admin"))
    .limit(1)
  if (existing) return undefined

  const password = randomBytes(12).toString("base64url")
  const context = await auth.$context
  const user = await context.internalAdapter.createUser({
    name: "admin",
    email: "admin@localhost",
    emailVerified: true,
    username: "admin",
  }, { method: "email-password" })
  await context.internalAdapter.createAccount({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    issuer: "local:credential",
    password: await context.password.hash(password),
  })
  return password
}
