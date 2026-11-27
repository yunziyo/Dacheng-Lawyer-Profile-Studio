import { env } from "cloudflare:workers";
import { parseSiteContent } from "../../../lib/site-content";

function json(data:unknown,status=200){return Response.json(data,{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});}

export async function POST(request:Request):Promise<Response>{
  const origin=request.headers.get("Origin");
  if(origin&&origin!==new URL(request.url).origin)return json({error:"请求来源无效。"},403);
  const database=(env as unknown as {DB?:D1Database}).DB;
  if(!database)return json({error:"工作台数据库尚未连接。"},503);
  const token=(request.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
  if(!/^[A-Za-z0-9_-]{43}$/.test(token))return json({error:"管理链接无效。"},404);
  const content=await parseSiteContent(request);
  if(content instanceof Response)return content;
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token));
  const fingerprint=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,"0")).join("");
  const now=Math.floor(Date.now()/1000);
  const row=await database.prepare("UPDATE lawyer_sites SET content_json=?,active=1,updated_at=? WHERE manage_hash=? RETURNING slug")
    .bind(content,now,fingerprint).first<{slug:string}>();
  if(!row)return json({error:"管理链接无效或已失效。"},404);
  return json({ok:true,publicUrl:new URL(`/p/${row.slug}`,request.url).toString(),updatedAt:now});
}
