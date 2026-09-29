# F1 TV Surge 节点维护模块

这个项目面向 macOS Surge，脚本保持 iOS 可迁移。它维护一个美国候选节点组，用 F1 TV 的 `CONTENT/PLAY` 和实际 HLS/DASH manifest 检测节点。当前 `F1TV` 节点仍有效时保持原选择；失效时切到最近有效且延迟最低的 PASS 节点。

提供两种安装方式：**方式 A** 从 URL 安装模块（推荐，脚本托管在 GitHub），**方式 B** 克隆仓库后把配置片段合并进主配置。因为 Surge 模块不能定义策略组（[官方文档](https://manual.nssurge.com/profile/module.html)），两种方式都需要在主配置加入两个策略组；差别只在脚本来自远程 URL 还是本地路径。

## 能力边界

- 策略组成员由主配置静态定义；脚本只检测、保存状态和切换已有策略。
- `F1TV-US-Candidates` 从现有订阅组（默认 `Airport-All`，可改名）按名称正则筛选。
- 每次运行按候选组当前成员数量全量检测；节点间串行间隔默认 800 ms。脚本运行预算为 840 秒，Surge 条目超时为 900 秒。若遇到长时间网络故障导致预算耗尽，状态会记录 `time_budget_exhausted` 和 cursor，避免把未测节点误标为失败。定时任务每 8 小时运行一次，即每天 3 次全量检测。
- 探测前脚本会把 `F1TV-US-Candidates` 临时切到待测节点，请求中的 `policy` 使用候选组名；探测结束后恢复候选组原选择。Surge 的 `$httpClient.policy` 不能直接使用从组成员列表读出的节点名。
- PASS TTL 为 24 小时，失败 TTL 为 10 小时，覆盖两次定时全量检测之间的 8 小时间隔。
- Panel 把有效 PASS 排在前面；未检测和已过期结果显示为 ⏳，近期检测失败才显示 ❌。修复前生成的错误检测记录应清除后重测。
- L0 为站点 GET 预检，L1 为 `CONTENT/PLAY`，L2 为 manifest；L3 segment 检测默认关闭，打开后只对当前 `F1TV` 节点执行。HLS 会继续取一个 media segment，DASH 只完成 L2 并标记为跳过 L3。使用 GET 是为了兼容会拒绝 HEAD 的 CDN 或代理路径。
- 没有 PASS 时保持现有选择，不切到 DIRECT，并在 Panel 显示状态。
- 真实请求需要短期会话字段；项目不保存账号密码，也不自动登录。

## 方式 A：安装 Surge 模块（推荐）

模块文件是 [config/f1tv-module.sgmodule](config/f1tv-module.sgmodule)，包含规则、脚本和面板。Surge 模块不能定义策略组，所以两个策略组要在主配置中粘贴一次（两行）。

1. 在主配置 `[Proxy Group]` 中粘贴（如果你的订阅组不叫 `Airport-All`，改成实际组名）：

   ```ini
   F1TV-US-Candidates = select, include-other-group=Airport-All, policy-regex-filter=(?i)(美国|US|USA|United States|🇺🇸)
   F1TV = select, include-other-group=F1TV-US-Candidates
   ```

2. 在 Surge（Mac 或 iOS）的模块页面选择 **从 URL 安装**，填入模块地址。本仓库已发布，直接用：

   ```
   https://raw.githubusercontent.com/Tony1026/f1tv-surge/main/config/f1tv-module.sgmodule
   ```

   如果你 fork 或自托管，先按 [发布你自己的副本](#发布你自己的副本) 渲染出指向你仓库的模块再安装。
3. 保存并重新加载配置，确认 `F1TV-US-Candidates` 中筛出了美国节点，`F1TV` 中也有这些节点。
4. 按 [写入会话字段（一次性）](#写入会话字段一次性) 完成 setup，然后触发一次全量检测。

注意：如果你之前用过方式 B 手动合并过这些段，不要再安装模块，避免重复定义同名策略组和脚本。

## 方式 B：本地克隆后手动合并

适合不想依赖远程脚本托管，或 Surge 界面没有模块安装入口的情况。

1. 克隆本仓库到本机任意位置（之后不要移动目录，脚本路径按绝对路径写入配置）：

   ```bash
   git clone https://github.com/<你的用户名>/f1tv-surge-maintenance.git
   cd f1tv-surge-maintenance
   python3 tools/render_config.py
   ```

   这会在 `dist/` 生成两份填好本机绝对路径的文件：`f1tv-module.sgmodule`（可放进 Surge 配置目录作为模块）和 `f1tv-main-profile.conf`（用于手动合并）。

2. 在 Surge Mac 打开当前配置文件，把 `dist/f1tv-main-profile.conf` 中的各段分别合并到主配置的同名 `[Proxy Group]`、`[Rule]`、`[Script]`、`[Panel]` 段。若已有同名分组或面板，先合并配置，避免重复。规则要排在宽泛规则和 `FINAL` 之前。
3. 保存并重新加载主配置，确认 `F1TV-US-Candidates` 中有美国节点，`F1TV` 中也有这些节点。
4. 按 [写入会话字段（一次性）](#写入会话字段一次性) 完成 setup，然后触发一次全量检测。

如果你的 Surge 配置是远程托管或只读的，先在"配置"页面复制出一个本地可编辑副本，再加入这些段。Surge 官方文档说明，模块文件需要放在配置文件目录或通过 URL 安装；当前 macOS UI 没有本地 `.sgmodule` 选择按钮时，直接修改本地 profile 是等价且更简单的方式。

项目规则片段只加入本次浏览器实际观测到的 `f1tv.formula1.com` 和 `ott-video-cf.formula1.com`。实际客户端如使用其他域名，在 Surge 请求列表确认域名与命中的策略，再按需把该域名的规则加到 `[Rule]`；不要把未观测的第三方域名直接视为已覆盖。

## 写入会话字段（一次性）

真实请求需要短期会话字段。项目不保存账号密码，也不自动登录；字段由你自己从已登录的浏览器里获取，只写入本机 Surge 的持久化存储。

1. 复制 `src/setup.js` 为 `src/setup.local.js`，填写 `AUTH` 中的短期字段：`ascendontoken`、`entitlementtoken`、`sessionid` 和可选的 `correlationid`、`x-f1-device-info`。获取方法见 [从 Chrome 获取会话字段](#从-chrome-获取会话字段)。
2. 在主配置的 `[Script]` 段临时新增一整行 `f1tv-setup` 定义（不是填写已有字段），路径指向你的私有副本：

   ```ini
   f1tv-setup = type=generic,timeout=15,script-path=/path/to/f1tv-surge-maintenance/src/setup.local.js
   ```

   方式 B 用户可以直接用 `dist/f1tv-main-profile.conf` 末尾注释里的这一行，把 `setup.local.js` 的路径改成实际值。
3. 在 Surge 中运行 `f1tv-setup` 一次。收到"setup 完成"通知后，删除私有 setup 文件，并删除主配置里的临时 `f1tv-setup` 行。

不要把填写后的副本加入版本库或分享。`src/setup.local.js` 已在 `.gitignore` 中，但仍请确认不要把它提交或发送给任何人。

## 从 Chrome 获取会话字段

只在自己的已登录 F1 TV 页面操作，不要把请求导出文件或字段发给任何人：

1. 打开 Chrome DevTools 的 **Network**，勾选 Preserve log，然后重新点击一次视频播放。
2. 过滤 `CONTENT/PLAY`，打开状态为 200 的请求，在 **Headers → Request Headers** 找到 `ascendontoken`、`entitlementtoken`、`sessionid`、`correlationid` 和 `x-f1-device-info`。
3. 只把这些值填入本机私有的 `src/setup.local.js`（由 `src/setup.js` 复制而来），按上面的步骤临时注册并运行一次，之后删除私有文件并移除临时脚本条目。
4. 触发一次全量检测。如果页面曾经把 token 暴露到日志、截图或聊天记录，先退出 F1 TV 并重新登录，再重新取值。

## 触发全量检测

Surge 脚本编辑器的"执行"使用模拟环境，本机实测约 5 秒就可能被编辑器中断。手动全量探测不要在编辑器里跑：

- macOS：双击项目中的 `F1TV-全量检测.command`（或在终端运行 `python3 run_full_probe.py`）。它会启动 Surge 的 `f1tv-probe-cron` 并等待状态库中的最终结果。
- iOS：等待 cron 自动触发（每 8 小时一次），或临时把 `f1tv-probe-manual` 作为普通脚本条目手动运行。

`surge-cli script run` 的命令行控制器在等待 60 秒后会报超时，但 Surge 脚本仍会继续运行；快捷文件通过读取状态库等待最终结果。正式脚本条目的超时为 900 秒。全量检测会串行请求所有候选节点，完成前不要再次启动它。

探测后打开 Surge 菜单栏的 **Panels → F1TVStatus** 查看结果；需要手动重新选择时运行 `f1tv-select`。

## 调整参数

无需修改探测逻辑即可改动模块中各脚本条目的 `argument`：

- `contentIds=主ID|备用ID1|备用ID2`
- `candidateGroup=候选组名`
- `f1tvGroup=最终策略组名`
- `batchSize`（默认 0，表示检测全部候选节点；正整数可限制单次检测数量）
- `intervalMs`、`timeoutSeconds`
- `l3Enabled=true|false`
- `notify=true|false`

默认 `contentIds=1000010385` 来自开发时一次成功播放的观测样例；它可能随服务目录变化，应替换为你账号长期可观看的 VOD ID。

## 状态与隐私

状态使用以下带版本 key：

- `f1tv.auth.v1`：短期会话字段
- `f1tv.config.v1`：运行参数
- `f1tv.nodes.v1`：节点状态、原因、HTTP 状态、延迟和 TTL

状态不会保存 cookie、Authorization 原文或完整签名 manifest URL；Panel 只显示脱敏后的原因和主机级信息。更新会话时重新执行一次写入会话字段的流程即可。

## Fixtures 与验证

`fixtures/` 中的成功播放和 HLS manifest 是从本机 Chrome 的 F1 TV 播放请求提取后脱敏的样例。VPN block 和鉴权过期各有一个明确标记为 `sourceType=synthetic` 的回归样例，它们用于验证 403/401 分类，不能当作真实账号或节点结果。

本地验证：

```bash
python3 -m unittest discover -s tests -p 'test_*.py'
node --check src/probe.js && node --check src/select.js && node --check src/panel.js && node --check src/setup.js
node tests/probe_runtime.test.js
node tests/panel_runtime.test.js
node tests/select_runtime.test.js
```

推送后 GitHub Actions 会自动跑同一组检查（见 `.github/workflows/ci.yml`），并顺带验证配置模板能以两种模式渲染。

## 发布你自己的副本

如果你 fork 或自托管这个项目，让模块指向你自己的脚本：

1. 把仓库推送到 GitHub。
2. 渲染指向你仓库的模块并提交：

   ```bash
   python3 tools/render_config.py --url https://raw.githubusercontent.com/<你的用户名>/f1tv-surge-maintenance/main
   cp dist/f1tv-module.sgmodule config/f1tv-module.sgmodule
   git commit -am "Point module scripts at this fork" && git push
   ```

3. 之后你的用户就可以从 `https://raw.githubusercontent.com/<你的用户名>/f1tv-surge-maintenance/main/config/f1tv-module.sgmodule` 安装模块。

仓库内提交的模板保留 `__SCRIPT_BASE__` 占位符也可以；此时用户 clone 后用 `tools/render_config.py` 本地渲染即可（方式 B）。

## 真实验收清单

- [ ] 一个节点通过 L1 + L2，并在 Panel 显示 PASS。
- [ ] 一个节点出现真实非 PASS 原因（例如 manifest 失败或 playback 403）。
- [ ] 当前节点失效后，`f1tv-select` 切到另一个有效节点。
- [ ] 无 PASS 时保持现有策略，不切到 DIRECT。
- [ ] 账号会话失效时 Panel 显示鉴权过期，并提示更新 `f1tv.auth.v1`。

## 相关官方文档

- Surge JavaScript API：<https://manual.nssurge.com/scripting/api.html>
- Surge 模块：<https://manual.nssurge.com/profile/module.html>
- Surge Panel：<https://manual.nssurge.com/tools/panel.html>
- Surge cron 脚本：<https://manual.nssurge.com/scripting/cron.html>
- Surge 策略组成员导入：<https://manual.nssurge.com/policy-groups/policy-including.html>

使用 F1 TV 时请遵守你所在地区、账户和服务条款。这个项目只负责在已有授权会话下做可用性检测。项目代码以 [MIT License](LICENSE) 发布。
