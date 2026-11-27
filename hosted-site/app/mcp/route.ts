import { env } from "cloudflare:workers";

const FIELDS = new Set(["name","title","hero","about","phone","email","wechat","practice","experience","education","achievement"]);
const CAPS: Record<string, number> = {name:100,title:180,hero:1000,about:5000,phone:80,email:254,wechat:160,practice:1500,experience:2500,education:1500,achievement:2500};
type ProfileItem = {field:string;value:string;sources:string[];reviewNote:string};

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
function rpc(id: unknown, result: unknown): Response { return json({jsonrpc:"2.0",id,result}); }
function error(id: unknown, code: number, message: string): Response { return json({jsonrpc:"2.0",id,error:{code,message}}); }
async function digest(code: string): Promise<string> {
  const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(code));
  return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,"0")).join("");
}

async function readMessage(request: Request): Promise<Record<string,unknown>> {
  const maxBytes=256*1024;
  const declared=Number(request.headers.get("Content-Length")||0);
  if(declared>maxBytes) throw new Error("MCP 请求内容过大。");
  const bytes=await request.arrayBuffer();
  if(bytes.byteLength>maxBytes) throw new Error("MCP 请求内容过大。");
  const message=JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  if(!message||typeof message!=="object"||Array.isArray(message)) throw new Error("MCP 请求不是有效的 JSON-RPC 对象。");
  return message as Record<string,unknown>;
}

const tool = {
  name:"submit_confirmed_profile",
  description:"将律师在对话中逐项核对并明确确认的简历资料回填到一次性工作台传输码。必须先展示字段和来源并获得律师明确确认，不得提前调用。",
  inputSchema:{type:"object",additionalProperties:false,required:["code","items"],properties:{
    code:{type:"string",description:"工作台显示的 10 位传输码"},
    items:{type:"array",maxItems:100,items:{type:"object",additionalProperties:false,required:["field","value"],properties:{
      field:{type:"string",enum:[...FIELDS]},value:{type:"string"},sources:{type:"array",maxItems:8,items:{type:"string"}},reviewNote:{type:"string"}}}},
    warnings:{type:"array",maxItems:20,items:{type:"string"}}}},
};

async function callTool(args: Record<string,unknown>, database?: D1Database): Promise<{text:string;isError:boolean}> {
  if(!database) return {text:"工作台数据库尚未连接。",isError:true};
  const raw=typeof args.code==="string"?args.code.replaceAll("-","").toUpperCase():"";
  if(!/^[A-HJ-NP-Z2-9]{10}$/.test(raw)) return {text:"传输码格式不正确或已失效。",isError:true};
  if(!Array.isArray(args.items)||args.items.length===0||args.items.length>100) return {text:"没有可回填的资料项。",isError:true};
  const items:ProfileItem[]=[];
  for(const item of args.items){
    if(!item||typeof item!=="object"||Array.isArray(item)) return {text:"资料字段格式不正确。",isError:true};
    const row=item as Record<string,unknown>;
    if(typeof row.field!=="string"||!FIELDS.has(row.field)||typeof row.value!=="string") return {text:"资料字段格式不正确。",isError:true};
    const value=row.value.trim();
    if(!value||value.length>CAPS[row.field]) return {text:`请检查「${row.field}」候选内容长度。`,isError:true};
    const sources=row.sources??[];
    if(!Array.isArray(sources)||sources.length>8||sources.some(source=>typeof source!=="string"||source.length>600)) return {text:"原文依据格式不正确。",isError:true};
    const reviewNote=row.reviewNote??"";
    if(typeof reviewNote!=="string"||reviewNote.length>300) return {text:"核对提示格式不正确。",isError:true};
    items.push({field:row.field,value,sources:sources as string[],reviewNote});
  }
  const warnings=args.warnings??[];
  if(!Array.isArray(warnings)||warnings.length>20||warnings.some(note=>typeof note!=="string"||note.length>300)) return {text:"核对提示格式不正确。",isError:true};
  const codeHash=await digest(raw),now=Math.floor(Date.now()/1000);
  const result=await database.prepare("UPDATE ai_handoffs SET state='ready',profile_json=? WHERE code_hash=? AND platform='deepseek-harness' AND state='waiting' AND expires_at>? RETURNING code_hash")
    .bind(JSON.stringify({items,warnings}),codeHash,now).first<{code_hash:string}>();
  if(!result) return {text:"传输码已使用或过期，请回到工作台重新创建。",isError:true};
  return {text:"资料已送回工作台。请律师切回工作台，逐项检查 AI 候选并自行选择是否使用。",isError:false};
}

export async function POST(request:Request):Promise<Response>{
  let message:Record<string,unknown>;
  try{message=await readMessage(request);}
  catch(error){return json({error:error instanceof Error?error.message:"MCP 请求不是有效的 JSON。"},400);}
  const id=message.id??null,method=message.method;
  if(message.jsonrpc!=="2.0"||typeof method!=="string"||(id!==null&&typeof id!=="string"&&typeof id!=="number")) return error(id,-32600,"Invalid Request");
  if(method==="notifications/initialized") return new Response(null,{status:202,headers:{"Cache-Control":"no-store"}});
  if(method==="initialize"){
    const versions=["2026-07-28","2025-03-26","2024-11-05"];
    const params=message.params;
    if(params!==undefined&&(!params||typeof params!=="object"||Array.isArray(params))) return error(id,-32602,"Invalid params");
    const requested=(params as {protocolVersion?:unknown}|undefined)?.protocolVersion;
    const protocolVersion=typeof requested==="string"&&versions.includes(requested)?requested:"2025-03-26";
    return rpc(id,{protocolVersion,capabilities:{tools:{}},serverInfo:{name:"dacheng-profile-assistant",version:"1.0.0"}});
  }
  if(method==="ping") return rpc(id,{});
  if(method==="tools/list") return rpc(id,{tools:[tool]});
  if(method!=="tools/call") return error(id,-32601,"Method not found");
  const params=message.params;
  if(!params||typeof params!=="object"||Array.isArray(params)) return error(id,-32602,"Invalid params");
  const call=params as {name?:unknown;arguments?:unknown};
  if(call.name!==tool.name) return error(id,-32602,"Unknown tool");
  const args=call.arguments;
  if(!args||typeof args!=="object"||Array.isArray(args)) return error(id,-32602,"Invalid tool arguments");
  const database=(env as unknown as {DB?:D1Database}).DB;
  const result=await callTool(args as Record<string,unknown>,database);
  return rpc(id,{isError:result.isError,content:[{type:"text",text:result.text}]});
}
