import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

// ponytail: process-local limiter; use a shared store when running multiple web replicas.
const requests = new Map<string, { count: number; resetAt: number }>();

export const runtime = "nodejs";

function trustedOrigin(request: NextRequest) {
  try {
    // The public URL remains stable when a TLS proxy forwards requests to this container.
    return new URL(process.env.BETTER_AUTH_URL ?? request.nextUrl.origin).origin;
  } catch {
    return request.nextUrl.origin;
  }
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // 登录页、健康检查和 Better Auth 自身的接口不需要登录。
  const isPublicPath =
    path === "/login" ||
    path === "/api/health" ||
    path.startsWith("/api/auth/");
  if (isPublicPath) return NextResponse.next();

  // 限制单个来源的请求频率，避免登录和管理接口被滥用。
  const key = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const now = Date.now();
  const current = requests.get(key);
  if (!current || current.resetAt <= now) {
    requests.set(key, { count: 1, resetAt: now + 60_000 });
  } else if (++current.count > 120) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "请求过于频繁" } },
      { status: 429, headers: { "retry-after": "60" } },
    );
  }

  // 写请求必须来自当前站点，防止跨站请求伪造。
  const isMutation = ["POST", "PUT", "PATCH", "DELETE"].includes(request.method);
  if (isMutation) {
    const origin = request.headers.get("origin");
    if (origin && origin !== trustedOrigin(request)) {
      return NextResponse.json(
        { error: { code: "CSRF_REJECTED", message: "跨站请求已拒绝" } },
        { status: 403 },
      );
    }
  }

  // 页面请求重定向到登录页，API 请求返回结构化错误。
  const unauthenticated = () => path.startsWith("/api/")
    ? NextResponse.json(
      { error: { code: "UNAUTHENTICATED", message: "请先登录" } },
      { status: 401 },
    )
    : NextResponse.redirect(new URL("/login", request.url));

  // Better Auth 负责读取 cookie、查询会话并判断是否有效。
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    return session ? NextResponse.next() : unauthenticated();
  } catch {
    // 无效或损坏的 cookie 也按未登录处理，不暴露内部错误。
    return unauthenticated();
  }
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
