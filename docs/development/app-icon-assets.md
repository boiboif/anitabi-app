# 应用图标资源维护

唯一设计源文件是 `assets/images/anitabi-icon.svg`。应用桌面图标、Android 分层图、官网、README 和开屏图片均由它生成，不要直接修改派生文件。

```sh
yarn icons:generate
yarn icons:check
yarn icons:test
```

`icons:generate` 只更新图标资源，不执行 Expo export、prebuild 或原生构建。`icons:check` 只读检查全部派生资源；PNG 按解码后的像素比较，不受压缩级别影响。修改源文件后，应将源文件及生成结果一起提交。

| 资源                                                     | 用途                                               |
| -------------------------------------------------------- | -------------------------------------------------- |
| `assets/images/anitabi-icon.png`                         | 通用及 iOS 图标，1024×1024、不透明、无预制圆角     |
| `assets/images/anitabi-icon-adaptive-foreground.svg/png` | Android 彩色前景，含透明留白                       |
| `assets/images/anitabi-icon-adaptive-background.svg/png` | Android 渐变背景，与前景尺寸相同                   |
| `assets/images/anitabi-icon-adaptive-monochrome.svg/png` | Android 单色图层；相机从锚点中镂空，不包含装饰地图 |
| `assets/images/anitabi-splash-icon.png`                  | 独立开屏图标，透明圆角                             |
| `docs/public/app-icon.svg`                               | 官网使用的完整图标                                 |
| `docs/public/app-icon-rounded.svg`                       | GitHub README 使用的圆角图标                       |

源文件的 `sky`、`pin-shape`、`camera-shape`、`pin`、`camera` 和 `icon-background` 是生成器读取的命名元素。可以修改其形状、颜色和变换；保留这些标识。新增元素时，需要同步检查 Android 各图层的用途。

Android 使用 `-252 -252 1528 1528` 的 viewBox 保留当前彩色图标的比例。关键锚点和相机应位于 108dp 画布中央的 66dp 安全区内；装饰地图可以延伸到边缘。单色图标只使用透明度表达图形，因此相机必须真实镂空，不能仅在不透明锚点上叠加另一种颜色。

开屏背景保持白天白色、暗黑黑色，图标宽度为 100。原生开屏跟随系统外观；应用内单独设置的主题在 JavaScript 加载后生效。

源文件与像素检查不能替代真机检查。下次获准构建后，检查 Android 不同桌面形状、单色主题图标，以及 Android/iOS 冷启动的开屏大小和深浅色背景。图标和开屏原生配置需要新的安装包才能生效，OTA 无法替换已安装的系统图标资源。
