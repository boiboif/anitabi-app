# OTA 配套整包与后台下载验证报告

## 后续调整：整包与 OTA 检测响应时序

此前两路检测先统一等待，再显示整包和启动 OTA 下载。可控响应审计复现了三个问题：慢 OTA 检测拖住已返回的整包结果；慢整包检测拖住已确认可用的 OTA 下载；上一轮 OTA 提示还在时，整包结果虽已返回，但等待另一边期间旧按钮仍能重启。该等待结构自 2026-08-13 已存在，不是本次静默策略新引入。

现改为两个独立分支：整包结果返回就更新 ref、清除 OTA 提示、显示整包并恢复后台任务；OTA 检查和下载独立推进。两路全部结束后才决定是否显示 OTA 重启提示，并归并错误、释放重复检查保护。旧重启操作等待当前整包判定；等待期间若开始新一轮检测，会继续等待最新判定。有已知更高整包则不重启，无更高整包则执行用户明确请求的重启，不等待另一边 OTA 下载。

只修改 JavaScript 更新调度和提示仲裁，APK 原生恢复顺序及 `installWhenReady: false` 保留。整包失败且无已知整包时仍允许成功下载的 OTA 提示；OTA 检测失败继续忽略，OTA 下载失败继续报告，两路同时失败时维持下载错误优先。本轮未增加请求超时：整体 `isChecking` 仍持续到两路结束，但已返回的整包结果不会再被 OTA 拖住，OTA 下载也不会被整包检测拖住。

下表是当前实现的自动化回归场景；使用真实 hook 和可控平台替身。本轮没有重新构建、发布或进行真机验证，不能以此替代 Android/iOS 的实际运行验收。上一轮 `.tmp/update-validation/response-order-audit.log` 的 23 项是修复前的行为审计，其中包含缺陷复现断言，不能作为修复后的通过证据。

更新管理器保留原 15 项并新增 17 项，**32/32 通过**，见 `.tmp/update-validation/response-order-green.log`。同组测试在修改前源码上有 11 项失败、21 项通过，见 `response-order-red.log`，确认新增用例能够检出原问题。最终九个相关测试文件统一执行 **197/197 通过、0 失败、0 取消、0 跳过**，耗时 2361.7528ms，见 `response-order-regression.log`。全项目 TypeScript、相关 ESLint 与格式检查通过。本轮没有修改第三方库或原生代码，未执行线上发布；提交状态以 Git 记录为准。

| 场景                                           | 验证结果                                        | 状态 |
| ---------------------------------------------- | ----------------------------------------------- | ---- |
| 整包先返回，OTA 检测仍等待                     | 立即显示整包、清除旧 OTA 提示，并可恢复后台任务 | 通过 |
| OTA 检测和下载先完成，整包仍等待               | 已完成下载但不提前提示重启                      | 通过 |
| 整包最终有更新                                 | OTA 保持静默，包括关闭整包弹窗后                | 通过 |
| 整包最终无更新，两种返回顺序                   | OTA 完成后显示正常重启提示                      | 通过 |
| 旧 OTA 按钮在当前整包判定之前点击              | 等待判定，发现整包就不重启                      | 通过 |
| 判定无整包，另一边 OTA 检测或下载仍等待        | 可执行用户此前明确请求的重启                    | 通过 |
| 检查刚启动、惰性服务还未执行检测时到达重启操作 | 同样等待整包判定，无初始异步窗口                | 通过 |
| 等待任一路检测或 OTA 下载时重复检查            | 不重复请求，全部结束后可再次检查                | 通过 |
| 整包检测失败、OTA 成功                         | 保留原有 OTA 降级策略并报告整包错误             | 通过 |
| OTA 检测失败、整包成功                         | 正常显示整包，不误提示 OTA                      | 通过 |
| OTA 下载失败，或两路同时失败                   | 保持原错误优先级，后续可重试，无未处理拒绝      | 通过 |
| 整包后台恢复、已完成 APK 缓存                  | 仍不自动打开安装器                              | 通过 |

## 后续调整：整包可用时 OTA 静默

用户仍在 0.8.0、同时有兼容的 0.8.0 OTA 和更高的 0.9.0 整包时，只显示整包升级提示。OTA 仍下载到本地，但不再提示重启或主动调用 reload，等待下次冷启动自然应用。关闭整包提示后，OTA 下载完成也不重新弹窗；只有 OTA 可用时保留原有重启提示。

此前静默策略调整时，更新管理器用例从 7 项扩为 15 项，15/15 通过，日志为 `.tmp/update-validation/ota-binary-priority-tests.log`；全项目 TypeScript、相关 ESLint 通过。该轮只调整提示状态和显式重启入口，没有更改 OTA 下载、缓存或原生启动选择逻辑，未重新构建、发布或进行真机验证。该轮尚未覆盖上节后来确认并修复的两路检测响应等待窗口。下文 166/172 项及真机结果是此前归档，不代表新策略已进行真机验收。

| 本轮场景                                                                  | 结果 |
| ------------------------------------------------------------------------- | ---- |
| 同时存在 OTA 与同基础版本更高构建号 / 0.9.0 整包，仍下载 OTA 但不提示重启 | 通过 |
| 整包弹窗先关闭、OTA 后完成，仍保持静默                                    | 通过 |
| 已有 OTA 提示时发现更高整包，立即清除原提示                               | 通过 |
| 旧 OTA 按钮事件在发现整包后到达，不触发重启                               | 通过 |
| 只有 OTA 时保留提示，且只在用户主动操作时重启                             | 通过 |
| 整包检查失败且尚无已知整包时，保留正常 OTA 提示                           | 通过 |
| 已知更高整包后再次检查失败，不恢复 OTA 提示                               | 通过 |
| OTA 下载失败不丢失整包提示，后续检查仍可执行                              | 通过 |
| 现有 APK 自动恢复仍只下载，不自动安装或重启                               | 通过 |

## 后续调整：隐藏版本诊断详情

“关于”页面只保留常规版本号和更新提示。连续点击页面标题 5 次才弹出内容版本、运行来源、原生版本/构建号和 OTA ID；相邻点击超过 1 秒会重新计数，弹窗触发后也会重置。

本轮执行 `node --test scripts/tests/app-version.test.mjs`，40/40 通过，日志为 `.tmp/update-validation/hidden-version-tests.log`；全项目 TypeScript、相关 ESLint 通过。本轮未重新构建、启动开发服务或进行真机验证。下文 166 项统一测试及 About 截图保留为本次隐藏入口调整前的归档，不应据此声称新标题手势已获真机验收。

提交前再次统一执行九个测试文件，包含上述隐藏入口调整后的版本用例，结果为 **172/172 通过、0 失败、0 跳过**，耗时 2145.6655ms。日志为 `.tmp/update-validation/pre-commit-tests.log`；本次提交复核没有重新构建或执行线上发布。

