import { randomBytes } from "node:crypto"
import { and, eq } from "drizzle-orm"
import { auth, pocketIdConfig } from "@/lib/better-auth"
import { db } from "@/db"
import { authAccounts, authSessions, authUsers } from "@/db/schema"
import { pocketIdAccountIssuer } from "@/lib/pocket-id"

export { auth }

export async function isAuthorizedUser(user: { id: string; username?: string | null }) {
  if (user.username === "admin") return true
  if (!pocketIdConfig) return false
  const [account] = await db.select({ id: authAccounts.id }).from(authAccounts).where(and(
    eq(authAccounts.userId, user.id), eq(authAccounts.providerId, "pocket-id"),
    eq(authAccounts.issuer, pocketIdAccountIssuer(pocketIdConfig)),
  )).limit(1)
  return !!account
}

/** Keep the local recovery admin and retire legacy or disabled Pocket ID bindings. */
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
  await db.transaction(async (tx) => {
    const bindings = await tx.select().from(authAccounts).where(eq(authAccounts.providerId, "pocket-id"))
    const issuer = pocketIdConfig ? pocketIdAccountIssuer(pocketIdConfig) : undefined
    for (const account of bindings) {
      if (account.userId !== user.id && account.issuer === issuer) continue
      await tx.delete(authAccounts).where(eq(authAccounts.id, account.id))
      await tx.delete(authSessions).where(eq(authSessions.userId, account.userId))
      const [remaining] = await tx.select({ id: authAccounts.id }).from(authAccounts).where(eq(authAccounts.userId, account.userId)).limit(1)
      if (account.userId !== user.id && !remaining) await tx.delete(authUsers).where(eq(authUsers.id, account.userId))
    }
  })
  return password
}
