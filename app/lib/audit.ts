import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { auditEvents } from "@/db/schema";

export function recordAudit(action: string, objectType: string, objectId?: string) {
  return db.insert(auditEvents).values({ id: randomUUID(), action, objectType, objectId, result: "success" });
}