| 本轮交互用例                                                | 结果 |
| ----------------------------------------------------------- | ---- |
| 主页面不展示来源、构建号、完整 OTA ID，主版本仍与“我的”一致 | 通过 |
| 前 4 次标题点击不弹窗，第 5 次才显示诊断详情                | 通过 |
| 相邻点击超过 1 秒重新计数，恰好 1 秒仍连续                  | 通过 |
| 弹窗触发后再次计满 5 次才能重新打开                         | 通过 |
| 整包、热更新、紧急回退、开发来源的信息正确                  | 通过 |
| 英文、日文弹窗标题和详情正确翻译                            | 通过 |
| “检查更新”仍使用原来的更新操作                              | 通过 |

本报告对应 `@kesha-antonov/react-native-background-downloader@4.6.4` 方案，分支为 `feature/ota-bundled-releases-background-download`。旧自写原生模块的构建、真机通过结论不再适用；历史文件保留在本地 ignored `.tmp/`，不计入本次验收。

报告日期：2026-10-31，时区 Asia/Shanghai。原自动化日志归档于 12:51:50，OTA 服务最终证据截至 12:51:22；本轮测试清理已归档，后续提交以 Git 分支记录为准。

## 当前结论与证据边界

隐藏入口调整前的九个测试文件统一执行 **166/166 通过、0 失败、0 跳过**，耗时 2537.9719ms；全项目 TypeScript 检查退出码 0。完整本地 OTA 链路的 16 个协议阶段及 A/B 各自的冷启动、重复检查 C 共 20 项真实验证通过。

Android debug、A/B Release 和真实 C export 已完成。真机确认 A 接收 OTA1 后不会因下载目录出现 B 而收到整包升级提示；B 全新安装直接运行 OTA1 内容，不重复应用较早 OTA1；A/B 均能继续接收真实不同 JS 的 C，Profile/About 显示统一内容版本，同时保留各自原生构建号和运行来源。

后台下载真机索引为 **12/13 通过**；受安装策略影响的六项已用最终源码重跑。唯一未通过项是 HyperOS 通知栏取消：界面无法展开并实点取消动作，不能用存在 PendingIntent 代替通过结论；应用内取消已通过。最终 ESLint、所有改动文件的 Prettier、TypeScript 与 Git diff 检查均通过；包含本报告用例矩阵的官网本地构建通过，耗时 6.90s。iOS、线上 EAS Update、GitHub Release 和官网部署未执行。

- 客户端测试运行真实 TypeScript 服务、适配器、hook 或版本函数，原生下载库、文件系统、AppState、安装器等使用替身，不能证明真实后台调度、通知栏行为或安装成功。
- 版本测试还运行本地 SDK 58 Constants getter，并渲染 Profile/About 的轻量组件树；不能证明真机画面、原生版本字段或真实 OTA 加载。
- 本地 OTA 测试运行实际 HTTP 服务，校验协议、资产 hash、清单隔离及故障；测试中的导出目录为夹具，不能代替真实 APK、真实 SDK 58 export 和设备证据。
- 发布测试执行构建号计算、临时目录中的清单生成与工作流断言，不会执行构建、发布 EAS Update、创建线上 Release 或部署官网。
- 当前 OTA 守卫测试使用协议响应替身，验证 Android/iOS 的 runtime、channel、完整 source SHA 和有界重试；不能替代一次真实发布流程的验收。

## 必须区分的两类原生发布

**首次交付后台下载原生能力必须走常规整包升级。** 新库的原生代码无法通过 OTA 安装；首次能力包应按常规原生发布，同时推进客户端升级清单和下载清单，并按原生兼容性规则确定 runtime。不能把这次能力发布当作仅供新用户下载的补充包，导致老用户永远拿不到原生能力。

旧原生包若收到与其兼容的 JS 更新，先通过可选 `RNBackgroundDownloader` 绑定判断能力；缺少新库时使用 guarded Expo 下载/恢复路径，不得因直接加载不存在的原生库而崩溃。取得新原生包后才可使用新库后台下载。是否存在原生能力、是否运行 OTA、内容版本分别记录。

后续纯 JS OTA 配套的补充整包则只更新 `download.json` / `download-preview.json`，不推进旧客户端使用的 `latest.json` / `preview.json`。两类发布的设备用例分别见 N 组和 O 组。

## 自动化归档结果

### 统一执行：166 项通过

主代理在仓库根目录统一运行下列九个文件，日志为 `.tmp/update-validation/automated-final.log`，归档时间 2026-10-31 12:51:50（Asia/Shanghai）。本次报告整理只读源码与既有证据，没有重跑测试。

| 分组                | 当前用例数 | 统一执行结果 |
| ------------------- | ---------- | ------------ |
| D 下载适配器        | 48         | 通过         |
| H 更新管理          | 7          | 通过         |
| V 内容版本          | 34         | 通过         |
| P 测试上报          | 14         | 通过         |
| C 配置              | 22         | 通过         |
| S 本地 OTA 服务     | 15         | 通过         |
| R 发布状态          | 8          | 通过         |
| L 启动回归          | 6          | 通过         |
| G 当前 OTA 发布守卫 | 12         | 通过         |
| 合计                | 166        | 166/166      |

实际统一执行命令（仓库根目录）：

```powershell
pwsh -NoLogo -NoProfile -Command "node --test scripts/tests/app-update-download.test.mjs scripts/tests/app-update-manager.test.mjs scripts/tests/app-version.test.mjs scripts/tests/update-test-reporter.test.mjs scripts/tests/update-config.test.mjs scripts/tests/ota-test-server.test.mjs scripts/tests/release-state.test.mjs scripts/tests/map-root-lifecycle.test.mjs scripts/tests/assert-current-ota.test.mjs"
```

原始最终输出为 `tests 166 / pass 166 / fail 0 / cancelled 0 / skipped 0 / duration_ms 2537.9719`，已覆盖新增用例和最终安装策略。以下各组的“通过”均指本次统一自动化结果；真实原生库与手机结果在后文单独登记。

## 自动化用例清单

每一行对应实际展开后的 `test` 标题。参数化标题分行计数；英文保留原名以便在源码或测试输出中直接检索。

### D：下载适配器与安装交接，48 项

来源：[app-update-download.test.mjs](../../scripts/tests/app-update-download.test.mjs)。此组使用真实新库适配器代码和原生库替身。

