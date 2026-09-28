# 官网访问统计配置

官网使用 Umami Cloud 在后台查看访客数和页面浏览量，不在页面上公开显示统计数据。只有设置 `DOCS_UMAMI_WEBSITE_ID` 后，构建结果才会加载统计脚本。

1. 在 [Umami Cloud](https://cloud.umami.is/signup) 注册账号，添加一个网站。网站域名填写 `boiboif.github.io`（不包含 `/anitabi-app/` 路径），保持分享链接关闭。
2. 在该网站的 Tracking code 中找到 `data-website-id` 的值。
3. 打开 GitHub 仓库的 **Settings → Secrets and variables → Actions → Variables**，新建仓库变量 `DOCS_UMAMI_WEBSITE_ID`，填入上述 ID。它只是公开的网站标识，不是 API 密钥。
4. 在仓库的 **Actions → Deploy website to GitHub Pages** 手动运行工作流，或等待下次官网相关文件推送到 `main` 后自动部署。只修改变量不会重新部署已有页面。
5. 部署完成后访问 [官网](https://boiboif.github.io/anitabi-app/)，再到 Umami 的私有管理面板查看数据。站内页面切换会自动计入统计；访客数是按会话估算的，广告拦截器等因素也可能使数字低于实际访问量。

如需在本地检查接入，可在运行官网构建命令前设置同名环境变量；没有配置该变量的本地构建不会加载统计脚本。若以后更换官网域名，应同步修改 `docs/.vitepress/config.mts` 中的 `data-domains` 值。
