import { copyFile, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { NextResponse } from "next/server";
import { loadConfig } from "@/lib/config";
export const runtime = "nodejs";
export async function GET() {
  const config = loadConfig();
  const path = config.DATABASE_URL.startsWith("file:") ? config.DATABASE_URL.slice(5) : config.DATABASE_URL;
  if (!path.startsWith(".") && !path.startsWith("/")) return NextResponse.json({ error: { code: "UNSUPPORTED_STORAGE", message: "当前数据库连接不支持文件备份" } }, { status: 400 });
  try { const data = await readFile(path); return new Response(data, { headers: { "content-type": "application/octet-stream", "content-disposition": `attachment; filename="ohttps-deploy-${new Date().toISOString().slice(0, 10)}.db"` } }); }
  catch { return NextResponse.json({ error: { code: "BACKUP_FAILED", message: "数据库备份失败" } }, { status: 500 }); }
}

export async function POST(request: Request) {
  if (request.headers.get("x-confirm-restore") !== "yes") return NextResponse.json({ error: { code: "CONFIRMATION_REQUIRED", message: "恢复会覆盖当前数据库，请设置 x-confirm-restore: yes" } }, { status: 400 });
  const config = loadConfig();
  const path = config.DATABASE_URL.startsWith("file:") ? config.DATABASE_URL.slice(5) : config.DATABASE_URL;
  if (!path.startsWith(".") && !path.startsWith("/")) return NextResponse.json({ error: { code: "UNSUPPORTED_STORAGE", message: "当前数据库连接不支持文件恢复" } }, { status: 400 });
  const body = await request.arrayBuffer();
  if (body.byteLength < 100 || body.byteLength > 2 * 1024 * 1024 * 1024) return NextResponse.json({ error: { code: "INVALID_BACKUP", message: "备份文件无效或过大" } }, { status: 400 });
  const header = Buffer.from(body).subarray(0, 16).toString("utf8");
  if (header !== "SQLite format 3\u0000") return NextResponse.json({ error: { code: "INVALID_BACKUP", message: "不是有效的 SQLite 备份" } }, { status: 400 });
  const temp = `${path}.restore-${process.pid}-${Date.now()}`;
  try { await mkdir(dirname(path), { recursive: true }); await writeFile(temp, Buffer.from(body), { mode: 0o600 }); await copyFile(path, `${path}.before-restore`).catch(() => undefined); await rename(temp, path); return NextResponse.json({ data: { restored: true, previousBackup: `${path}.before-restore` } }); }
  catch { await unlink(temp).catch(() => undefined); return NextResponse.json({ error: { code: "RESTORE_FAILED", message: "数据库恢复失败" } }, { status: 500 }); }
}