| 编号 | 实际测试标题                                                                                         | 结果 |
| ---- | ---------------------------------------------------------------------------------------------------- | ---- |
| D01  | binary detection preserves the native baseline when a download-only snapshot exists                  | 通过 |
| D02  | old native packages keep resumable Expo downloads and install the complete file                      | 通过 |
| D03  | an existing complete APK is reused without restarting its download                                   | 通过 |
| D04  | a legacy download completed while backgrounded only opens the installer after foregrounding          | 通过 |
| D05  | cancelled legacy download never leaves a partial APK or opens the installer                          | 通过 |
| D06  | legacy connection failure persists only the flushed partial file for retry                           | 通过 |
| D07  | library transfer continues in background and returning to the app does not open the installer        | 通过 |
| D08  | automatic reattachment finishes the existing library transfer without opening an installer           | 通过 |
| D09  | a request started in the background only prepares its APK even if the app returns before completion  | 通过 |
| D10  | a transient inactive state permanently revokes automatic installation for that download              | 通过 |
| D11  | returning from an external completion-notification installer does not trigger a service installation | 通过 |
| D12  | a download-only request reuses an already cached APK without opening its installer                   | 通过 |
| D13  | leaving and returning during discovery prevents a late automatic installation                        | 通过 |
| D14  | leaving and returning during copy prevents a late automatic installation                             | 通过 |
| D15  | library stop without done/error events settles cancellation and removes the partial APK              | 通过 |
| D16  | a paused library task preserves progress and finishes the same transfer                              | 通过 |
| D17  | a failed library transfer reports failure and a later retry creates a fresh task                     | 通过 |
| D18  | browser handoff pauses the library task and reattachment resumes without a second transfer           | 通过 |
| D19  | the real adapter rejects a truncated APK even when the library emits done                            | 通过 |
| D20  | the real adapter rejects a non-ZIP APK even when the library emits done                              | 通过 |
| D21  | cancelling during asynchronous library discovery leaves no orphaned task                             | 通过 |
| D22  | browser handoff during asynchronous library discovery does not start an orphaned transfer            | 通过 |
| D23  | cancelling a restored transfer while discovery is pending stops the pre-existing native task         | 通过 |
| D24  | browser handoff while restored discovery is pending pauses the pre-existing native task              | 通过 |
| D25  | cancelling while the APK move is pending prevents installation and removes its result                | 通过 |
| D26  | iOS preserves external release downloads without starting an Android task                            | 通过 |
| D27  | cancel after APK finalization stops a pending foreground-only installation                           | 通过 |
| D28  | cancel while the APK content URI is pending preserves the chosen result                              | 通过 |
| D29  | cancel while the APK content URI fails preserves the chosen result                                   | 通过 |
| D30  | browser handoff after APK finalization stops a pending foreground-only installation                  | 通过 |
| D31  | browser handoff while the APK content URI is pending preserves the chosen result                     | 通过 |
| D32  | browser handoff while the APK content URI fails preserves the chosen result                          | 通过 |
| D33  | library installation is revoked if Home is pressed during content URI creation                       | 通过 |
| D34  | legacy installation waits if Home is pressed during content URI creation                             | 通过 |
| D35  | a recovered DONE task finalizes without waiting for a done event that never replays                  | 通过 |
| D36  | a recovered PENDING task is reused rather than creating another transfer                             | 通过 |
| D37  | unknown total size does not cause NaN progress and a valid completed APK can install                 | 通过 |
| D38  | UIDT completion removed from getExisting tasks is recovered from the journal and complete file       | 通过 |
| D39  | a recovered DONE task without destination uses its stored APK path and verifies the actual file      | 通过 |
| D40  | a notification cancellation wakes the monitor without leaving an APK or reporting a download error   | 通过 |
| D41  | notification permission denial does not block downloading                                            | 通过 |
| D42  | notification permission service failure does not block downloading                                   | 通过 |
| D43  | an unknown error with code -1 remains a retryable failure rather than a user cancellation            | 通过 |
| D44  | foreground restoration wakes an active monitor when UIDT completed without a delivered done event    | 通过 |
| D45  | a missing UIDT record with only a partial source is not mistaken for a complete APK                  | 通过 |
| D46  | cancellation cleans files and task state even when its persisted journal is malformed                | 通过 |
| D47  | cancel protects the installer URI window when an APK was already cached before this session          | 通过 |
| D48  | browser handoff protects the installer URI window when an APK was already cached before this session | 通过 |

### H：更新管理 hook，7 项

来源：[app-update-manager.test.mjs](../../scripts/tests/app-update-manager.test.mjs)。覆盖 `useAppUpdates` 的启动、发现任务与 OTA 并行处理。自动恢复使用 `installWhenReady: false`，仅完成下载并显示可安装状态；用户明确点击安装后才交接，反复检查或恢复不会自动打开安装器。

| 编号 | 实际测试标题                                                                                       | 结果 |
| ---- | -------------------------------------------------------------------------------------------------- | ---- |
| H01  | completed library metadata shows the cached APK without automatically reopening the installer      | 通过 |
| H02  | the startup update check reattaches an unfinished library download without a second user action    | 通过 |
| H03  | repeated checks and install clicks share the active download monitor                               | 通过 |
| H04  | an available OTA still checks and downloads without a native task (no binary)                      | 通过 |
| H05  | an available OTA still checks and downloads without a native task (binary available)               | 通过 |
| H06  | asynchronous library discovery finishes before automatic reattachment and shares concurrent checks | 通过 |
| H07  | discovering a completed cached library task asynchronously does not reopen its installer           | 通过 |

### V：内容版本、SDK 58 Constants 与页面，34 项

来源：[app-version.test.mjs](../../scripts/tests/app-version.test.mjs)。内容身份与原生包身份分开，UI 用例为轻量渲染结果。

| 编号 | 实际测试标题                                                                                        | 结果 |
| ---- | --------------------------------------------------------------------------------------------------- | ---- |
| V01  | a legacy bundled app without content metadata keeps its base version                                | 通过 |
| V02  | an older binary running an OTA identifies the content and keeps its installed build                 | 通过 |
| V03  | an OTA and its bundled installer share content version while retaining different origins and builds | 通过 |
| V04  | both installer generations show the same later OTA content without changing native builds           | 通过 |
| V05  | an older OTA lacking revision metadata keeps its diagnostic update-ID suffix                        | 通过 |
| V06  | emergency fallback describes bundled content and suppresses a stale remote update ID                | 通过 |
| V07  | disabled updates do not turn a bundled package into an OTA just because flags or IDs are present    | 通过 |
| V08  | local development is explicitly distinguished from a remote OTA                                     | 通过 |
| V09  | the running content version and native package version come from separate sources                   | 通过 |
| V10  | channel remains independently identifiable even when content revisions match                        | 通过 |
| V11  | a test installer configured for production still runs bundled content                               | 通过 |
| V12  | a absent content revision safely falls back to the active OTA ID                                    | 通过 |
| V13  | a null content revision safely falls back to the active OTA ID                                      | 通过 |
| V14  | a empty content revision safely falls back to the active OTA ID                                     | 通过 |
| V15  | a whitespace content revision safely falls back to the active OTA ID                                | 通过 |
| V16  | a non-string content revision safely falls back to the active OTA ID                                | 通过 |
| V17  | a too short content revision safely falls back to the active OTA ID                                 | 通过 |
| V18  | a too long content revision safely falls back to the active OTA ID                                  | 通过 |
| V19  | a non-hex content revision safely falls back to the active OTA ID                                   | 通过 |
| V20  | revision normalization accepts full Git SHAs while keeping the visible suffix compact               | 通过 |
| V21  | a seven-character Git revision remains valid without adding padding                                 | 通过 |
| V22  | missing native fields stay unknown instead of inheriting OTA-supplied binary metadata               | 通过 |
| V23  | iOS build strings retain their original representation                                              | 通过 |
| V24  | a blank content version falls back to the native version                                            | 通过 |
| V25  | fully missing version metadata uses the supplied localized unknown label                            | 通过 |
| V26  | an OTA without an update ID still has a safe version and accurate source                            | 通过 |
| V27  | SDK 58 Constants reads embedded content metadata from the binary app.config                         | 通过 |
| V28  | SDK 58 Constants reads applied OTA content metadata from manifest.extra.expoClient.extra            | 通过 |
| V29  | downloaded candidate metadata cannot replace the running version until a new JS runtime starts      | 通过 |
| V30  | Profile and About show the same content version and About separately explains OTA/native identity   | 通过 |
| V31  | a bundled installer reports its own build and does not label its UUID as an OTA                     | 通过 |
| V32  | About version origin and binary details are translated in en                                        | 通过 |
| V33  | About version origin and binary details are translated in ja                                        | 通过 |
| V34  | About preserves the existing binary-update action while keeping current origin and build visible    | 通过 |

