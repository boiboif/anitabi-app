# 官网访问统计配置

官网使用 Umami Cloud 记录页面浏览量和访客数。部署时提取最近 30 天的汇总；初始化并维持累计检查点后，也可展示累计浏览量。访客明细和 Umami 控制台不公开；API 密钥不会写入页面。

1. 在 [Umami Cloud](https://cloud.umami.is/signup) 注册账号，添加一个网站。网站域名填写 `boiboif.github.io`（不包含 `/anitabi-app/` 路径），保持分享链接关闭。
2. 在该网站的 Tracking code 中找到 `data-website-id`。在 GitHub 仓库的 **Settings → Secrets and variables → Actions → Variables** 中新建 `DOCS_UMAMI_WEBSITE_ID`，填入该 ID。设置后部署的官网会加载统计脚本。
3. 在 Umami 的 Settings → API keys 中[创建 API 密钥](https://docs.umami.is/docs/cloud/api-key)，并在 GitHub 仓库的 **Settings → Secrets and variables → Actions → Secrets** 中新建 `DOCS_UMAMI_API_KEY`。密钥只能存放在 Secret 中，不能提交到仓库或放入 Variables。
4. 首次设置累计值时，打开 **Actions → Deploy website to GitHub Pages → Run workflow**，勾选 `bootstrap_stats` 后运行。仅当检查点不存在且明确勾选时才会初始化；常规运行不会自动重置。初始化取 Umami 当前保留的最早数据作为起点，之前已清除的数据无法恢复，因此不保证包括官网上线后的全部历史。
5. 工作流每天更新一次；手动运行时通常不勾选 `bootstrap_stats`。只修改变量或 Secret 不会立即重新部署。最近 30 天指部署时的最近 30×24 小时，统计为快照而非实时值；广告拦截器等因素也可能使统计低于实际访问量。

累计检查点保存在 GitHub Actions 的 `website-stats-checkpoint` artifact 中，每次成功更新后上传，最多保留 90 天。新计算会重新查询上一次的 30 天窗口并替换其数值，以减少边界重复和近期延迟入库的影响；更晚于 30 天才入库的数据无法保证计入。如果检查点不可读取、无效、站点 ID 不匹配或距今超过 60 天，则当次只发布近 30 天数据，不猜测累计值；检查点完全丢失时不能自动恢复，重新初始化也无法找回 Umami 已清除的历史。若有备份，应先恢复可信检查点。GitHub Actions 的 artifact 或 Umami 请求失败不会阻止官网部署。

统计 JSON 位于部署产物的 `website-stats.json`，格式为 `{"period":"30d","pageviews":123,"visitors":45,"updatedAt":"2026-11-04T01:17:00.000Z","totalPageviews":987,"totalSince":"2026-06-01T00:00:00.000Z"}`。只有成功维护检查点时才提供可选的 `totalPageviews` 和 `totalSince`；密钥或网站 ID 未配置、30 天查询失败或返回数据无效时不会生成文件。只有网站 ID 时仍会收集统计，但不会公开汇总数字。

本地开发默认不加载统计脚本；如需检查接入，可在运行官网构建命令前设置 `DOCS_UMAMI_WEBSITE_ID`。若以后更换官网域名，应同步修改 `docs/.vitepress/config.mts` 中的 `data-domains` 值。
