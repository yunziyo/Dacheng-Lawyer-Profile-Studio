import { env } from "cloudflare:workers";

function json(data:unknown,status=200){return Response.json(data,{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});}
async function digest(token:string):Promise<string>{
  const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token));
  return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,"0")).join("");
}
export async function GET(request:Request):Promise<Response>{
  const database=(env as unknown as {DB?:D1Database}).DB;
  if(!database)return json({error:"工作台数据库尚未连接。"},503);
  const token=(request.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
  if(!/^[A-Za-z0-9_-]{43}$/.test(token))return json({error:"管理链接无效。"},404);
  const row=await database.prepare("SELECT slug,content_json,active,updated_at FROM lawyer_sites WHERE manage_hash=?").bind(await digest(token)).first<{slug:string;content_json:string;active:number;updated_at:number}>();
  if(!row)return json({error:"管理链接无效或已失效。"},404);
  try{
    return json({content:JSON.parse(row.content_json),active:row.active===1,updatedAt:row.updated_at,
      publicUrl:new URL(`/p/${row.slug}`,request.url).toString(),slug:row.slug});
  }catch{return json({error:"网站资料无法读取。"},500);}
}