### P：仅测试包启用的状态上报，14 项

来源：[update-test-reporter.test.mjs](../../scripts/tests/update-test-reporter.test.mjs)。前六项展开标题均追加 `neither loads native update services nor sends reports`。

| 编号 | 实际测试标题 / 参数                                                                           | 结果 |
| ---- | --------------------------------------------------------------------------------------------- | ---- |
| P01  | production without a server URL                                                               | 通过 |
| P02  | production with an accidental server URL                                                      | 通过 |
| P03  | development with a server URL                                                                 | 通过 |
| P04  | a test build without a server URL                                                             | 通过 |
| P05  | a test build with a blank URL                                                                 | 通过 |
| P06  | a test build with a non-HTTP URL                                                              | 通过 |
| P07  | the test probe reports the actual SDK constants and active manager state                      | 通过 |
| P08  | an applied OTA reports its own SDK launch flags while retaining the installed binary identity | 通过 |
| P09  | update state changes send new reports without reporting every progress render                 | 通过 |
| P10  | foregrounding sends the latest state once and backgrounding does not add a progress loop      | 通过 |
| P11  | unmount removes foreground listeners and aborts an in-flight request                          | 通过 |
| P12  | unmount before the lazy imports settle prevents a stale report                                | 通过 |
| P13  | a disconnected server does not interrupt app behavior or prevent later foreground reports     | 通过 |
| P14  | an HTTP rejection does not interrupt app behavior or prevent later foreground reports         | 通过 |

### C：真实 app.config 的 VM 执行，22 项

来源：[update-config.test.mjs](../../scripts/tests/update-config.test.mjs)。不执行 prebuild 或插件生成；参数化标题按最终日志完整展开。

| 编号 | 实际测试标题 / 参数                                                                                       | 结果 |
| ---- | --------------------------------------------------------------------------------------------------------- | ---- |
| C01  | production ignores test-only application identity and server redirects                                    | 通过 |
| C02  | development ignores test-only application identity and server redirects                                   | 通过 |
| C03  | test-only loopback server and distinct package identity are opt-in                                        | 通过 |
| C04  | test server rejects unsupported loopback URL https://127.0.0.1:18790                                      | 通过 |
| C05  | test server rejects unsupported loopback URL http://127.0.0.1                                             | 通过 |
| C06  | test server rejects unsupported loopback URL http://192.168.1.1:18790                                     | 通过 |
| C07  | test server rejects unsupported loopback URL http://127.0.0.1.evil.example:18790                          | 通过 |
| C08  | test server rejects unsupported loopback URL http://localhost:18790/path                                  | 通过 |
| C09  | test server rejects unsupported loopback URL http://user@localhost:18790                                  | 通过 |
| C10  | test server rejects unsupported loopback URL http://127.0.0.1:0                                           | 通过 |
| C11  | test server rejects unsupported loopback URL http://localhost:65536                                       | 通过 |
| C12  | production enables both OTA and the matching binary-update channel                                        | 通过 |
| C13  | preview enables both OTA and the matching binary-update channel                                           | 通过 |
| C14  | development default disables OTA and binary checks even with a test server URL                            | 通过 |
| C15  | content identity uses explicit revision before the build commit and normalizes case                       | 通过 |
| C16  | invalid content identity is rejected ("abcdef")                                                           | 通过 |
| C17  | invalid content identity is rejected ("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")                        | 通过 |
| C18  | invalid content identity is rejected ("not-a-commit")                                                     | 通过 |
| C19  | invalid content identity is rejected (" b2222222")                                                        | 通过 |
| C20  | invalid content identity is rejected ("b2222222\n")                                                       | 通过 |
| C21  | the SDK58 runtime is stable across native display/build versions and content revisions                    | 通过 |
| C22  | the background downloader uses the existing MMKV dependency and declares install/notification permissions | 通过 |

### S：本地 OTA 服务与导出读取器，15 项

来源：[ota-test-server.test.mjs](../../scripts/tests/ota-test-server.test.mjs)。与工具用法配套的说明见[本地 OTA 验证服务](./ota-test-server.md)。

| 编号 | 实际测试标题                                                                                             | 结果 |
| ---- | -------------------------------------------------------------------------------------------------------- | ---- |
| S01  | SDK58 export loader follows Android metadata paths and preserves the actual export config revision       | 通过 |
| S02  | export loader rejects traversal, missing files, missing Android metadata and fabricated config identity  | 通过 |
| S03  | OTA2 cannot claim a revision or native runtime different from its exported public config                 | 通过 |
| S04  | resource dump maps renamed APK paths and image densities without assuming filenames                      | 通过 |
| S05  | OTA2 requires different JavaScript and A/B revisions must be explicit and distinct                       | 通过 |
| S06  | protocol v1 serves immutable APK bytes with correct SHA256 and native-compatible extra config            | 通过 |
| S07  | same update identity is stable so the native client can reject duplicate updates                         | 通过 |
| S08  | no-update, mismatching runtime, channel and platform do not deliver a manifest                           | 通过 |
| S09  | publishing the bundled catalog keeps the old package upgrade manifest byte-identical                     | 通过 |
| S10  | manifest and interrupted-asset failures recover without changing update identity                         | 通过 |
| S11  | state sequence bounds report evidence and preserves native/current-update request ids                    | 通过 |
| S12  | launch-asset corruption changes one response byte while preserving the manifest and healthy retry source | 通过 |
| S13  | integrity phase requires a corrupt C response and preserves A OTA1 identity, content and readiness       | 通过 |
| S14  | OTA1 on A and embedded B show the same content version while retaining distinct native/update identities | 通过 |
| S15  | phase assertions distinguish native A/B from the OTA content version and reject false readiness          | 通过 |

