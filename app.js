"use strict";

(() => {
  const main = document.querySelector("#content");
  const toast = document.querySelector("#toast");
  const sampleInfo = {
    name:"顾澄宁",nameEn:"Chengning Gu",title:"律师",practice:"商事争议解决 · 公司合规",
    phone:"",email:"chengning.gu@example.com",address:"",website:"",
  };
  const cardFields = {
    name:["姓名",60], nameEn:["英文姓名",90], title:["职务",80], practice:["专业方向",100],
    phone:["电话",80], email:["邮箱",254], address:["地址",140], website:["网址",160],
  };
  const groups = [
    ["基本信息", [["name","姓名"],["title","现任职务"],["phone","电话"],["email","邮箱"],["wechat","微信号"]]],
    ["个人简介", [["hero","首页短简介"],["about","关于页介绍"]]],
    ["业务与经历", [["practice","专业方向"],["experience","执业经历"],["education","教育背景"]]],
    ["可公开成果", [["achievement","成果"]]],
  ];
  const multiple = new Set(["practice","experience","education","achievement"]);
  const themes = SiteRenderer.templates.slice(0,6);
  const state = {
    config:null, route:"home", card:{template:"01",side:"front",data:{},qr:""},
    site:{theme:"quiet",step:"import",rows:[],sources:[],portrait:"",sample:false,
      notes:[],aiMessage:"",revision:0,reviewId:0,edit:null,handoff:null},
    manage:null,
  };
  let toastTimer;
  let nextId = 0;
  let loadingManage = "";
  const esc = value => String(value ?? "").replace(/[&<>"']/g, ch =>
    ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[ch]);
  const count = value => [...String(value)].length;
  const ctl = (label, action, options = {}) => {
    const {kind="secondary", value, selected, disabled=false, busy=false} = options;
    return `<button type="button" class="${kind}" data-action="${action}"${value === undefined ? "" : ` data-value="${esc(value)}"`}${selected === undefined ? "" : ` aria-pressed="${selected}"`}${disabled || busy ? " disabled" : ""}>${esc(label)}</button>`;
  };
  const heading = (title, lead="", action="") => `<div class="page-head"><div><h1>${esc(title)}</h1>${lead ? `<p>${esc(lead)}</p>` : ""}</div>${action}</div>`;
  const manageToken = () => state.manage?.token || "";
  const accepted = () => state.site.rows.filter(row => row.accepted && row.value.trim());
  const addRow = (field, value, extra = {}) => {
    const row = {id:++nextId,field,value,refs:[],accepted:false,omitted:false,...extra};
    state.site.rows.push(row);
    return row;
  };

  function notify(message, error=false){
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.toggle("error",error);
    toast.hidden = false;
    toastTimer = setTimeout(()=>{toast.hidden=true;}, error ? 8500 : 4500);
  }

  async function request(path, params = {}){
    const {json, body, token, raw=false, signal} = params;
    const headers = {};
    if (json) headers["Content-Type"] = "application/json";
    if (token) headers.Authorization = "Bearer " + token;
    const response = await fetch(path,{method:json || body ? "POST" : "GET",
      headers,body:json ? JSON.stringify(json) : body,cache:"no-store",signal});
    if (!response.ok) {
      const error = await response.json().catch(()=>({}));
      throw new Error(error.error || "操作失败，请稍后重试。");
    }
    return raw ? response : response.json();
  }

  async function download(path, data){
    const response = await request(path,{json:data,raw:true});
    const blob = await response.blob();
    const name = response.headers.get("Content-Disposition")?.split("UTF-8''")[1];
    saveBlob(blob,name ? decodeURIComponent(name) : "下载文件");
  }

  function saveBlob(blob, name){
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1500);
  }

  async function picture(file, max, preserveTransparency){
    if (!["image/png","image/jpeg","image/webp"].includes(file.type) || file.size > 12*1024**2) {
      throw new Error("请选择 12 MB 以内的 PNG、JPG 或 WebP 图片。");
    }
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      if (image.naturalWidth * image.naturalHeight > 25_000_000) throw new Error("图片尺寸过大，请换一张图片。");
      const scale = Math.min(1,max/Math.max(image.naturalWidth,image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1,Math.round(image.naturalWidth*scale));
      canvas.height = Math.max(1,Math.round(image.naturalHeight*scale));
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.imageSmoothingEnabled = !preserveTransparency;
      ctx.drawImage(image,0,0,canvas.width,canvas.height);
      return preserveTransparency ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg",.89);
    } finally { URL.revokeObjectURL(url); }
  }

  function home(){
    main.innerHTML = `${heading("个人宣传工作台","为北京大成（深圳）律师制作电子名片和个人网站。")}
      <div class="home-grid">
        <a class="home-entry" href="#/card"><img src="/card-thumbnails/01.png" alt="紫线白笺名片样式">
          <div><h2>制作名片</h2><p>选一款名片，填上资料，下载正反面。可以在背面放自己的微信二维码。</p><span class="primary">开始制作名片</span></div>
        </a>
        <a class="home-entry" href="#/site"><img src="/site-thumbnails/editorial.png" alt="柔紫编排网站样式">
          <div><h2>制作个人网站</h2><p>导入简历或手动填写，选版式并核对内容，发布链接或下载网页。</p><span class="primary">开始制作网站</span></div>
        </a>
      </div><p class="session-note">无需账号。关闭页面后，本次未发布的内容不会保留。</p>`;
  }

  function renderCard(){
    const card = state.card;
    const selectable = CardEngine.templates.map(t =>
      `<button type="button" class="template" data-action="card-template" data-value="${t.id}" aria-pressed="${card.template===t.id}">
        <img src="/card-thumbnails/${t.id}.png" alt="" width="160" height="96" loading="lazy">
        <span>${esc(t.name)}</span><small>${esc(t.coverage)}</small>
      </button>`).join("");
    const fields = Object.entries(cardFields).map(([id,[label,limit]])=>
      `<label>${label}${id==="name" ? "（必填）" : ""}<input type="${id === "email" ? "email" : id === "phone" ? "tel" : "text"}" data-card="${id}" maxlength="${limit}" value="${esc(card.data[id])}"></label>`).join("");
    main.innerHTML = `${heading("制作名片","选一款模板，填写资料，预览并下载。")}
      <div class="card-workspace">
        <section class="panel template-panel"><h2>选择名片模板</h2><div class="card-templates" aria-label="名片模板">${selectable}</div></section>
        <section class="panel card-preview-panel"><h2>名片预览</h2><div class="choices" aria-label="选择卡面">
          ${ctl("正面","card-side",{value:"front",selected:card.side==="front"})}${ctl("背面","card-side",{value:"back",selected:card.side==="back"})}
          </div><div id="card-preview"></div><div class="actions">
          ${ctl("下载当前名片图片","card-download",{kind:"primary",value:"png"})}
          <details class="download-extra"><summary>更多下载</summary><div class="actions">
            ${ctl("正面矢量文件","card-vector",{value:"front"})}${ctl("背面矢量文件","card-vector",{value:"back"})}
            ${ctl("正面图片","card-side-png",{value:"front"})}${ctl("背面图片","card-side-png",{value:"back"})}
          </div><p class="hint">矢量文件（SVG）可用支持 SVG 的设计软件继续排版。</p></details></div>
        </section>
        <section class="panel card-info"><div class="section-head"><h2>填写名片资料</h2>${ctl("带入本次网站资料","copy-to-card",{disabled:!state.site.rows.some(row=>row.accepted && ["name","title","phone","email","practice"].includes(row.field))})}</div>
          <div class="form-grid">${fields}</div>
          <div class="line-space"><label for="qr-upload">微信二维码（可选）</label>
          <input type="file" id="qr-upload" data-image="qr" accept="image/png,image/jpeg,image/webp"><p class="hint">上传个人微信二维码，会放在名片背面。</p>
          ${card.qr ? ctl("移除微信二维码","clear-qr") : ""}</div>
        </section>
      </div>`;
    showCard();
  }

  function showCard(){
    const node = document.querySelector("#card-preview");
    if (!node) return;
    const card = state.card;
    const blank = Object.fromEntries(Object.keys(cardFields).map(key=>[key,""]));
    const data = {...blank,...card.data, qrData:card.qr};
    if (!data.name.trim()) data.name = "姓名";
    node.innerHTML = CardEngine.svg(card.template,card.side,data,{workbench:true});
  }

  function renderSite(){
    const site = state.site;
    const managed = state.route === "manage";
    if (managed && !state.manage) {
      main.innerHTML = heading("管理个人网站","正在读取已发布的内容…");
      return;
    }
    if (managed && state.manage.error) {
      main.innerHTML = heading("管理个人网站",state.manage.error);
      return;
    }
    if (managed && !state.manage.active) {
      main.innerHTML = heading("网站已撤回","原访问链接已停止展示。");
      return;
    }
    if (!state.config) {
      main.innerHTML = heading("制作个人网站","正在准备网站模板…");
      return;
    }
    const title = managed ? "更新个人网站" : "制作个人网站";
    main.innerHTML = `${heading(title,managed ? "编辑已发布的内容，更新后客户可继续打开原网址。" : "",
      managed ? ctl("撤回网站","request-withdraw",{kind:"danger-outline"}) : "")}
      ${managed && state.manage.confirmWithdraw ? `<section class="panel withdraw" aria-label="确认撤回"><h2>撤回已发布网站？</h2><p>撤回后，客户打开原访问链接时将看到网站已撤回。</p><div class="actions">${ctl("确认撤回","withdraw",{kind:"danger"})}${ctl("取消","cancel-withdraw")}</div></section>` : ""}
      ${site.step === "done" ? publicationResult() : `${steps(managed)}<div id="site-step">${site.step === "import" ? importStep() : site.step === "review" ? reviewStep() : previewStep()}</div>`}`;
    if (site.step === "preview") document.querySelector("#website-preview").srcdoc = site.preview;
  }

  function steps(managed){
    const labels = managed ? [["review","核对网站内容"],["preview","预览并更新"]] :
      [["import","导入简历"],["review","核对网站内容"],["preview","预览并发布"]];
    return `<nav class="steps" aria-label="制作步骤">${labels.map(([step,label],index)=>
      `<button type="button" data-action="${step==="preview" ? "preview-site" : "site-step"}" data-value="${step}"
         ${state.site.step===step ? 'aria-current="step"' : ""} ${step==="preview" && !accepted().some(row=>row.field==="name") ? "disabled" : ""}>
         <span aria-hidden="true">${index+1}</span>${label}</button>`).join("")}</nav>`;
  }

  function importStep(){
    const handoff=state.site.handoff;
    return `<div class="import-grid">
      <section class="panel import-choice"><h2>用 AI 平台整理简历</h2><p>先在工作台创建一次性传输码，再到已安装“大成律师简历整理”工具的 AI 平台上传简历。AI 提取并润色后会先向你展示候选内容；你确认后，资料才会送回工作台。</p>
        <div class="platform-choices" aria-label="AI 平台">${ctl("创建 DeepSeek Harness 传输码","begin-ai-harness",{kind:"primary"})}</div>
        <p class="hint">简历由你上传到所选 AI 平台处理。请使用已获准处理的版本，不要上传无权披露的客户或案件材料。姓名、联系方式等仍需核对。</p>
        ${handoff ? handoffPanel(handoff) : ""}
      </section>
      <section class="panel import-choice"><h2>手动导入</h2><p>不使用 AI 平台也可以直接读取，支持 Word（.docx）、文字版和扫描版 PDF。</p>
        <label for="resume-file">选择简历</label><input type="file" id="resume-file" accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document">
        <p class="hint">工作台不设置文件大小、PDF 页数或正文长度上限。扫描件识别受当前设备和运行环境资源影响。</p>
        <div class="actions">${ctl("读取简历","read-resume",{kind:"primary"})}</div>
      </section>
      <section class="panel import-choice"><h2>手动填写</h2><p>没有简历文件时，可逐项填写希望在网站展示的资料。</p>
        <div class="actions">${ctl("开始填写","site-step",{value:"review"})}${state.card.data.name || state.card.data.title || state.card.data.phone || state.card.data.email || state.card.data.practice ? ctl("带入本次名片资料","copy-to-site") : ""}</div>
        <hr><h3>先试一份示例</h3><p>用虚构律师的资料体验导入和核对。</p>
        <div class="actions">${ctl("导入示例简历","sample-resume")}<a href="/sample/resume.pdf" download="顾澄宁_示例简历.pdf">下载示例 PDF</a></div>
      </section></div>`;
  }

  function handoffPanel(handoff){
    const label="DeepSeek Harness";
    if(handoff.state==="ready") return `<section class="handoff-box" role="status"><h3>资料已送回工作台</h3><p>AI 整理结果已载入。请逐项核对，点选要用于网站的候选资料。</p></section>`;
    if(handoff.state==="expired") return `<section class="handoff-box" role="status"><h3>传输码已失效</h3><p>为保护资料，传输码 15 分钟后过期。请重新创建。</p></section>`;
    if(handoff.state==="consumed") return `<section class="handoff-box" role="status"><h3>资料已导入</h3><p>这组传输码只能使用一次。若需要再整理，请创建新的传输码。</p></section>`;
    const prompt=`请按“大成律师简历整理” Skill 流程读取我本次对话上传的 Word/PDF 简历。\n\n工作台传输码：${handoff.code}\n\n请按个人网站资料整理：提取姓名、职务、联系方式、个人简介、专业方向、执业经历、教育背景和可能的成果；根据个人网站所选模板“${handoff.themeName || "柔紫编排"}”调整篇幅。保留每项来源依据，指出无法确认、过长或可能涉及客户/案件披露的内容。不要编造事实。先把候选逐项展示给我，由我核对；只有我明确回复确认后，才能调用 MCP 工具 submit_confirmed_profile 把候选资料送回工作台。不要自动确认，也不要生成名片或网站成品。`;
    return `<section class="handoff-box"><h3>${label} 传输码</h3>
      <p>在 ${label} 中打开已安装的“大成律师简历整理”工具，上传 Word/PDF 简历，并把下方指令发给它。完成逐项确认后，工具会将候选资料送回本页面。</p>
      <p class="hint">工作台只暂存这些候选字段和来源摘录用于本次回填，不保存简历原件。15 分钟后传输码不可兑换；过期记录会在下次创建传输码或尝试读取时清理。</p>
      <label>本次传输码（15 分钟有效、仅可导入一次）<input readonly value="${esc(handoff.code)}" aria-label="本次传输码"></label>
      <div class="actions">${ctl("复制完整指令","copy-handoff-prompt",{kind:"primary"})}${ctl("复制传输码","copy-handoff-code")}${ctl("重新生成传输码","reset-handoff")}</div>
      <p class="hint" id="handoff-status">${handoff.state==="waiting" ? `正在等待 ${label} 完成资料确认…` : esc(handoff.message || "")}</p>
    </section>`;
  }

  function reviewStep(){
    const site = state.site;
    const layout = state.config.layouts[site.theme];
    const gallery = themes.map(theme => `<button type="button" class="template site-template" data-action="site-theme"
      data-value="${theme.id}" aria-pressed="${theme.id===site.theme}">
      <img src="/site-thumbnails/${theme.id}.png" alt="" width="176" height="104">
      <span>${esc(theme.name)}</span></button>`).join("");
    const s = site.sources;
    return `<section class="panel site-styles"><div class="section-head"><div><h2>选择网站模板</h2><p class="hint">${esc(layout.description)}</p></div></div>
      <div class="site-templates" aria-label="网站模板">${gallery}</div></section>
      ${site.sample ? '<p class="notice">正在使用虚构律师的示例资料。可体验核对、预览和下载。</p>' : ""}
      ${site.notes.length ? `<div class="notice" role="status">${site.notes.map(note=>`<p>${esc(note)}</p>`).join("")}</div>` : ""}
      <section class="panel review-intro"><h2>核对网站内容</h2><p>逐项点选要展示的内容。电话、邮箱和微信号可以全空。</p>
        <p class="hint">AI 只协助提取和润色。资料不会自动进入网站；每一项都要由律师自行核对并点选使用。</p>
        ${s.length ? `<details class="source-document"><summary>查看读取的简历原文</summary><pre>${esc(s.map(line=>line.label+"  "+line.text).join("\n"))}</pre></details>` : ""}
      </section>
      ${groups.map(([label,fields])=>`<section class="panel review-group"><h2>${label}</h2>${fields.map(([field,text])=>reviewField(field,text,layout)).join("")}</section>`).join("")}
      <div class="review-actions"><p class="hint">${accepted().some(row=>row.field==="name") ? "已选内容将用于成品预览。" : "选择或填写姓名后，即可预览。"}
        ${site.rows.some(row=>!row.accepted && !row.omitted) ? "待核对的内容不会出现在成品中。" : ""}</p>
      ${ctl("预览个人网站","preview-site",{kind:"primary",disabled:!accepted().some(row=>row.field==="name")})}</div>`;
  }

  function upper(field, layout){
    return ({hero:layout.hero,about:layout.about,practice:layout.practice,experience:layout.record,
             education:layout.record,achievement:layout.achievement})[field];
  }

  function reviewField(field,label,layout){
    const site = state.site;
    const group = site.rows.filter(row=>row.field===field);
    const candidates = group.filter(row=>!row.omitted);
    const omitted = group.filter(row=>row.omitted);
    const suggested = upper(field,layout);
    const editingNew = site.edit?.field === field && !site.edit.id;
    const portrait = field === "name" ? `<div class="portrait-field"><label for="portrait-upload">职业照（可选）</label>
      <input type="file" id="portrait-upload" data-image="portrait" accept="image/png,image/jpeg,image/webp">
      ${site.portrait ? `<img alt="已选职业照" src="${site.portrait}">${ctl("移除职业照","clear-portrait")}` : ""}</div>` : "";
    const conflict = !multiple.has(field) && candidates.length > 1 ? '<p class="hint warning">识别到多个候选，请核对后选择一项。</p>' : "";
    return `<div class="review-field" id="field-${field}">
      <div class="section-head"><h3>${label}</h3>${suggested ? `<span class="hint">本模板建议 ${suggested} 字以内${multiple.has(field) ? "／条" : ""}</span>` : ""}</div>
      ${conflict}${candidates.length ? `<div class="candidates">${candidates.map(row=>candidate(row,suggested)).join("")}</div>` : ""}
      ${editingNew ? editForm("",field) : (multiple.has(field) || !candidates.length || !candidates.some(row=>row.accepted)) ? ctl(candidates.length && multiple.has(field) ? "添加一项" : "手动填写","write-field",{value:field}) : ""}
      ${omitted.length ? `<details class="omitted"><summary>暂不使用（${omitted.length}）</summary><ul>${omitted.map(row=>
        `<li><span>${esc(row.value)}</span>${ctl("移回待核对","restore-row",{value:row.id})}</li>`).join("")}</ul></details>` : ""}
      ${portrait}</div>`;
  }

  function candidate(row,suggested){
    const over = suggested && count(row.value)>suggested;
    const originals = (row.originals || row.refs.map(index=>state.site.sources[index])).filter(Boolean);
    const status = row.accepted ? "已使用" : (row.review==="ocr" ? "扫描识别，请核对" : row.review==="ai" ? "AI 建议" : "待核对");
    const confirm = row.field==="achievement" ? "展示在网站" :
      (row.review==="ai" && accepted().some(item=>item.field===row.field) && !multiple.has(row.field) ? "应用建议" : "使用这项");
    return `<article class="candidate ${row.accepted ? "accepted" : ""}" id="row-${row.id}">
      <span class="candidate-status">${status}</span>
      ${state.site.edit?.id === row.id ? editForm(row.value,row.field,row.id) : `<p class="candidate-value">${esc(row.value)}</p>
      ${row.reviewNote ? `<p class="hint">${esc(row.reviewNote)}</p>` : ""}
      ${over ? `<p class="hint warning">当前 ${count(row.value)} 字。可精简文字并查看预览。</p>` : ""}
      <div class="actions">${!row.accepted ? ctl(confirm,"accept-row",{value:row.id}) : ""}
        ${ctl("修改","edit-row",{value:row.id})}${ctl("暂不使用","omit-row",{value:row.id})}</div>`}
      ${originals.length ? `<details><summary>查看原文</summary>${originals.map(original=>`<p class="original"><small>${esc(original.label)}</small>${esc(original.text)}</p>`).join("")}</details>` : ""}
    </article>`;
  }

  function editForm(value,field,id){
    const multi = ["hero","about","practice","experience","education","achievement"].includes(field);
    const label = groups.flatMap(([,fields])=>fields).find(([key])=>key===field)[1];
    const caps = {name:100,title:180,hero:1000,about:5000,phone:80,email:254,wechat:160,practice:1500,experience:2500,education:1500,achievement:2500};
    return `<form class="inline-form" data-edit="${field}" data-id="${id || ""}">
      <label for="field-entry">${label}</label>
      ${multi ? `<textarea id="field-entry" name="value" maxlength="${caps[field]}" required rows="4">${esc(value)}</textarea>` :
        `<input id="field-entry" name="value" maxlength="${caps[field]}" required value="${esc(value)}">`}
      <div class="actions"><button class="primary" type="submit">${field==="achievement" ? "确认可公开并使用" : "使用此内容"}</button>
      ${ctl("取消","cancel-edit")}</div></form>`;
  }

  function previewStep(){
    const managed = state.route==="manage";
    return `<section class="panel preview-panel"><div class="section-head"><div><h2>个人网站预览</h2>
      <p class="hint">以下是客户打开时看到的页面。</p></div>${ctl("返回核对","site-step",{value:"review"})}</div>
      <iframe id="website-preview" title="客户视角的网站预览" sandbox="allow-scripts"></iframe>
      ${state.config.localMode ? '<p class="hint">当前在本机运行，发布链接可在这台电脑上试用。</p>' : ""}
      ${!managed && state.site.sample ? '<p class="notice">虚构示例可下载网页文件。正式发布请使用自己的资料。</p>' : ""}
      <div class="actions">${ctl(managed ? "更新发布" : "发布并生成链接","publish-site",{kind:"primary",disabled:!managed && state.site.sample})}
      ${ctl("下载网页文件","download-site")}</div></section>`;
  }

  function publicationResult(){
    const record = state.site.publication;
    const manage = record.manageUrl || location.origin + "/#/manage/" + manageToken();
    return `<section class="panel published"><h2>${state.route==="manage" ? "网站已更新" : "网站已发布"}</h2>
      <div class="published-grid"><section><h3>发给客户的访问链接</h3><p>长期有效，直到你主动撤回。</p>
        <input readonly aria-label="客户访问链接" value="${esc(record.publicUrl)}">
        <div class="actions">${ctl("复制客户访问链接","copy-public",{kind:"primary"})}<a target="_blank" rel="noopener noreferrer" href="${esc(record.publicUrl)}">打开网站</a></div>
      </section><section><h3>自己保存的管理链接</h3><p>用它更新或撤回网站。请妥善保存，遗失后无法找回。</p>
        <input readonly aria-label="管理链接" value="${esc(manage)}">
        <div class="actions">${ctl("复制管理链接","copy-manage")}${ctl("保存管理链接文本","save-links")}${ctl("打开管理页面","open-management")}</div>
      </section></div>${ctl("下载网页文件","download-site")}</section>`;
  }

  function page(focus=false){
    document.querySelector("#main-nav").querySelectorAll("a").forEach(link=>{
      if (link.dataset.route===state.route) link.setAttribute("aria-current","page");
      else link.removeAttribute("aria-current");
    });
    if (state.route==="card") renderCard();
    else if (state.route==="site" || state.route==="manage") renderSite();
    else home();
    if (focus) {
      main.focus({preventScroll:true});
      window.scrollTo(0,0);
    }
  }

  function step(value){
    state.site.step=value;
    state.site.edit=null;
    page(true);
  }

  const storageShape = () => ({theme:state.site.theme,portrait:state.site.portrait,
    items:accepted().map(row=>({field:row.field,value:row.value,disclosure:row.field==="achievement"}))});

  async function preview(){
    const data=storageShape();
    const site=state.site;
    const response = await request("/api/site/html",{json:data,raw:true});
    const markup = await response.text();
    if (site!==state.site || (state.route!=="site" && state.route!=="manage")) return;
    site.preview = markup;
    step("preview");
  }

  function newSite(){
    state.site={theme:"quiet",step:"import",rows:[],sources:[],portrait:"",sample:false,
      notes:[],aiMessage:"",revision:0,reviewId:0,edit:null,handoff:null};
  }

  async function readResume(file,sample=false){
    if (!file) throw new Error("请选择 Word 或 PDF 简历。");
    if (state.site.rows.length && !confirm("导入新的简历会替换本次已整理的内容。继续导入吗？")) return;
    const active = state.site;
    const params = new URLSearchParams({name:file.name});
    const response = await request("/api/extract?"+params,{body:file});
    if (state.site!==active || state.route!=="site") return;
    active.rows=[];
    active.sources=response.sources;
    active.notes=[...response.warnings];
    if (response.ocrPages.length) active.notes.push("已识别扫描页。请优先核对姓名、职务、电话和邮箱。");
    active.sample=sample;
    active.portrait=sample ? await request("/sample/portrait.png",{raw:true}).then(response=>response.blob())
      .then(blob=>picture(blob,900,false)).catch(()=>"") : active.portrait;
    active.aiMessage="已从原件提取候选资料，请逐条核对。";
    active.reviewId++;
    response.items.forEach(item=>addRow(item.field,item.value,{refs:item.sources,review:item.review}));
    step("review");
  }

  async function beginHandoff(platform){
    if (state.site.rows.length && !confirm("创建新的简历整理会话会替换本次候选资料。继续吗？")) return;
    const result=await request("/api/handoff/create",{json:{platform}});
    const handoff={...result,state:"waiting",themeName:themes.find(item=>item.id===state.site.theme)?.name || ""};
    state.site.handoff=handoff;
    page();
    scheduleHandoffPoll(handoff);
  }

  function scheduleHandoffPoll(handoff){
    if(state.site.handoff!==handoff || handoff.state!=="waiting") return;
    setTimeout(async()=>{
      if(state.site.handoff!==handoff || handoff.state!=="waiting") return;
      await pollHandoff(handoff).catch(()=>{});
      if(handoff.state==="waiting") scheduleHandoffPoll(handoff);
    },3000);
  }

  async function pollHandoff(handoff=state.site.handoff){
    if(!handoff || handoff.state!=="waiting") return;
    try {
      const result=await request("/api/handoff/status",{json:{code:handoff.code}});
      if(state.site.handoff!==handoff) return;
      if(result.state==="ready"){
        handoff.state="ready";
        state.site.rows=[];
        state.site.sources=[];
        state.site.notes=[...(result.warnings || [])];
        state.site.sample=false;
        (result.items || []).forEach(item=>addRow(item.field,item.value,{
          review:"ai", refs:[], originals:(item.sources || []).map(text=>({label:"简历原文依据",text})),
          reviewNote:item.reviewNote || ""}));
        handoff.state="consumed";
        step("review");
        notify("资料已送回。请逐项核对后选择是否使用。");
      }
    } catch(error){
      if(error.message.includes("失效")){handoff.state="expired";page();}
      else throw error;
    }
  }

  function activate(row){
    if (!multiple.has(row.field)) state.site.rows.filter(other=>other.field===row.field).forEach(other=>{other.accepted=false;});
    row.accepted=true;
    row.omitted=false;
  }

  function focusField(field){
    page();
    const node=document.querySelector("#field-entry") || document.querySelector(`#field-${field} button`);
    node?.focus({preventScroll:true});
  }

  async function openManagement(token){
    if (loadingManage===token) return;
    loadingManage=token;
    state.manage=null;
    page(true);
    try {
      const result=await request("/api/site/manage",{token});
      if (loadingManage!==token || state.route!=="manage") return;
      state.manage={token,...result};
      newSite();
      state.site.theme=result.content.theme || "quiet";
      state.site.portrait=result.content.portrait || "";
      (result.content.items || []).forEach(item=>addRow(item.field,item.value,{accepted:true}));
      state.site.step="review";
    } catch(error) {
      if (loadingManage===token) state.manage={token,error:error.message};
    } finally {
      if (loadingManage===token) loadingManage="";
      if (state.route==="manage") page(true);
    }
  }

  function route(){
    const hash=location.hash;
    if (hash==="#content") return;
    const match=hash.match(/^#\/manage\/([A-Za-z0-9_-]{43})$/);
    const previous=state.route;
    state.route=match ? "manage" : ["site","card"].find(name=>hash===`#/${name}`) || "home";
    if (match){
      if (previous!=="manage" || manageToken()!==match[1]) void openManagement(match[1]);
      return;
    }
    if (previous==="manage"){
      state.manage=null;
      newSite();
    }
    page(true);
  }

  async function copyText(text){
    try { await navigator.clipboard.writeText(text); }
    catch {
      const input=document.createElement("textarea");
      input.value=text;
      input.setAttribute("readonly","");
      input.style.position="fixed";
      input.style.opacity="0";
      document.body.append(input);
      input.select();
      const ok=document.execCommand("copy");
      input.remove();
      if(!ok) throw new Error("复制失败，请手动选择并复制。");
    }
    notify("已复制到剪贴板。");
  }

  const actions = {
    "card-template":value=>{ state.card.template=value; main.querySelectorAll("[data-action=card-template]").forEach(button=>button.setAttribute("aria-pressed",button.dataset.value===value)); showCard(); },
    "card-side":value=>{ state.card.side=value; main.querySelectorAll("[data-action=card-side]").forEach(button=>button.setAttribute("aria-pressed",button.dataset.value===value)); showCard(); },
    "clear-qr":()=>{state.card.qr="";page();},
    "clear-portrait":()=>{state.site.portrait="";page();},
    "copy-to-card":()=>{
      const rows=accepted();
      for(const field of ["name","title","phone","email","practice"]){
        const value=rows.find(row=>row.field===field)?.value;
        if(value && !state.card.data[field] && value.length<=cardFields[field][1]) state.card.data[field]=value;
      }
      page();
      notify("已带入适合名片的资料，原有填写仍保留。");
    },
    "copy-to-site":()=>{
      for(const field of ["name","title","phone","email","practice"]){
        const value=state.card.data[field]?.trim();
        if (value && !state.site.rows.some(row=>row.field===field && row.value===value)) addRow(field,value);
      }
      step("review");
      notify("已带入名片资料，请点选要在网站展示的内容。");
    },
    "card-download":format=>exportCard(state.card.side,format),
    "card-vector":side=>exportCard(side,"svg"),
    "card-side-png":side=>exportCard(side,"png"),
    "site-step":value=>step(value),
    "site-theme":value=>{
      state.site.theme=value;
      page();
      main.querySelector(`[data-action=site-theme][data-value="${value}"]`)?.focus({preventScroll:true});
    },
    "read-resume":()=>readResume(document.querySelector("#resume-file").files[0]),
    "begin-ai-harness":()=>beginHandoff("deepseek-harness"),
    "copy-handoff-code":()=>copyText(state.site.handoff?.code || ""),
    "copy-handoff-prompt":()=>{
      const h=state.site.handoff;
      const prompt=`请使用“大成律师简历整理”工具读取我本次对话上传的 Word/PDF 简历。\n\n工作台传输码：${h?.code || ""}\n\n请按个人网站资料整理，提取姓名、职务、联系方式、个人简介、专业方向、执业经历、教育背景和可能的成果；根据“${h?.themeName || "柔紫编排"}”模板调整篇幅，保留每项来源依据并指出无法确认或可能涉及客户/案件披露的内容，不要编造事实。先逐项展示候选，由我核对；只有我明确回复确认后，才调用工具送回工作台。不要自动确认或直接生成成品。`;
      return copyText(prompt);
    },
    "reset-handoff":()=>{state.site.handoff=null;page();},
    "poll-handoff":()=>pollHandoff(),
    "sample-resume":async()=>{
      const response=await request("/sample/resume.pdf",{raw:true});
      await readResume(new File([await response.blob()],"顾澄宁_示例简历.pdf",{type:"application/pdf"}),true);
    },
    "write-field":field=>{state.site.edit={field};focusField(field);},
    "edit-row":id=>{const row=state.site.rows.find(item=>item.id===Number(id));state.site.edit={field:row.field,id:row.id};focusField(row.field);},
    "cancel-edit":()=>{const field=state.site.edit.field;state.site.edit=null;focusField(field);},
    "accept-row":id=>{const row=state.site.rows.find(item=>item.id===Number(id));activate(row);focusField(row.field);},
    "omit-row":id=>{const row=state.site.rows.find(item=>item.id===Number(id));row.accepted=false;row.omitted=true;state.site.edit=null;focusField(row.field);},
    "restore-row":id=>{const row=state.site.rows.find(item=>item.id===Number(id));row.omitted=false;focusField(row.field);},
    "preview-site":preview,
    "download-site":()=>download("/api/site/html",storageShape()),
    "publish-site":async()=>{
      const site=state.site;
      if(site.sample && !manageToken()) throw new Error("正式发布请使用自己的资料。");
      const data=storageShape();
      data.sample=site.sample;
      const token=manageToken();
      if (token) data.revision=state.manage.revision;
      const result=await request(token ? "/api/site/update" : "/api/site/publish",{json:data,token});
      if (site!==state.site || (state.route!=="site" && state.route!=="manage")) return;
      if (token) state.manage.revision=result.revision;
      site.publication=result;
      step("done");
    },
    "request-withdraw":()=>{state.manage.confirmWithdraw=true; page();},
    "cancel-withdraw":()=>{state.manage.confirmWithdraw=false; page();},
    "withdraw":async()=>{
      const manage=state.manage;
      const result=await request("/api/site/withdraw",{json:{revision:manage.revision},token:manage.token});
      if(manage!==state.manage) return;
      Object.assign(manage,result,{confirmWithdraw:false});
      newSite();
      page(true);
    },
    "copy-public":()=>copyText(main.querySelector('[aria-label="客户访问链接"]').value),
    "copy-manage":()=>copyText(main.querySelector('[aria-label="管理链接"]').value),
    "save-links":()=>{
      const a=main.querySelector('[aria-label="客户访问链接"]').value;
      const b=main.querySelector('[aria-label="管理链接"]').value;
      saveBlob(new Blob([`客户访问链接\n${a}\n\n请自行保存的管理链接\n${b}\n`],{type:"text/plain;charset=utf-8"}),"个人网站链接.txt");
    },
    "open-management":()=>{
      if(state.route==="manage") step("review");
      else location.hash=new URL(state.site.publication.manageUrl).hash;
    },
  };

  function exportCard(side,format){
    if(!state.card.data.name?.trim()) {
      main.querySelector('[data-card="name"]').focus();
      throw new Error("请先填写姓名。");
    }
    return download("/api/card",{side,format,template:state.card.template,
      data:{...state.card.data,qrData:side==="back" ? state.card.qr : ""}});
  }

  main.addEventListener("click", async event=>{
    const button=event.target.closest("[data-action]");
    if(!button || button.disabled) return;
    const action=actions[button.dataset.action];
    if(!action) return;
    button.disabled=true;
    button.setAttribute("aria-busy","true");
    try { await action(button.dataset.value); }
    catch (error) { notify(error.message || "操作失败，请稍后重试。", true); }
    finally {
      // Buttons from an old render have already been replaced.
      if(button.isConnected) {button.disabled=false;button.removeAttribute("aria-busy");}
    }
  });

  main.addEventListener("input",event=>{
    const key=event.target.dataset.card;
    if(key) {state.card.data[key]=event.target.value;showCard();}
  });

  main.addEventListener("change",async event=>{
    const type=event.target.dataset.image;
    const file=event.target.files?.[0];
    if(!type || !file) return;
    const site=state.site;
    try{
      const data=await picture(file,type==="qr" ? 1400 : 900,type==="qr");
      if(type==="qr"){state.card.qr=data;state.card.side="back";}
      if(type==="portrait" && site===state.site) site.portrait=data;
      page();
    } catch(error){notify(error.message,true);}
  });

  main.addEventListener("submit", event=>{
    const form=event.target.closest("form[data-edit]");
    if(!form) return;
    event.preventDefault();
    const value=new FormData(form).get("value")?.trim();
    if(!value) return;
    const field=form.dataset.edit;
    const row=state.site.rows.find(item=>item.id===Number(form.dataset.id)) || addRow(field,value);
    row.value=value;
    activate(row);
    state.site.edit=null;
    focusField(field);
  });

  window.addEventListener("hashchange",route);
  route();
  request("/api/config").then(config=>{state.config=config;if(state.route==="site" || state.route==="manage") page();})
    .catch(error=>{if(state.route==="site") main.innerHTML=heading("制作个人网站","无法连接生成服务，请重新打开工作台。");notify(error.message,true);});
})();
