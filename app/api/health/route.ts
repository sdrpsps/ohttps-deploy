import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ status: "ok", service: "ohttps-deploy", timestamp: new Date().toISOString() });
}