### R：发布状态、清单与工作流，8 项

来源：[release-state.test.mjs](../../scripts/tests/release-state.test.mjs)。此组不执行线上发布。

| 编号 | 实际测试标题                                                                         | 结果 |
| ---- | ------------------------------------------------------------------------------------ | ---- |
| R01  | build numbers advance across native, production and preview download manifests       | 通过 |
| R02  | a published release reserves its build even if the manifest push failed              | 通过 |
| R03  | invalid counters fail before packaging and Android versionCode cannot overflow       | 通过 |
| R04  | OTA releases keep the native version and isolate download manifests by channel       | 通过 |
| R05  | stale retries cannot replace a newer runtime or downloadable bundle                  | 通过 |
| R06  | generating an OTA download manifest leaves both existing upgrade manifests unchanged | 通过 |
| R07  | OTA gates the reusable dual-platform release and pins every checkout to its commit   | 通过 |
| R08  | production release workflows explicitly refresh the website download page            | 通过 |

### G：当前 OTA 发布守卫，12 项

来源：[assert-current-ota.test.mjs](../../scripts/tests/assert-current-ota.test.mjs)。守卫在补充整包的 prepare 和创建 Release 前分别读取配置中的 EAS URL，对 Android/iOS 都校验 channel、runtime 和完整 `contentRevision == source SHA`；缺失、不匹配或网络失败均阻止继续，短暂 CDN 传播延迟仅允许有界重试。

此组专门覆盖旧任务重试竞态：A 的 OTA 成功但配套整包任务失败，随后 B 的 OTA 已成功，即使 B 整包也失败、下载清单没有 B，重跑 A 也必须被拒绝。否则 A 可能获得更高构建号和更晚 embedded 时间，形成内容倒退且无法接收当前 B OTA 的新整包。工作流并发锁只能串行活动运行，不能排除此种已失败任务的后续重试；原有 source SHA 和升级基线检查继续保留。

| 编号 | 实际测试标题                                                                                            | 结果 |
| ---- | ------------------------------------------------------------------------------------------------------- | ---- |
| G01  | current source succeeds only after both platform requests match the configured URL, runtime and channel | 通过 |
| G02  | missing content revision fails closed instead of authorizing an old unidentified OTA                    | 通过 |
| G03  | old A retry is refused after B OTA even when B never produced a downloadable native package             | 通过 |
| G04  | one matching platform cannot hide a newer update on the other platform                                  | 通过 |
| G05  | a matching revision with an incompatible runtime still fails closed                                     | 通过 |
| G06  | native-style multipart manifests and plain Expo JSON are both parsed                                    | 通过 |
| G07  | a directive, duplicate manifest or missing multipart manifest cannot authorize a bundle                 | 通过 |
| G08  | HTTP errors, no-update responses and malformed JSON are not treated as fresh OTA evidence               | 通过 |
| G09  | network failures retry a bounded number of times without exposing their response or environment data    | 通过 |
| G10  | short CDN propagation delay succeeds after rechecking both platforms                                    | 通过 |
| G11  | retry settings and source identity are validated before making any request                              | 通过 |
| G12  | the successful OTA caller supplies its resolved config and child guards both build and publication      | 通过 |

### L：根布局启动回归，6 项

来源：[map-root-lifecycle.test.mjs](../../scripts/tests/map-root-lifecycle.test.mjs)。确认加入更新上报 hook 后保留既有启动延迟与生命周期语义，不是首屏性能实测。

| 编号 | 实际测试标题                                                                                      | 结果 |
| ---- | ------------------------------------------------------------------------------------------------- | ---- |
| L01  | startup attaches lifecycle and defers map/cache initialization until splash hide, frame and timer | 通过 |
| L02  | unmount while awaiting splash prevents late startup from initializing data                        | 通过 |
| L03  | unmount while awaiting frame prevents late startup from initializing data                         | 通过 |
| L04  | unmount while awaiting timer prevents late startup from initializing data                         | 通过 |
| L05  | Strict Mode effect cleanup and setup retain the pending one-time startup                          | 通过 |
| L06  | a rejected splash hide still initializes after deferral while mounted                             | 通过 |

## 静态检查、构建与产物登记

下表依据实际日志、主代理记录的退出码与 APK 只读检查登记。本次报告整理没有执行构建、export 或设备操作。

| 编号 | 检查 / 产物                                 | 结果                         | 实际结果与证据                                                                                                                                                                                                                             |
| ---- | ------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| B01  | 全项目 TypeScript `--noEmit`                | 通过                         | 主代理运行退出码 0，`.tmp/update-validation/final-typecheck.log` 无错误输出，归档于 12:51:51                                                                                                                                               |
| B02  | 最终相关代码 ESLint / 格式检查              | 通过                         | ESLint 检查所有改动的 source/scripts，exec 26028 退出码 0，日志 `.tmp/update-validation/final-lint.log`；所有改动文件的 Prettier 检查退出码 0，日志 `final-format.log`。`git diff --check` 退出码 0                                        |
| B03  | 新库 Android 原生能力                       | 通过（构建及任务实测）       | 新库 debug 构建与真实后台任务、通知、安装器交接已通过；插件配置及权限由 C 组覆盖。独立的最终 Manifest/autolinking 输出未另归档                                                                                                             |
| B04  | 新库 Android debug 包                       | 通过                         | `.tmp/update-validation/library-debug-build.log`：`BUILD SUCCESSFUL in 16m 31s`；下载验证使用 `anitabi-library-debug.apk`，SHA256 见下表                                                                                                   |
| B05  | 测试包 A 的 Release/R8 构建                 | 通过                         | 初次 15m 21s：`base-release-build-initial.log`；清理 embedded 缓存后 4m 54s：`base-release-build.log`，均位于 `.tmp/update-validation/`。真实启动验证 build 5602 / a1111111 / BASE                                                         |
| B06  | 最终测试包 B 的 Release/R8 构建             | 通过                         | 主代理 native exec 46883 退出码 0；最终日志捕获不完整，不登记最终耗时。此前 8m 24s 仅属于旧产物。最终 APK 静态检查 `installWhenReadyPolicyPresent: true`，全新安装并继续接收 C 的真机验证通过                                              |
| B07  | 真实 OTA2/C 的 SDK 58 export                | 通过（导出、协议及真机运行） | 最终 launch 为 `entry-907415bb033b5fc6b8ccf3f44d77e2ac.hbc`，13,165,848 字节、31 个资产；实际 hash 与 B 不同。`ota-artifact-metadata.json`、`final-server-evidence.json` 与已刷新为最终 a6e6… hash 的 `ota2-export-metadata.json` 相互印证 |
| B08  | 官网 VitePress 本地构建                     | 通过（本地）                 | `.tmp/update-validation/final-docs-build.log`：最终构建 6.90s、退出码 0，包含本报告的终稿用例矩阵；之后仅补录检查与清理事实。前次 30.62s 日志保留但不作为最终构建记录。本地构建不代表线上部署                                              |
| B09  | iOS unsigned IPA 编译                       | 未执行                       | 不推断 iOS 原生构建、签名、安装或商店接受情况                                                                                                                                                                                              |
| B10  | 线上 EAS Update / GitHub Release / 官网部署 | 未执行                       | 本轮只运行本地受控协议服务和设备测试，没有线上 OTA、Release 或部署成功结论                                                                                                                                                                 |
| B11  | 旧客户端升级清单保持不变                    | 通过                         | 主代理核对 `latest.json` / `preview.json` 的 `git diff --quiet` 退出码 0；本地 O05 再验证下载/升级两清单分离                                                                                                                               |

