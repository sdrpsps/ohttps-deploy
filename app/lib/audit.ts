import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { auditEvents } from "@/db/schema";
import { auth } from "@/lib/auth";

export async function recordAudit(request: Request, action: string, objectType: string, objectId?: string) {
  const session = await auth.api.getSession({ headers: request.headers });
  const actor = session ? (session.user.username === "admin" ? "admin" : `${session.user.name} (${session.user.id})`) : "unknown";
  return db.insert(auditEvents).values({ id: randomUUID(), actor, action, objectType, objectId, result: "success" });
}
