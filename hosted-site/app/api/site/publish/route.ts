import { env } from "cloudflare:workers";
import { parseSiteContent } from "../../../lib/site-content";

function json(data:unknown,status=200){return Response.json(data,{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});}
async function hash(value:string):Promise<string>{
  const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,"0")).join("");
}
function randomHex(bytes:number):string{return Array.from(crypto.getRandomValues(new Uint8Array(bytes)),x=>x.toString(16).padStart(2,"0")).join("");}
function randomToken():string{
  const bytes=crypto.getRandomValues(new Uint8Array(32));
  return btoa(Array.from(bytes,byte=>String.fromCharCode(byte)).join("")).replaceAll("+","-").replaceAll("/","_").replaceAll("=","");
}

export async function POST(request:Request):Promise<Response>{
  const origin=request.headers.get("Origin");
  if(origin&&origin!==new URL(request.url).origin)return json({error:"请求来源无效。"},403);
  const database=(env as unknown as {DB?:D1Database}).DB;
  if(!database)return json({error:"工作台数据库尚未连接。"},503);
  const content=await parseSiteContent(request);
  if(content instanceof Response)return content;
  const manageToken=randomToken(),manageHash=await hash(manageToken),now=Math.floor(Date.now()/1000);
  let slug="";
  for(let attempt=0;attempt<4;attempt++){
    slug=randomHex(8);
    const existing=await database.prepare("SELECT slug FROM lawyer_sites WHERE slug=?").bind(slug).first();
    if(!existing)break;
    slug="";
  }
  if(!slug)return json({error:"暂时无法创建网站，请重试。"},503);
  try{
    await database.prepare("INSERT INTO lawyer_sites (slug,manage_hash,content_json,active,created_at,updated_at) VALUES (?,?,?,1,?,?)")
      .bind(slug,manageHash,content,now,now).run();
  }catch{return json({error:"网站发布失败，请重试。"},503);}
  const publicUrl=new URL(`/p/${slug}`,request.url).toString();
  return json({ok:true,publicUrl,manageUrl:`${new URL(request.url).origin}/#/manage/${manageToken}`,slug,createdAt:now},201);
}