产物完整性登记：

| 产物                     | SHA256                                                             | 证据                                                                             |
| ------------------------ | ------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| 下载真机使用的 debug APK | `b4ff6488e435e01fd74f06739535b2a58354a4197067e3844b6d29a66c000f5d` | `library-device-evidence-index.json`；完成通知源文件与缓存文件 hash 也一致       |
| A APK                    | `0043935a99cfa8cde5105d4c53ed71a5dfa1d50e3ac508a27b6001eb777f174b` | `.tmp/update-validation/ota-artifact-metadata.json`，文件 `anitabi-ota-base.apk` |
| 最终 B APK               | `4b323d0cca41e01e51d216da9d32508a4b968273e8d6ffee848f14a5c58d22dd` | 同上，文件 `anitabi-ota-bundled.apk`                                             |
| B / OTA1 launch          | `cecc0597039f2e134061ae82afff2a9c2d1b5da65927bfc36fdbb3d9528a4cd5` | 同上；OTA1 直接使用 B 内真实 JS，10,648,764 字节                                 |
| C / OTA2 launch          | `a6e6f6fb813ded2f8534667bc98e2e4d1c897f4db197e29f86f090aa450a4570` | 同上；SDK58 真实导出，与 B launch 不同                                           |

## 真机环境与输入

设备 serial 为 `E6WKAEHIQWL7TSI7`，型号 `25060RK16C`，Android 16 / API 36，通知交互为 HyperOS；省电配置未单独归档。本轮下载测试使用已存在的开发包 `bbf.anitabiapp.dev`，OTA 使用两个独立测试包名，未将不同包名的数据当作同包名升级保留数据证据。硬件与清理记录见 `.tmp/ota-validation/cleanup-results.json`。

| 角色        | 包名 / 原生构建                         | 内容 revision / marker | 真实身份                                                          |
| ----------- | --------------------------------------- | ---------------------- | ----------------------------------------------------------------- |
| P0 旧原生包 | 未单独进行真机验证                      | 缺少新库的旧内容       | guarded fallback 由 D02 等自动化验证，不能代替 P0 真机            |
| A           | `bbf.anitabiapp.test.otabase` / 5602    | a1111111 / BASE        | embedded ID `e8c79c39-9bde-46d9-9a09-a1b6fc932a18`；version 0.8.0 |
| 最终 B      | `bbf.anitabiapp.test.otabundled` / 5603 | b2222222 / OTA_ONE     | embedded ID `2d159671-1932-4ae2-a646-48f242b4c902`；version 0.8.0 |
| OTA1        | 同 runtime/channel                      | b2222222 / OTA_ONE     | ID `050892b0-729e-417a-be6c-b670b7e1c73e`                         |
| C / OTA2    | 同 runtime/channel，真实不同 JS         | c3333333 / NEXT        | ID `9327b571-cd36-4832-8be8-e764c554321c`                         |

兼容 runtime 为 `0.8.0-sdk58`，channel 为 `production`，受控服务地址为 `http://127.0.0.1:18790`，不是线上更新源。实际 UTC 时间顺序为 A embedded 04:20:24.296、OTA1 04:29:07.526、B embedded 04:37:50.757、C 04:40:53.155，满足 `A < OTA1 < B < C`。完整 fixture、请求事件与 App 报告归档在 `.tmp/ota-validation/final-server-evidence.json`。

B 初次 ADB 安装被系统以 `INSTALL_FAILED_USER_RESTRICTED` 拒绝；主代理随后定向 `--user 0` 安装成功。独立包名的 B 首次运行实际取得 b2222222/OTA_ONE，之后成功运行 C，属于全新客户端验证；不将首次安装失败写成成功或忽略。

## N：首次原生能力交付与旧包回退边界

| 编号 | 场景                                                                            | 结果                                  | 证据与限制                                                                       |
| ---- | ------------------------------------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------- |
| N01  | P0 收到兼容 JS，guard 检查缺少新库后使用 Expo 下载/恢复，不因加载缺失绑定而崩溃 | 自动化通过；旧原生真机未执行          | D02 覆盖真实服务的 guarded fallback；本轮 A/B 都包含新库，不能作为缺库设备证明   |
| N02  | 首次后台能力包走常规 native release，推进升级和下载两清单，旧版本能收到整包升级 | 自动化通过；线上发布未执行            | R 组覆盖常规与补充包的分支；实际首次能力发布仍需常规整包发布，不能只更新下载目录 |
| N03  | 安装新包后后台能力可用，并核对同包名覆盖安装、数据保留                          | 原生能力通过；覆盖安装/数据保留未执行 | debug 真机后台任务已证明绑定可用；打开安装确认界面不等于完成覆盖安装             |
| N04  | 后续纯 JS 配套包只更新下载目录，老用户不因该快照收到整包升级提示                | 本地协议与真机通过                    | O05、两清单静态检查通过；没有声称本轮已发布线上补充包                            |

## M：新库 Android 下载与安装真机结果

证据索引为 `.tmp/update-validation/library-device-evidence-index.json`，汇总 **12 项通过、1 项未通过**。索引保留每项来源，不能把较早单次运行的 11 项通过直接当作最终策略全部通过。

新库任务仅在用户前台发起、且本次请求始终保持 active 时自动交接安装；出现 inactive/background 即撤销本次自动安装资格，返回前台不恢复。自动恢复仅继续下载，用户随后可明确点击安装缓存文件。受此策略影响的五项于 `mvvwsk46` 重跑通过，完成通知外部安装器与返回无重复交接于 `mvvwuudq` 通过；六项均使用最终源码。未改变的适配器场景沿用 `mvvur0rm` 的新库基线证据，范围在下表明确标注。

