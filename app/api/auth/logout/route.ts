import { auth } from "@/lib/auth";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return auth.api.signOut({ headers: request.headers, asResponse: true });
}
