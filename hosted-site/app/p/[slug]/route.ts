import { env } from "cloudflare:workers";

function html(body:string,status=200){return new Response(body,{status,headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer","Content-Security-Policy":"default-src 'self' data:; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'self' 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"}});}
function escapeScriptJson(value:unknown):string{return JSON.stringify(value).replaceAll("<","\\u003c").replaceAll(">","\\u003e").replaceAll("&","\\u0026").replaceAll("\u2028","\\u2028").replaceAll("\u2029","\\u2029");}

export async function GET(request:Request,{params}:{params:Promise<{slug:string}>}):Promise<Response>{
  const database=(env as unknown as {DB?:D1Database}).DB;
  if(!database)return html("<!doctype html><html lang=zh-CN><meta charset=utf-8><title>页面暂不可用</title><body><main><h1>页面暂不可用</h1></main></body></html>",503);
  const {slug}=await params;
  if(!/^[a-f0-9]{16}$/.test(slug))return html("<!doctype html><html lang=zh-CN><meta charset=utf-8><title>页面不存在</title><body><main><h1>页面不存在</h1></main></body></html>",404);
  const row=await database.prepare("SELECT content_json,active FROM lawyer_sites WHERE slug=?").bind(slug).first<{content_json:string;active:number}>();
  if(!row)return html("<!doctype html><html lang=zh-CN><meta charset=utf-8><title>页面不存在</title><body><main><h1>页面不存在</h1></main></body></html>",404);
  if(row.active!==1)return html("<!doctype html><html lang=zh-CN><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>页面已撤回</title><body style='font-family:system-ui,sans-serif;margin:12vh auto;max-width:680px;padding:24px;color:#302835'><h1>此个人网站已由律师撤回</h1><p>页面内容已停止公开。</p></body></html>");
  try{
    const content=JSON.parse(row.content_json) as {theme:string;portrait:string;items:unknown[]};
    const payload=escapeScriptJson(content);
    const page=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="index,follow"><title>律师个人网站</title><script src="/site-renderer.js"></script></head><body><script>const profile=${payload};document.open();document.write(window.SiteRenderer.render(profile.items,{theme:profile.theme,portrait:profile.portrait,logo:"/brand.png",workbench:false,draft:false}));document.close();</script></body></html>`;
    return html(page);
  }catch{return html("<!doctype html><html lang=zh-CN><meta charset=utf-8><title>页面暂不可用</title><body><main><h1>页面暂不可用</h1></main></body></html>",500);}
}