| 编号 | 实际用例 / 预期                                                                  | 结果       | 证据与覆盖范围                                                                                                                                                                                |
| ---- | -------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M01  | foreground：前台下载完整 APK 后打开安装确认界面                                  | 通过       | `library-device-results-mvvwsk46.json`；真实文件 hash、系统安装器活动与截图，最终源码                                                                                                         |
| M02  | background：按 Home 后字节继续增长、taskId 不变                                  | 通过       | 同上，最终源码；后台截图与前后进度                                                                                                                                                            |
| M03  | locked：锁屏期间字节继续增长、taskId 不变                                        | 通过       | `library-device-results-mvvur0rm.json`；未改变的适配器基线，锁屏截图                                                                                                                          |
| M04  | background-completion：后台完成不打开安装器，返回前台也不自动安装                | 通过       | `library-device-results-mvvwsk46.json`；最终源码；完成任务、前后台状态和顶层活动                                                                                                              |
| M05  | foreground-install：返回 App 后明确点击，复用缓存 APK 交接安装                   | 通过       | 同上；先验证无自动安装，再显式请求；缓存 hash 与截图，最终源码                                                                                                                                |
| M06  | reload-reconnect：JS reload 后重连同任务，恢复仅下载，不自动安装                 | 通过       | 同上；taskId/进度保留、无新完整下载，完成文件及无自动安装，最终源码                                                                                                                           |
| M07  | cancel：应用内取消删除任务且不打开安装器                                         | 通过       | `library-device-results-mvvur0rm.json`；未改变的适配器基线，不等同于通知取消                                                                                                                  |
| M08  | http-error：HTTP 错误导致明确失败，不交接安装                                    | 通过       | 同上；未改变的适配器基线，失败状态与截图。其他断网时机/成功重试由自动化和 OTA 故障分别覆盖，不扩展为所有网络场景                                                                              |
| M09  | invalid-apk：无效 APK 被拒绝、不打开安装器                                       | 通过       | 同上；未改变的适配器基线；截断与非 ZIP 细分另有 D19/D20 自动化                                                                                                                                |
| M10  | notification-progress：真实下载通知可见、进度值增长                              | 通过       | 同上；通知记录与前后截图，未改变的适配器基线                                                                                                                                                  |
| M11  | notification-cancel：实点通知取消后停止任务                                      | **未通过** | `library-device-results-mvvwwkkd.json` 与 `mvvwwkkd-notification-cancel-unavailable.png`；HyperOS 未暴露可实点的取消动作。原生 PendingIntent 存在不能证明该入口可用，未用模拟调用替代实际点击 |
| M12  | notification-completion：点击完成通知打开真实外部安装器，返回 App 不二次弹安装器 | 通过       | `library-device-results-mvvwuudq.json`；完成通知及首个系统安装器截图、源/缓存 APK hash、返回前后状态，最终源码                                                                                |
| M13  | notification-denied：拒绝通知权限后下载仍完成并可交接安装                        | 通过       | `library-device-results-mvvur0rm.json`；未改变的适配器基线。权限服务异常仅有自动化，不冒充真机异常注入                                                                                        |

上述结果证明完成文件和安装确认流程，不证明用户确认后完成同包名覆盖安装或保留业务数据。进程结束后的后台恢复、不同 Android API/厂商、真实暂停/浏览器交接、各异步窗口及短暂 inactive 的逐项真机注入、iOS 外部下载均未单独验证；相应自动化可追溯至 D/H 组，不写为设备通过。

## O：完整 OTA、补充整包与内容版本真机结果

使用[本地 OTA 服务与校验脚本](./ota-test-server.md)。以下 **16 个协议 phase 均真实通过**；另有 A/B 各自的冷启动和重复检查共四项通过。A/B 是不同测试包名，验证新老客户端并存和内容兼容，不证明同包名覆盖安装。

本节证据文件均位于 `.tmp/ota-validation/`。各 `*-profile.json` 包含校验后的 App 报告及该阶段的 HTTP sequence 边界；applied 与 bundled-new 阶段同时有 Profile/About JSON、PNG 和 XML。某些操作同时产生多个断言：A 健康重试 C 与 `ota2-ready-old` 使用同一份成功下载；版本字段一致性也复用相应 applied/bundled-new 的真实页面，未计作独立重复操作。

| 编号 | 实际 phase / 操作                                  | 结果 | 实际结果与证据                                                                                                                                                                                                        |
| ---- | -------------------------------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| O01  | base：A 初次运行内嵌内容                           | 通过 | `base-profile.json`、`base-about.json` 及同名 PNG/XML；a1111111 / BASE / embedded / build 5602，未提示整包升级                                                                                                        |
| O02  | ota1-ready：A 下载 OTA1，重启前保持旧内容          | 通过 | `ota1-ready-profile.json`、`ota1-ready-overlay.png/xml`；当前仍 a1111111 / BASE，`hotUpdateReady: true`，只提示重启                                                                                                   |
| O03  | ota1-applied：A 重启加载真实 OTA1                  | 通过 | `ota1-applied-profile.json`、`ota1-applied-about.json` 及页面 PNG/XML；b2222222 / OTA_ONE / hot-update，native build 仍 5602，完整 OTA1 ID 正确                                                                       |
| O04  | same-update：再次检查同一 OTA1                     | 通过 | `same-update-profile.json`、`same-update-alert.png/xml`；仍运行同一 ID，非 ready，无重复下载/重启或整包升级提示                                                                                                       |
| O05  | bundled-old：目录出现 B，旧 A 不收到整包升级       | 通过 | `bundled-old-profile.json`、`bundled-old-alert.png/xml`；`bundled-catalog-vs-upgrade.json` 中下载 build 5603、升级 build 5602，A 的整包提示为空且保持 OTA1。官网下载入口代码与本地构建另由 R/B08 覆盖，本轮未部署官网 |
| O06  | bundled-new：最终 B 全新安装运行内置 OTA1 内容     | 通过 | `bundled-new-profile.json`、`bundled-new-about.json` 及 PNG/XML；b2222222 / OTA_ONE / embedded / build 5603；请求虽收到旧 OTA1 manifest，native 按 embedded 时间拒绝过期内容，无旧 OTA1 重启提示                      |
| O07  | runtime-mismatch：runtime 不兼容拒绝下发           | 通过 | `runtime-mismatch-profile.json` 与 alert PNG/XML；native manifest 响应 204，A 保持 OTA1、非 ready                                                                                                                     |
| O08  | channel-mismatch：channel 不匹配拒绝下发           | 通过 | `channel-mismatch-profile.json` 与 alert PNG/XML；响应 204，内容、ID 与运行身份保持                                                                                                                                   |
| O09  | manifest-error：HTTP 503 不误报更新成功            | 通过 | `manifest-error-profile.json` 与 alert PNG/XML；实际 503 事件，A 仍 b2222222 / OTA_ONE、非 ready；后续清故障重试成功见 O12                                                                                            |
| O10  | asset-interruption：下载 C launch 时连接截断       | 通过 | `asset-interruption-profile.json`、`asset-interruption-result.png/xml`；事件标记 interrupted，A 继续 OTA1，非 ready，未启动不完整 JS                                                                                  |
| O11  | asset-corruption：完整长度但 1 字节损坏的 C launch | 通过 | `asset-corruption-profile.json`、`asset-corruption-native.log`、`asset-corruption-hash-proof.txt` 与 result PNG/XML；native 明确 SHA-256 mismatch，A 保持 OTA1 / b2222222 / OTA_ONE、非 ready                         |
| O12  | asset-retry：清故障后重试同一 C                    | 通过 | `asset-retry-profile.json`；健康 launch 完整下载，C ID 不变，A 旧运行内容不变但 ready 变 true；随后应用成功，不以新 UUID 绕过失败                                                                                     |
| O13  | ota2-ready-old：A 下载 C 后等待重启                | 通过 | `ota2-ready-old-profile.json` 与 overlay PNG/XML；当前 b2222222 / OTA_ONE / build 5602，ready true；复用 O12 成功下载的证据                                                                                           |
| O14  | ota2-applied-old：A 重启到 C                       | 通过 | `ota2-applied-old-profile.json`、`ota2-applied-old-about.json` 及 PNG/XML；c3333333 / NEXT / hot-update，build 仍 5602，真实执行不同 JS                                                                               |
| O15  | ota2-ready-new：B 也能下载 C                       | 通过 | `ota2-ready-new-profile.json` 与 overlay PNG/XML；重启前仍 b2222222 / OTA_ONE / embedded / build 5603，ready true                                                                                                     |
| O16  | ota2-applied-new：B 重启到 C                       | 通过 | `ota2-applied-new-profile.json`、`ota2-applied-new-about.json` 及 PNG/XML；c3333333 / NEXT / hot-update，build 仍 5603，完整 C ID 与 A 相同                                                                           |
| O17  | A force-stop 后冷启动                              | 通过 | 主代理实际 force-stop/冷启动，`final-server-evidence.json` 后段新报告仍 c3333333 / NEXT / C ID / build 5602，非 ready                                                                                                 |
| O18  | B force-stop 后冷启动                              | 通过 | 同上；新报告仍 c3333333 / NEXT / C ID / build 5603，非 ready                                                                                                                                                          |
| O19  | A 再次手动检查同一 C                               | 通过 | `base-same-c-alert.png/xml` 与最终事件；界面提示已是最新，保持 C，未再次下载或出现重启/整包提示                                                                                                                       |
| O20  | B 再次手动检查同一 C                               | 通过 | `bundled-same-c-alert.png/xml` 与最终事件；同样提示最新，保持 C，无重复升级                                                                                                                                           |

