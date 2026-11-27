const FIELDS: Record<string,{label:string;category:string;limit:number}> = {
  name:{label:"姓名",category:"identity",limit:100}, title:{label:"职务",category:"identity",limit:180},
  phone:{label:"电话",category:"contact",limit:80}, email:{label:"邮箱",category:"contact",limit:254},
  wechat:{label:"微信",category:"contact",limit:160}, hero:{label:"首页简介",category:"hero",limit:1000},
  about:{label:"简介",category:"summary",limit:5000}, practice:{label:"专业方向",category:"practice",limit:1500},
  experience:{label:"执业经历",category:"experience",limit:2500}, education:{label:"教育背景",category:"education",limit:1500},
  achievement:{label:"成果",category:"achievement",limit:2500},
};
const THEMES=new Set(["quiet","editorial","deep","archive","orbit","grid"]);
const MAX_BODY=4*1024*1024;

function json(data:unknown,status=200){return Response.json(data,{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});}
async function readBody(request:Request):Promise<unknown>{
  const declared=Number(request.headers.get("Content-Length")||0);
  if(declared>MAX_BODY)throw new Error("提交内容过大。");
  const bytes=await request.arrayBuffer();
  if(bytes.byteLength>MAX_BODY)throw new Error("提交内容过大。");
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}

export async function parseSiteContent(request:Request):Promise<string|Response>{
  let input:unknown;
  try{input=await readBody(request);}catch(error){return json({error:error instanceof Error?error.message:"提交内容格式不正确。"},400);}
  if(!input||typeof input!=="object"||Array.isArray(input))return json({error:"提交内容格式不正确。"},400);
  const body=input as Record<string,unknown>;
  if(typeof body.theme!=="string"||!THEMES.has(body.theme))return json({error:"请选择有效的网站模板。"},400);
  if(!Array.isArray(body.items)||body.items.length>100)return json({error:"网站资料格式不正确。"},400);
  if(body.portrait!==undefined&&body.portrait!==""){
    if(typeof body.portrait!=="string"||body.portrait.length>1_500_000||!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(body.portrait))return json({error:"职业照格式或尺寸不正确。"},400);
  }
  const items:Array<Record<string,unknown>>=[];
  for(const candidate of body.items){
    if(!candidate||typeof candidate!=="object"||Array.isArray(candidate))return json({error:"网站资料格式不正确。"},400);
    const item=candidate as Record<string,unknown>;
    const field=typeof item.field==="string"?item.field:"";
    const spec=FIELDS[field];
    if(!spec||typeof item.value!=="string"||item.value.trim().length===0||item.value.length>spec.limit)return json({error:"网站资料字段或内容长度不正确。"},400);
    items.push({category:spec.category,label:spec.label,value:item.value.trim(),status:"accepted",
      disclosureOk:field==="achievement"&&item.disclosure===true,visibility:"public"});
  }
  if(!items.some(item=>item.label==="姓名"))return json({error:"网站至少需要一项已核对的姓名。"},400);
  return JSON.stringify({theme:body.theme,portrait:body.portrait||"",items});
}
