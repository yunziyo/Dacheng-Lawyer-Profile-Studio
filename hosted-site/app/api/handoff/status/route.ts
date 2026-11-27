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

async function digest(code: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function POST(request: Request): Promise<Response> {
  const origin=request.headers.get("Origin");
  if(origin&&origin!==new URL(request.url).origin) return json({error:"请求来源无效。"},403);
  const database = (env as unknown as { DB?: D1Database }).DB;
  if (!database) return json({ error: "工作台数据库尚未连接，请联系维护者。" }, 503);
  let body:unknown;try{body=await readBody(request);}catch(error){return json({error:error instanceof Error&&error.message==="请求内容过大。"?error.message:"请求格式不正确。"},400);}
  const raw = body&&typeof body==="object"&&typeof (body as {code?:unknown}).code==="string"?(body as {code:string}).code.replaceAll("-","").toUpperCase():"";
  if (!/^[A-HJ-NP-Z2-9]{10}$/.test(raw)) return json({ error: "传输码格式不正确或已失效。" }, 404);
  const hash = await digest(raw);
  const now = Math.floor(Date.now() / 1000);
  const row = await database.prepare("SELECT state,expires_at FROM ai_handoffs WHERE code_hash = ?").bind(hash).first<{state:string;expires_at:number}>();
  if (!row || row.expires_at <= now) {
    await database.prepare("DELETE FROM ai_handoffs WHERE code_hash = ?").bind(hash).run();
    return json({ error: "传输码已失效，请重新创建。" }, 410);
  }
  if (row.state === "waiting") return json({ state: "waiting", expiresAt: row.expires_at });
  if (row.state !== "ready") return json({ state: "consumed" });
  const redeemed = await database.prepare("DELETE FROM ai_handoffs WHERE code_hash = ? AND state = 'ready' AND expires_at > ? RETURNING profile_json")
    .bind(hash, now).first<{profile_json:string}>();
  if (!redeemed?.profile_json) return json({ state: "consumed" });
  try {
    const profile = JSON.parse(redeemed.profile_json) as {items?:unknown[];warnings?:unknown[]};
    return json({ state: "ready", items: Array.isArray(profile.items) ? profile.items : [], warnings: Array.isArray(profile.warnings) ? profile.warnings : [] });
  } catch {
    return json({ error: "回填资料无法读取，请重新生成传输码。" }, 500);
  }
}