完整性故障的原生证据记录期望 hash `pub2-4E97S-FNGZ7yY4uTRyJf02xl-KfhvCQqkUKRXA` 与损坏响应实际 hash `rEV-vZn2hvvxtNcfskTgZNleTqA8PdRxYD0VftpUrbU` 不同。清故障后仍使用 C UUID `9327b571-cd36-4832-8be8-e764c554321c`，A/B 均最终执行 marker NEXT，证明拒绝与重试均由真实下载/加载链路完成，不是只改 metadata。

未单独执行“完全关闭本地服务后再恢复”的设备场景；本轮网络故障边界是实际 HTTP 503、资产截断与 hash 损坏，不能扩展为所有离线/网络切换条件。

### Profile / About 的实际版本矩阵

来源为 `.tmp/ota-validation/version-matrix.json`，由真实页面与对应报告整理。每行 Profile 和 About 的内容版本相同；UI 以统一 `contentRevision` 显示，完整 OTA UUID 只作诊断。native version 始终为 0.8.0，原生构建号取安装包身份，不能随 OTA 改成新包构建号。

| 状态        | 两页内容版本     | 实际 JS marker | 运行来源 | native build | 运行 ID       |
| ----------- | ---------------- | -------------- | -------- | ------------ | ------------- |
| A 基础包    | `0.8.0-a1111111` | BASE           | 整包内置 | 5602         | A embedded ID |
| A 应用 OTA1 | `0.8.0-b2222222` | OTA_ONE        | 热更新   | 5602         | OTA1 ID       |
| B 全新安装  | `0.8.0-b2222222` | OTA_ONE        | 整包内置 | 5603         | B embedded ID |
| A 应用 C    | `0.8.0-c3333333` | NEXT           | 热更新   | 5602         | C ID          |
| B 应用 C    | `0.8.0-c3333333` | NEXT           | 热更新   | 5603         | C ID          |

A/OTA1 与 B 内嵌内容版本一致，来源与构建号不同；A/B 应用 C 后内容版本和完整 OTA ID 一致，各自原生构建号保持。这是本轮实际显示与运行结果，不再使用 OTA UUID 前八位作为用户可见内容版本。

## 未执行项与清理登记

本轮已确认本地协议、真实 Android OTA 加载和后台下载的上述范围；未执行 iOS 原生构建/安装、线上 EAS Update、GitHub Release、官网部署、首次原生能力的线上升级交付、同包名实际覆盖安装与业务数据保留。HyperOS 通知栏取消仍是唯一未通过的已执行下载用例，需在能实点该动作的条件下另验。

主代理已完成本轮清理，原始结果为 `.tmp/ota-validation/cleanup-results.json`。仅卸载本次独立 OTA A/B 测试包，保留原有正式、test、dev 包；dev 二进制已为本次测试更新，但未 clear 或 uninstall 原有数据，这不等同于业务数据迁移验收。

| 项目                                     | 状态 / 证据                                                                                                                                   |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 本次 OTA A/B 独立测试包                  | 已在主用户 0 定向卸载，两个 `pm uninstall` 均返回 `Success`                                                                                   |
| 本地 OTA 服务 18790 与下载测试服务 18789 | 已停止，reverse 为空；本次自有下载目录为空                                                                                                    |
| 本次 Metro 8081                          | 已停止，未保留本次启动的服务或 reverse                                                                                                        |
| 原有正式/test/dev 包                     | 均仍安装：正式 `0.8.0/1026`、test `0.8.0/5601`、dev `0.8.0/1`；未清除或卸载原有数据，dev 二进制更新不构成数据迁移验收                         |
| dev 通知权限与手机状态                   | `POST_NOTIFICATIONS` 恢复 `granted=false`，无 `USER_SET` / `USER_FIXED`；手机已锁屏                                                           |
| 本地 Android 生成配置                    | prebuild 输出恢复 `.dev` / `development`，`CMAKE_OBJECT_PATH_MAX=240`；本次生成的 test bundle、manifest、autolinking 输出已删除，依赖缓存保留 |
| 旧自写模块目录                           | `modules/` 路径不存在，当前验证与产物使用第三方新库方案                                                                                       |
| 最终相关代码 ESLint / 格式 / diff 检查   | `final-lint.log`、`final-format.log` 均退出码 0，`git diff --check` 退出码 0                                                                  |
| 含本报告的最终官网本地构建               | `final-docs-build.log`：6.90s、退出码 0；未部署线上                                                                                           |
| Git 与线上发布                           | 验证在提交前完成；用户已授权提交并推送当前功能分支，最终提交以 Git 记录为准；未执行线上 EAS Update、GitHub Release 或官网部署                 |
