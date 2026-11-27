# 大成深圳律师个人宣传工作台

面向北京大成（深圳）律师事务所的个人宣传资料制作工具。律师可以制作电子名片、整理个人简历并生成个人网站。网站支持下载为 HTML，也支持由律师主动发布到工作台托管的公开链接。

## 能做什么

- **电子名片**：20 款紫色系模板，填写姓名、职务、业务和联系方式；可上传微信二维码放在名片背面。下载正反面 PNG，或下载分层可编辑 SVG。
- **个人网站**：6 款网站样式，支持 DOCX、文字版 PDF 和扫描 PDF；提取后逐项编辑、确认公开内容，再预览。
- **AI 简历整理**：由律师在自己打开的 DeepSeek Harness 会话上传简历。AI 先展示字段候选、来源摘录和披露提醒；律师明确确认后，才把候选发回工作台。工作台仍要求律师逐项点选，资料不会自动进入网站。
- **发布网页**：律师可以发布独立的客户访问链接，长期有效；私密管理链接可更新或撤回。发布后的链接与工作台入口不同。
- **文件下载**：可下载名片 PNG/SVG 和个人网站 HTML。当前不提供 PPT，也没有账号系统或持久化草稿。

## 快速开始：托管版

当前工作台入口：<https://dacheng-profile-workbench.blush-whale-9999.chatgpt.site>

律师直接打开后可制作名片和网站。使用 AI 整理时，需要维护者先按下文配置 Harness Skill/MCP；不需要也不应填写 AI API Key。

## DeepSeek Harness 配置

配置包在 [`integrations/deepseek-harness/`](integrations/deepseek-harness/)：

- `SKILL.md`：简历读取、字段整理、来源保留、披露提醒和律师确认流程。
- `agent.cordis.yml`：MCP client 配置，已指向当前工作台 `/mcp`。
- `README.md`：详细安装说明。

简要步骤：

1. 在 DeepSeek Harness 中创建可编辑的用户 preset；如果内置 preset 只读，先复制一份。
2. 将 `agent.cordis.yml` 的 MCP 条目合并进该 preset 配置，不要覆盖已有配置。
3. 将 `SKILL.md` 放到 Harness 可发现的 Skill 目录，例如 `~/.dsh/skills/dacheng-profile-assistant/SKILL.md`。
4. 保存配置，新建会话并选择这个 preset；确认 `submit_confirmed_profile` MCP 工具已连接。
5. 律师在工作台创建 15 分钟有效的一次性传输码，在 Harness 上传 DOCX/PDF 并粘贴工作台生成的完整指令。

Harness 配置入口会随版本变化；请以对应 Harness 版本对 preset 和 MCP/Skill 的说明为准。工作台不会代替律师打开 Harness。

## 发布个人网站

1. 核对网站预览中的姓名、职务、联系方式、简介、业务、经历、教育和成果。
2. 点「发布网页并生成客户链接」。页面保存已选择公开的字段并生成随机管理令牌。
3. 复制客户访问链接发给客户；另外复制并妥善保存管理链接。管理链接只在首次发布时显示，遗失后无法找回。
4. 通过管理链接可读取并更新网站，或主动撤回。撤回后客户网址显示中性撤回提示；管理链接仍可恢复发布。

背面二维码只表示律师自行上传的微信二维码，与网站访问链接无关。不要将需要保密的客户、案件材料或未经授权公开的成果放入个人网站。

## 架构与数据边界

- `hosted-site/`：正式 Sites/Vinext/Cloudflare Worker 应用。托管 API、MCP、D1 和 `/p/{slug}` 个人网页均在这里。
- `server.py`：本机 Python 后端，可用于开发和本地运行；本地传输记录及已发布网页保存在 `server-data/app.db`。
- `integrations/deepseek-harness/`：DeepSeek Harness Skill 与 MCP preset 配置。
- 没有账号、密码和服务器草稿；未发布资料只在浏览器内存。
- 简历原件由浏览器本地解析或由律师直接上传到自己的 Harness 会话，不传给工作台后端。
- Harness 回填到 D1 的只有结构化候选、有限来源摘录和提示，传输码 15 分钟到期且仅能读取一次。
- 律师主动发布后，已核对网页内容保存在 D1，直到律师主动撤回。
- 工作台不持有任何 AI 服务 API Key，也不替用户调用 Codex、WorkBuddy 或模型 API。

## 本地运行 Python 版

需要 Python 3.10+、Node.js 22+、Tesseract OCR（简体中文和英文语言包）、`rsvg-convert`（名片 PNG 转换）及下列 Python 库：PyMuPDF、python-docx、Pillow、qrcode。

```sh
git clone https://github.com/yunziyo/Dacheng-Lawyer-Profile-Studio.git
cd Dacheng-Lawyer-Profile-Studio
python3 -m pip install -r requirements.txt
cp .env.example .env
python3 server.py
```

默认打开 <http://127.0.0.1:8788>。若需要使用本地服务对外发布律师网页，应将 `DACHENG_PUBLIC_BASE` 设置为可公开访问的 HTTPS origin；本地开发留空时会使用当前访问地址。服务器数据目录可通过 `DACHENG_DATA` 指定。

Docker Compose：先复制 `.env.example` 为 `.env`，再运行：

```sh
docker compose up --build
```

## 构建与部署 Hosted Sites

要求 Node.js `>=22.13.0`。在 `hosted-site/` 中：

```sh
npm ci
npm run db:generate   # 仅当 D1 schema 有变化时
npm run build
```

正式发布由 Sites 工作流完成；`hosted-site/.openai/hosting.json` 中 D1 逻辑绑定为 `DB`，Sites 在发布时应用 `drizzle/` 迁移。托管工作台入口和律师生成的 `/p/{slug}` 个人网站使用同一个 Sites 项目。不要把数据库密钥或任何模型 API Key 写进前端代码或提交文件。

本地开发时可以直接运行 `npm run dev`；需要验证生产构建时运行 `npm run build`。生产发布还需要该 Sites 项目的发布权限与有效源码仓库凭据，单靠 GitHub 仓库无法自动创建或配置 Sites/D1。

## 文件大小说明

产品代码不设 DOCX/PDF 文件字节数、PDF 页数或正文字符数上限，也不静默截断。浏览器可用内存、扫描清晰度、OCR 速度和运行平台资源仍会影响超大文件的处理。Hosted MCP 的 JSON 请求有安全上限，该上限只作用于结构化候选回填，并不限制简历文件。

## 主要目录

```text
app.js / index.html / style.css       本地工作台前端
server.py / parse.py / render.cjs     本地后端、解析与渲染
hosted-site/app/                       Hosted APIs、MCP、D1、公开网站路由
hosted-site/public/workbench/          托管工作台前端
integrations/deepseek-harness/         Harness Skill 与 MCP 配置
后端交接说明.md / CONTRACT.md          当前逻辑和接口交接
```
