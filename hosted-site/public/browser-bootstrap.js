import { extractResumeFile } from "/resume-parser.js";

window.ResumeParser = { extractResumeFile };

async function loadScript(src) {
  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`组件加载失败：${src}`));
    document.head.append(script);
  });
}

try {
  await loadScript("/site-renderer.js");
  await loadScript("/card-logo.js");
  await loadScript("/card-engine.js");
  await loadScript("/workbench/app.js");
} catch (error) {
  const main = document.querySelector("#content");
  if (main) main.innerHTML = `<section class="panel"><h1>工作台暂时无法打开</h1><p>${String(error?.message || "请刷新页面重试。")}</p></section>`;
}
