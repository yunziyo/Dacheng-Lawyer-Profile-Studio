# DeepSeek Harness 接入包

## 安装

1. 工作台 HTTPS 地址：<https://dacheng-profile-workbench.blush-whale-9999.chatgpt.site>。MCP 地址已写入 `agent.cordis.yml`。
2. 在 DeepSeek Harness 创建一份可编辑的用户 preset；若内置 preset 只读，先复制到用户 preset。把 `agent.cordis.yml` 中 MCP client 条目合并到 preset 的 `agent.cordis.yml`，不要覆盖已有配置。
3. 将 `SKILL.md` 安装到 Harness 可发现的 Skill 目录，例如 `~/.dsh/skills/dacheng-profile-assistant/SKILL.md`，或当前项目的 `.dsh/skills/dacheng-profile-assistant/SKILL.md`。
4. 保存 preset 后新建一个空白会话，并明确选择该 preset；确认 MCP server 已连接且列出 `submit_confirmed_profile` 工具。

## 使用

律师先在工作台创建一次性传输码；再在 Harness 新会话中上传简历并调用“大成律师简历整理”。AI 必须先展示候选、来源和披露提醒，等律师明确确认后才能调用 MCP 回填。回到工作台逐条核对并选择使用。

此适配依赖 DeepSeek Harness 的 MCP client/preset 配置；Harness 版本更新可能调整配置入口。此配置目前指向已部署的公开工作台。
