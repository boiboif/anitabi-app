# 官网访问统计配置

官网使用两个独立的统计服务：Umami Cloud 继续供维护者在后台查看；[GoatCounter](https://boiboif.goatcounter.com/) 为首页提供公开的全站总浏览量和近 30 天浏览量。GoatCounter 独立统计，不会自动继承 Umami 的历史数据，两者的数字和统计口径也可能不同。

## GoatCounter：官网展示

1. 登录 [boiboif.goatcounter.com](https://boiboif.goatcounter.com/)，在站点设置中启用 **Allow adding visitor counts on your website**。该选项默认关闭；启用后，知道页面路径的人也可能查询单页的汇总浏览量，但不会因此公开管理后台或单个访客记录。[官方说明](https://www.goatcounter.com/help/visitor-counter)
2. 在 **Settings → Data collection → Sessions** 中关闭会话去重，才能让重复浏览同一页面也计入浏览量；默认开启时统计口径更接近页面访问次数。[官方说明](https://www.goatcounter.com/help/sessions)
3. 网站使用 `boiboif.goatcounter.com` 的公开计数接口，无需 API 密钥。GoatCounter 的追踪仅在 `https://boiboif.github.io/anitabi-app/` 及其子路径运行；本地开发不发送访问数据。站内切换页面会计数，追踪路径不包含查询参数或页面锚点。
4. 首页分别读取全站累计数字和 `start=month` 的近 30 天数字。后者按最近 30×24 小时计算，GoatCounter 数据按小时汇总，公开计数可能缓存最多四小时，因此并非实时数据。服务不可用或公开计数未启用时，首页不会编造数字。[官方说明](https://www.goatcounter.com/help/visitor-counter)

GoatCounter 需要新收集访问数据；展示的累计数从该服务已有记录开始，不应与 Umami 的历史总数直接相加。广告拦截器等因素也可能使两种服务的数字不同。

## Umami Cloud：后台统计

Umami 网站 ID 已通过 GitHub Actions 变量 `DOCS_UMAMI_WEBSITE_ID` 配置。需要重新设置时，可在 Umami Tracking code 找到 `data-website-id`，然后在仓库 **Settings → Secrets and variables → Actions → Variables** 中填入。设置后需重新部署官网才会生效；站点域名为 `boiboif.github.io`，不包含 `/anitabi-app/` 路径。官网的 `data-domains` 位于 `docs/.vitepress/config.mts`，更换域名时需同步更新。

Umami 分享链接可以保持关闭，后台数据与 GoatCounter 互不影响。Umami Cloud 免费版不包含 API 访问；首页公开计数不再需要 `DOCS_UMAMI_API_KEY`、累计检查点或 `bootstrap_stats` 初始化。
