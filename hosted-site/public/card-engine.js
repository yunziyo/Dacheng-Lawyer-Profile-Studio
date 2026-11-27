/* Editable SVG business-card templates. All text remains text; visual parts use separate groups. */
const OfficialCardLogos = typeof module !== 'undefined' ? require('./logo-data.js') : globalThis.CardLogos;
const CardEngine = (() => {
  const W = 1080, H = 648, P = '#702082';
  const templates = [
    {id:'01',name:'紫线白笺',family:'极简',coverage:'紫色细线',motif:'line',bg:'#FCFAFD',ink:'#2D2332',accent:'#CDBAD4',dark:false,x:82},
    {id:'02',name:'双框秩序',family:'极简',coverage:'紫色双框',motif:'frame',bg:'#F8F5FA',ink:'#291D30',accent:'#B9A0C3',dark:false,x:96},
    {id:'03',name:'浅雾薰衣',family:'柔和',coverage:'淡紫上栏',motif:'soft',bg:'#F9F7FC',ink:'#31233B',accent:'#B7A6D6',dark:false,x:83},
    {id:'04',name:'柔紫留影',family:'雅致',coverage:'紫色点缀与灰粉',motif:'rose',bg:'#FBF8FA',ink:'#352638',accent:'#D9C2CE',dark:false,x:82},
    {id:'05',name:'紫蓝冷调',family:'柔和',coverage:'约 1/4 紫色',motif:'blue',bg:'#F7F9FD',ink:'#283247',accent:'#8D9FB9',dark:false,x:330},
    {id:'06',name:'米金书页',family:'经典',coverage:'紫色点缀与米金',motif:'cream',bg:'#FCF8F2',ink:'#392C34',accent:'#C6A987',dark:false,x:84},
    {id:'07',name:'紫色边栏',family:'经典',coverage:'约 1/3 紫色',motif:'rail',bg:'#FAF9FC',ink:'#2B2033',accent:'#9F7BAC',dark:false,x:350},
    {id:'08',name:'斜切紫域',family:'构成',coverage:'约 2/5 紫色',motif:'diagonal',bg:'#FBF9FC',ink:'#2E2236',accent:'#B69CC2',dark:false,x:82},
    {id:'09',name:'左右对照',family:'构成',coverage:'约 1/2 紫色',motif:'half',bg:'#F8F6FA',ink:'#30253A',accent:'#B59EC1',dark:false,x:570},
    {id:'10',name:'几何块面',family:'构成',coverage:'约 1/2 紫色',motif:'blocks',bg:'#F7F4F9',ink:'#30223B',accent:'#9671AB',dark:false,x:82},
    {id:'11',name:'流动紫浪',family:'流线',coverage:'约 2/5 紫色',motif:'wave',bg:'#F9F5FB',ink:'#2B1F35',accent:'#A989C5',dark:false,x:82},
    {id:'12',name:'环线回响',family:'流线',coverage:'约 2/5 紫色',motif:'arc',bg:'#F8F4FA',ink:'#2D2039',accent:'#BA9ED0',dark:false,x:82},
    {id:'13',name:'紫域同心',family:'流线',coverage:'深紫满版',motif:'rings',bg:'#321A43',ink:'#FFFFFF',accent:'#A583D0',dark:true,x:82},
    {id:'14',name:'暮紫渐层',family:'流线',coverage:'紫色渐层满版',motif:'gradient',bg:'#40225B',ink:'#FFFFFF',accent:'#CFB6E6',dark:true,x:82},
    {id:'15',name:'格点理性',family:'现代',coverage:'深紫满版',motif:'grid',bg:'#2C1939',ink:'#FFFFFF',accent:'#B79CC9',dark:true,x:82},
    {id:'16',name:'紫金礼序',family:'经典',coverage:'深紫与暖金满版',motif:'gold',bg:'#26152E',ink:'#FFFFFF',accent:'#C8A66A',dark:true,x:82},
    {id:'17',name:'满版品牌紫',family:'经典',coverage:'品牌紫满版',motif:'full',bg:P,ink:'#FFFFFF',accent:'#D4B8DF',dark:true,x:82},
    {id:'18',name:'黑紫光晕',family:'现代',coverage:'黑紫满版',motif:'noir',bg:'#17111D',ink:'#FFFFFF',accent:'#AE8DD2',dark:true,x:82},
    {id:'19',name:'紫藤线稿',family:'线描',coverage:'紫色线描',motif:'botanical',bg:'#FAF8F4',ink:'#302338',accent:'#A88EB1',dark:false,x:82},
    {id:'20',name:'曲面留白',family:'构成',coverage:'有机紫色块面',motif:'organic',bg:'#F9F7FB',ink:'#291C33',accent:'#C1A8CF',dark:false,x:82},
  ];
  const sample = {name:'示例律师',nameEn:'SAMPLE LAWYER',title:'律师',practice:'争议解决 · 公司事务',phone:'+86 755 0000 0000',email:'your.name@example.com',address:'深圳市 · 办公地址待填写',website:'personal.example.com'};
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
  const fitSize=(value,maxWidth,base,min=19)=>{
    const units=[...String(value??'')].reduce((n,c)=>n+(/[\u0000-\u00ff]/.test(c)?.58:1),0);
    return Math.max(min,Math.min(base,Math.floor(maxWidth/Math.max(1,units*1.08))));
  };
  const attr = (o) => Object.entries(o).map(([k,v]) => ` ${k}="${esc(v)}"`).join('');
  const rect=(x,y,w,h,fill,other={})=>`<rect${attr({x,y,width:w,height:h,fill,...other})}/>`;
  const circle=(cx,cy,r,fill,other={})=>`<circle${attr({cx,cy,r,fill,...other})}/>`;
  const path=(d,fill,other={})=>`<path${attr({d,fill,...other})}/>`;
  const stroke=(x1,y1,x2,y2,color,width=2,other={})=>`<line${attr({x1,y1,x2,y2,stroke:color,'stroke-width':width,...other})}/>`;
  const text=(x,y,value,size,color,weight=400,other={})=>`<text${attr({x,y,fill:color,'font-size':size,'font-weight':weight,...other})}>${esc(value)}</text>`;
  const defs = `<defs>
    <linearGradient id="violetGrad" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#3B1C53"/><stop offset=".53" stop-color="#702082"/><stop offset="1" stop-color="#A56DCE"/></linearGradient>
    <linearGradient id="nightGrad" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#17111D"/><stop offset=".6" stop-color="#302041"/><stop offset="1" stop-color="#702082"/></linearGradient>
    <radialGradient id="glow"><stop offset="0" stop-color="#9A68D1" stop-opacity=".82"/><stop offset="1" stop-color="#9A68D1" stop-opacity="0"/></radialGradient>
    <pattern id="dotGrid" width="34" height="34" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="1.7" fill="#D7C3E2" opacity=".45"/></pattern>
  </defs>`;

  function motif(t, side) {
    const back = side === 'back';
    const purple=P, a=t.accent;
    if(back && !t.dark){
      const n=Number(t.id);
      return (n%3===0?rect(0,0,W,18,purple):rect(0,0,20,H,purple))+
        stroke(78,165,1002,165,a,3)+
        circle(1020,545,154,'none',{stroke:a,'stroke-width':3,opacity:.42})+
        (n%3===1?rect(0,630,W,18,a):'');
    }
    const lines = Array.from({length:6},(_,i)=>stroke(48,590+i*10,1032,590+i*10,purple,1,{opacity:.08})).join('');
    switch(t.motif){
      case 'line': return rect(0,0,W,10,purple)+rect(70,70,940,508,'none',{stroke:'#E5DCE9','stroke-width':2})+stroke(78,back?125:205,1002,back?125:205,purple,3)+lines;
      case 'frame': return rect(38,38,1004,572,'none',{stroke:purple,'stroke-width':3})+rect(53,53,974,542,'none',{stroke:a,'stroke-width':1})+rect(38,38,270,11,purple)+circle(975,91,17,purple);
      case 'soft': return rect(0,0,W,160,'#ECE5F3')+rect(0,0,21,H,purple)+circle(958,532,245,'#E5D9EE',{opacity:.6})+circle(978,530,150,'none',{stroke:a,'stroke-width':6});
      case 'rose': return path('M770 0 H1080 V648 H962 C935 520 1045 442 1002 320 C965 218 845 132 770 0 Z','#E8DDE5',{opacity:.72})+
        path('M834 0 C920 120 1010 202 1030 322 C1043 405 979 490 996 648','none',{stroke:a,'stroke-width':4,opacity:.8})+
        rect(0,0,15,H,purple)+stroke(80,521,695,521,purple,3);
      case 'blue': return rect(0,0,280,H,purple)+rect(280,0,35,H,a)+rect(315,0,8,H,'#C9D3E2')+circle(140,510,95,'none',{stroke:'#B9C7DB','stroke-width':4,opacity:.65});
      case 'cream': return rect(0,0,W,112,'#EEE4D9')+rect(0,0,14,H,purple)+
        stroke(445,190,445,566,a,2,{opacity:.55})+
        circle(250,375,145,'none',{stroke:'#D8C7B7','stroke-width':3,opacity:.42})+
        circle(250,375,105,'none',{stroke:'#D8C7B7','stroke-width':2,opacity:.32})+
        stroke(80,527,1000,527,a,3);
      case 'rail': return rect(0,0,290,H,purple)+rect(290,0,22,H,a)+stroke(340,600,1000,600,purple,3)+rect(740,36,300,13,'#E4D7EA');
      case 'diagonal': return path('M748 0 H1080 V648 H563 Z',purple)+path('M760 0 H815 L630 648 H575 Z',a)+circle(1000,116,140,'none',{stroke:'#D9C2E5','stroke-width':3,opacity:.7});
      case 'half': return rect(0,0,500,H,purple)+rect(500,0,22,H,a)+circle(250,325,175,'none',{stroke:'#BEA1CE','stroke-width':4,opacity:.7});
      case 'blocks': return rect(690,0,390,H,purple)+rect(560,0,130,648,a)+rect(800,70,220,130,'#B795CC',{opacity:.45})+rect(807,200,140,170,'#4C1C63',{opacity:.65});
      case 'wave': return path('M0 435 C230 310 400 570 600 440 C780 326 960 350 1080 245 V648 H0 Z','#B995D1',{opacity:.72})+path('M0 508 C270 366 465 600 715 470 C860 396 1010 423 1080 340 V648 H0 Z',purple)+path('M0 565 C260 480 500 622 800 518 C890 492 1018 500 1080 456 V648 H0 Z','#49205F',{opacity:.75});
      case 'arc': return circle(988,325,395,purple)+circle(988,325,300,'none',{stroke:'#D7BEE5','stroke-width':16,opacity:.72})+circle(988,325,220,'none',{stroke:'#E6D9EE','stroke-width':4,opacity:.8});
      case 'rings': return circle(950,364,440,'#5B2B79')+circle(950,364,350,'none',{stroke:'#B188D7','stroke-width':22,opacity:.63})+circle(950,364,247,'none',{stroke:'#C8ADE4','stroke-width':3})+stroke(80,522,620,522,a,3);
      case 'gradient': return rect(0,0,W,H,'url(#violetGrad)')+path('M0 515 C230 415 520 650 800 485 C905 425 997 440 1080 405 V648 H0 Z','#C29BDF',{opacity:.28})+path('M0 585 C350 515 625 670 1080 505 V648 H0 Z','#2B1744',{opacity:.55});
      case 'grid': return rect(0,0,W,H,t.bg)+rect(0,0,W,H,'url(#dotGrid)')+rect(736,0,344,H,purple)+circle(925,325,240,'none',{stroke:'#B89AD0','stroke-width':3,opacity:.6})+rect(30,30,1020,588,'none',{stroke:'#8B60A3','stroke-width':2,opacity:.55});
      case 'gold': return rect(0,0,W,H,t.bg)+rect(0,0,W,9,a)+circle(995,235,330,'none',{stroke:a,'stroke-width':4,opacity:.8})+circle(1010,240,250,'none',{stroke:'#815990','stroke-width':21,opacity:.55})+stroke(80,514,650,514,a,3);
      case 'full': return rect(0,0,W,H,purple)+rect(50,50,980,548,'none',{stroke:'#D9BCE5','stroke-width':2})+circle(1010,120,160,'#8F48A6',{opacity:.35})+stroke(80,512,666,512,a,3);
      case 'noir': return rect(0,0,W,H,'url(#nightGrad)')+circle(950,425,470,'url(#glow)')+circle(860,480,320,'none',{stroke:'#AE8DD2','stroke-width':3,opacity:.7})+rect(0,0,W,8,a)+stroke(80,516,650,516,a,3);
      case 'botanical': return rect(0,0,16,H,purple)+path('M820 648 C795 530 835 444 905 358 C970 280 982 175 951 60','none',{stroke:'#8B6197','stroke-width':5,opacity:.75})+
        path('M857 520 C782 510 741 458 724 400 C805 405 855 445 857 520 Z','#D9C8DE',{opacity:.7})+
        path('M890 390 C985 375 1030 315 1040 250 C963 270 913 318 890 390 Z','#E7D9E9',{opacity:.9})+
        path('M932 255 C850 238 812 192 793 130 C868 143 918 183 932 255 Z','#C8B3D0',{opacity:.58})+
        stroke(740,575,1030,575,a,2)+circle(898,127,23,'none',{stroke:a,'stroke-width':3});
      case 'organic': return path('M825 0 H1080 V648 H700 C735 540 807 490 792 390 C773 276 872 208 845 105 C837 74 826 35 825 0 Z',purple)+
        path('M772 0 C780 77 829 138 791 224 C747 319 766 365 753 421 C736 493 692 556 674 648','none',{stroke:'#B99AC8','stroke-width':26,opacity:.72})+
        path('M870 0 C882 82 916 140 876 218 C834 299 850 402 833 472 C814 550 785 594 769 648','none',{stroke:'#CFB7DA','stroke-width':4,opacity:.6})+
        stroke(80,514,610,514,a,3);
      default: return '';
    }
  }
  function logo(t,side){
    const onDark=t.dark || (side==='front' && ['blue','rail','half'].includes(t.motif));
    const URI=onDark ? OfficialCardLogos.white : OfficialCardLogos.purple;
    let x=side==='back'?760:t.x;
    let y=side==='back'?60:76;
    let w=side==='back'?260:330;
    if(t.motif==='blue'&&side==='front'){x=35;y=75;w=230;}
    if(t.motif==='rail'&&side==='front'){x=32;y=75;w=228;}
    if(t.motif==='half'&&side==='front'){x=62;y=75;w=355;}
    if(['frame','full'].includes(t.motif)&&side==='front'){x=375;y=76;w=330;}
    return `<g id="brand-logo" data-layer="official-logo"><image x="${x}" y="${y}" width="${w}" height="${Math.round(w*0.225)}" preserveAspectRatio="xMinYMin meet" href="${URI}"/></g>`;
  }
  function frontText(t,d){
    const x=t.x, color=t.ink, nameSize=fitSize(d.name,1000-x,77,38);
    const muted=t.dark?'#E2D6E9':'#6E5F73';
    const englishColor=t.motif==='wave'?'#FFFFFF':muted;
    if(['frame','full'].includes(t.motif))return `<g id="personal-details" data-layer="editable-text">
      ${text(540,320,d.name,fitSize(d.name,710,74,38),color,650,{id:'card-name','text-anchor':'middle'})}
      ${stroke(345,351,735,351,t.accent,4)}
      ${text(540,405,d.title,29,color,500,{id:'card-title','text-anchor':'middle'})}
      ${text(540,455,d.practice,fitSize(d.practice,730,26),muted,400,{id:'card-practice','text-anchor':'middle'})}
      ${text(540,553,d.nameEn,fitSize(d.nameEn,730,24),muted,500,{id:'card-name-en','text-anchor':'middle','letter-spacing':2})}
    </g>`;
    if(t.motif==='cream')return `<g id="personal-details" data-layer="editable-text">
      ${text(520,307,d.name,fitSize(d.name,485,74,38),color,650,{id:'card-name'})}
      ${stroke(520,342,985,342,t.accent,4)}
      ${text(520,398,d.title,29,color,500,{id:'card-title'})}
      ${text(520,447,d.practice,fitSize(d.practice,480,25),muted,400,{id:'card-practice'})}
      ${text(520,559,d.nameEn,fitSize(d.nameEn,480,24),muted,500,{id:'card-name-en','letter-spacing':2})}
    </g>`;
    const nameY=t.motif==='wave'?260:303;
    const ruleY=t.motif==='wave'?294:339;
    const titleY=t.motif==='wave'?344:392;
    const practiceY=t.motif==='wave'?393:440;
    return `<g id="personal-details" data-layer="editable-text">
      ${text(x,nameY,d.name,nameSize,color,650,{id:'card-name'})}
      ${stroke(x,ruleY,Math.min(1000,x+480),ruleY,t.accent,4)}
      ${text(x,titleY,d.title,fitSize(d.title,1000-x,30),color,500,{id:'card-title'})}
      ${text(x,practiceY,d.practice,fitSize(d.practice,1000-x,27),t.motif==='wave'?'#55415B':muted,400,{id:'card-practice'})}
      ${text(x,559,d.nameEn,fitSize(d.nameEn,1000-x,25),englishColor,500,{id:'card-name-en','letter-spacing':2})}
    </g>`;
  }
  function backText(t,d,workbench){
    let x=84, maxX=727;
    const color=t.ink, lab=t.dark?t.accent:P, linecol=t.dark?'#8C70A0':'#D8C9DE';
    const values=[['电话',d.phone],['邮箱',d.email],['地址',d.address],['网站',d.website]].filter(([,value])=>!workbench || value);
    const rows=values.map(([label,value],i)=>{
      const y=233+i*82;const fs=fitSize(value,maxX-(x+115),28,18);
      return `<g id="contact-${i+1}" data-layer="editable-contact">${text(x,y,label,25,lab,600)}${text(x+115,y,value,fs,color,400)}${stroke(x,y+26,maxX,y+26,linecol,2)}</g>`;
    }).join('');
    const caption=t.dark?'#D8CBDF':'#796C7E';
    return `<g id="contact-details" data-layer="editable-text">${values.length ? text(x,139,'CONTACT  /  联系',34,lab,650,{id:'contact-heading'}) : ''}${rows}${text(x,574,workbench ? '北京大成（深圳）律师事务所' : '北京大成（深圳）律师事务所 · 模板示例',21,caption,400,{id:'firm-line'})}</g>`;
  }
  function qrPanel(t,d,workbench){
    const x=796,y=292,s=210,inside=190;
    const caption=t.dark?'#E8DCEF':P;
    const placeholder=`${stroke(x+23,y+26,x+65,y+26,P,4)}${stroke(x+23,y+26,x+23,y+68,P,4)}
      ${stroke(x+s-23,y+26,x+s-65,y+26,P,4)}${stroke(x+s-23,y+26,x+s-23,y+68,P,4)}
      ${stroke(x+23,y+s-26,x+65,y+s-26,P,4)}${stroke(x+23,y+s-26,x+23,y+s-68,P,4)}
      ${stroke(x+s-23,y+s-26,x+s-65,y+s-26,P,4)}${stroke(x+s-23,y+s-26,x+s-23,y+s-68,P,4)}
      ${text(x+s/2,y+105,'二维码位置',23,P,600,{'text-anchor':'middle'})}
      ${text(x+s/2,y+138,'上传后替换',17,'#8A728F',400,{'text-anchor':'middle'})}`;
    const safeQr=typeof d.qrData==='string' && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(d.qrData) ? d.qrData : '';
    if(workbench && !safeQr) return '';
    const code=safeQr?`<image x="${x+10}" y="${y+10}" width="${inside}" height="${inside}" preserveAspectRatio="xMidYMid meet" href="${esc(safeQr)}"/>`:placeholder;
    return `<g id="qr-code" data-layer="editable-qr">${rect(x,y,s,s,'#FFFFFF',{rx:9,stroke:t.accent,'stroke-width':3})}${code}${text(x+s/2,y+s+35,workbench ? '扫码添加微信' : '扫码访问个人网页',19,caption,500,{'text-anchor':'middle'})}</g>`;
  }
  function svg(templateId,side='front',data={},options={}){
    const t=templates.find(x=>x.id===String(templateId).padStart(2,'0'));
    if(!t)throw new Error('Unknown template: '+templateId);
    if(!['front','back'].includes(side))throw new Error('Side must be front or back');
    const d={...sample,...data};
    const altSide=side==='back';
    return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="90mm" height="54mm" viewBox="0 0 ${W} ${H}" font-family="PingFang SC, Hiragino Sans GB, Noto Sans CJK SC, sans-serif" role="img" aria-label="${esc(t.name)}名片${altSide?'背面':'正面'}" data-template="${t.id}" data-side="${side}">
      ${defs}<g id="background" data-layer="editable-background">${rect(0,0,W,H,t.bg)}${motif(t,side)}</g>
      ${logo(t,side)}${altSide?backText(t,d,options.workbench)+qrPanel(t,d,options.workbench):frontText(t,d)}
    </svg>`;
  }
  return {templates,sample,svg,W,H};
})();
if(typeof module!=='undefined')module.exports=CardEngine;
if(typeof window!=='undefined')window.CardEngine=CardEngine;
