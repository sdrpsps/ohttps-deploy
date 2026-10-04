import { randomBytes } from "node:crypto"
import { and, eq, ne } from "drizzle-orm"
import { auth, pocketIdConfig } from "@/lib/better-auth"
import { db } from "@/db"
import { authAccounts, authSessions, authUsers } from "@/db/schema"

export { auth }

/** Ensure the fixed single-admin account exists without exposing sign-up publicly. */
export async function ensureAdmin() {
  const [existing] = await db
    .select({ id: authUsers.id })
    .from(authUsers)
    .where(eq(authUsers.username, "admin"))
    .limit(1)
  const context = await auth.$context
  const password = existing ? undefined : randomBytes(12).toString("base64url")
  const user = existing ?? await context.internalAdapter.createUser({
    name: "admin",
    email: "admin@localhost",
    emailVerified: true,
    username: "admin",
  }, { method: "email-password" })
  if (password) await context.internalAdapter.createAccount({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    issuer: "local:credential",
    password: await context.password.hash(password),
  })
  // Worker owns provisioning. Never create or link an administrator from a browser claim.
  await db.transaction(async (tx) => {
    const bindings = await tx.select().from(authAccounts).where(eq(authAccounts.providerId, "pocket-id"))
    const current = bindings.find((account) => account.userId === user.id && account.issuer === pocketIdConfig?.issuer && account.accountId === pocketIdConfig?.adminSub)
    if (bindings.some((account) => account.id !== current?.id)) {
      await tx.delete(authAccounts).where(and(eq(authAccounts.providerId, "pocket-id"), ...(current ? [ne(authAccounts.id, current.id)] : [])))
      // Revoking or replacing the binding also invalidates previously issued admin sessions.
      await tx.delete(authSessions).where(eq(authSessions.userId, user.id))
    }
    if (pocketIdConfig && !current) await tx.insert(authAccounts).values({
      id: randomBytes(16).toString("hex"), userId: user.id, providerId: "pocket-id", issuer: pocketIdConfig.issuer, accountId: pocketIdConfig.adminSub,
    })
  })
  return password
}
