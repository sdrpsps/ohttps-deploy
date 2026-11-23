import { and, asc, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { certificateSyncJobs, logs } from "@/db/schema";
import { createLogEventStreamResponse } from "@/lib/sse";

export const runtime = "nodejs";

const TERMINAL_STATUSES = new Set(["succeeded", "failed", "cancelled"]);

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return createLogEventStreamResponse({
    request,
    endPayload: { syncJobId: id },
    queryLogsAfter: (sequence) =>
      db
        .select({
          id: logs.id,
          sequence: logs.sequence,
          level: logs.level,
          message: logs.message,
          createdAt: logs.createdAt,
        })
        .from(logs)
        .where(and(eq(logs.syncJobId, id), gt(logs.sequence, sequence)))
        .orderBy(asc(logs.sequence)),
    isTerminal: async () => {
      const [job] = await db
        .select({ status: certificateSyncJobs.status })
        .from(certificateSyncJobs)
        .where(eq(certificateSyncJobs.id, id))
        .limit(1);
      return !job || TERMINAL_STATUSES.has(job.status);
    },
  });
}
