# 统一工作台当前接口契约

本文件仅记录当前 DeepSeek Harness 版。旧账号、草稿、附件持久化、PPT 和直连 AI API 均已取消；个人网站支持律师主动发布、长期访问和通过管理令牌撤回。

## 产品入口

- `#/card`：名片制作（20 款模板、微信二维码、PNG/SVG 导出）。
- `#/site`：个人网站制作（6 款模板、Word/PDF、逐项核对、预览、HTML 下载、发布/更新/撤回）。
- PPT 暂不开放。
- 无账号、密码或服务器草稿。

## 托管版 JSON 接口

错误响应为 `{ "error": "中文说明" }`。所有含临时资料的响应设置 `Cache-Control: no-store`。

| 接口 | 输入 | 行为 |
|---|---|---|
| `GET /api/config` | 无 | 返回网站版式规则、`aiPlatforms:["deepseek-harness"]` 和 `handoffMinutes:15` |
| `POST /api/handoff/create` | `{"platform":"deepseek-harness"}` | 生成 10 位短码，仅在 D1 保存 SHA-256、平台、状态和过期时间；有效 15 分钟 |
| `POST /api/handoff/status` | `{"code":"XXXXX-XXXXX"}` | 等待时返回 `waiting`；候选已准备时用条件删除原子地返回 `ready` 数据，仅一次可读；过期码返回 410 |
| `POST /mcp` | Streamable HTTP MCP JSON-RPC | 提供 `initialize`、`ping`、`tools/list` 和 `tools/call`；当前只有 `submit_confirmed_profile` |
| `POST /api/site/publish` | `{theme,portrait,items:[{field,value,disclosure}]}` | 保存律师主动发布的内容，生成公开 slug 和一次显示的管理令牌 |
| `GET /api/site/manage` | `Authorization: Bearer <token>` | 读取该管理令牌对应的网站内容 |
| `POST /api/site/update` | Bearer 管理令牌 + 发布内容 | 更新同一个公开网址并恢复 active 状态 |
| `POST /api/site/withdraw` | Bearer 管理令牌 | 撤回公开页面，链接显示撤回提示 |
| `GET /p/{slug}` | 无 | 返回发布的公开个人网站 |

`submit_confirmed_profile` 参数：`code`、`items[]`（字段必须属于姓名/职务/简介/联系方式/业务/经历/教育/成果；每项含 value，可选 sources、reviewNote）、可选 `warnings[]`。MCP 只接受 Harness 平台的有效 waiting 短码，短码更新为 `ready` 后不可重复提交。

MCP 上限为 256 KB，创建码/轮询接口为 16 KB。这些是结构化 JSON 请求的安全上限，不是简历文件限制。单项长度和数组数量按后端字段模型校验。

## 本地 Python 后端

`server.py` 提供相同 `/api/config`、`/api/handoff/create`、`/api/handoff/status`、`/mcp` 接口；短期传输数据保存在 SQLite，服务首次启动自动建表。简历读取在本地完成，不上传给服务器；设备内存、PDF/OCR 环境为实际运行边界。

## 数据流约束

1. 简历原件由律师直接上传到其 DeepSeek Harness 会话，或由其浏览器本地读取；禁止工作台把原件写入 D1/SQLite。
2. Harness 必须先显示候选字段、来源和披露提醒，并等待律师明确确认，之后才能调用 MCP。
3. 短期回填只包含候选字段、来源摘录及提醒，存储短码摘要，不存明文短码。
4. 工作台取回回填内容后，每项仍为待核对状态；律师再次逐项点选后才进入网站预览。
5. 名片、个人资料和未发布网页内容停留于当前浏览器会话，不写入服务器草稿；律师主动发布的网站内容保存在 D1 直至主动撤回。

## D1

托管 schema：`hosted-site/db/schema.ts`。迁移在 `hosted-site/drizzle/`。D1 表分别保存短时回填和律师主动发布的网站；发布版本时 Sites 应用 migration。
