import { and, asc, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { deployments, logs } from "@/db/schema";
import { createLogEventStreamResponse } from "@/lib/sse";

export const runtime = "nodejs";

const TERMINAL_STATUSES = new Set(["succeeded", "failed", "cancelled", "partial"]);

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return createLogEventStreamResponse({
    request,
    endPayload: { deploymentId: id },
    queryLogsAfter: (sequence) =>
      db
        .select({
          id: logs.id,
          sequence: logs.sequence,
          targetId: logs.targetId,
          level: logs.level,
          message: logs.message,
          createdAt: logs.createdAt,
        })
        .from(logs)
        .where(and(eq(logs.deploymentId, id), gt(logs.sequence, sequence)))
        .orderBy(asc(logs.sequence)),
    isTerminal: async () => {
      const [deployment] = await db
        .select({ status: deployments.status })
        .from(deployments)
        .where(eq(deployments.id, id))
        .limit(1);
      return !deployment || TERMINAL_STATUSES.has(deployment.status);
    },
  });
}
