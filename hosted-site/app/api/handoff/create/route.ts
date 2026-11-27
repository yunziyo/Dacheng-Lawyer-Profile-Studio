import { env } from "cloudflare:workers";

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

async function readBody(request: Request): Promise<unknown> {
  const maxBytes = 16 * 1024;
  const declared = Number(request.headers.get("Content-Length") || 0);
  if (declared > maxBytes) throw new Error("请求内容过大。");
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > maxBytes) throw new Error("请求内容过大。");
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}

export async function POST(request: Request): Promise<Response> {
  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "请求来源无效。" }, 403);
  const database = (env as unknown as { DB?: D1Database }).DB;
  if (!database) return json({ error: "工作台数据库尚未连接，请联系维护者。" }, 503);
  let body: unknown;
  try { body = await readBody(request); } catch (error) {
    return json({ error: error instanceof Error && error.message === "请求内容过大。" ? error.message : "请求格式不正确。" }, 400);
  }
  if (!body || typeof body !== "object" || (body as { platform?: unknown }).platform !== "deepseek-harness") {
    return json({ error: "当前仅支持 DeepSeek Harness。" }, 400);
  }
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  const raw = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
  const codeHash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  const hash = Array.from(new Uint8Array(codeHash), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const now = Math.floor(Date.now() / 1000);
  await database.prepare("DELETE FROM ai_handoffs WHERE expires_at <= ? OR state = 'consumed'").bind(now).run();
  await database.prepare("INSERT INTO ai_handoffs (code_hash,platform,state,profile_json,created_at,expires_at) VALUES (?,?,'waiting',NULL,?,?)")
    .bind(hash, "deepseek-harness", now, now + 900).run();
  return json({ code: `${raw.slice(0, 5)}-${raw.slice(5)}`, platform: "deepseek-harness", expiresAt: now + 900 }, 201);
}
