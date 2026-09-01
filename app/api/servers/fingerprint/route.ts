import { NextResponse } from "next/server";
import { z } from "zod";
import { SSHDeployer } from "@/deployer";

export const runtime = "nodejs";

const requestSchema = z.object({
  host: z.string().trim().min(1).max(253),
  port: z.coerce.number().int().min(1).max(65535).default(22),
}).strict();

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return NextResponse.json({ error: { code: "INVALID_INPUT", message: "invalid server host" } }, { status: 400 });
  try {
    const fingerprint = await new SSHDeployer({ privateKey: "" }).getHostFingerprint({ ...parsed.data, timeoutSeconds: 10 });
    return NextResponse.json({ data: { fingerprint } });
  } catch {
    return NextResponse.json({ error: { code: "FINGERPRINT_UNAVAILABLE", message: "unable to read SSH host fingerprint" } }, { status: 422 });
  }
}
