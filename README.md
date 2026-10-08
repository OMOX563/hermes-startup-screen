# hermes-startup-screen

Hermes 桌面客户端的开机启动动画插件：六幕电影感启动序列，从黑幕标识一路揭幕到应用界面。

适配自 [dsh-startup-screen](https://github.com/6shenhonghong9/dsh-startup-screen)（DeepSeek Harness 客户端启动动画，沈宏宏，MIT），标识换为 Hermes 官方图标，文案全面 Hermes 化，以 Hermes Desktop 磁盘插件形式运行。

## 六幕结构

| 幕 | 内容 |
|---|---|
| 1 | 黑幕 + 图标描边成形（一笔画成再落墨）/ 赫尔墨斯 · HERMES · HERMES DESKTOP |
| 2 | 过曝洗白 → 暖白技术档案底板（角标、栅格、时间戳、分段进度条） |
| 3 | 品牌块落位：HERMES / AGENTIC INTELLIGENCE / DESKTOP APP，页脚 POWERED BY NOUS RESEARCH |
| 4 | 交互式访问授权五步：授予访问权限 → 确认身份 → 建立会话通道 → 读取权限 → 核验通过（真声台词 + 字幕逐字显示） |
| 5 | 权限读取的散点/准星动画 |
| 6 | WELCOME TO / [HERMES DESKTOP] 终幕，青红色散故障后揭幕，滚动锁解除、移交应用 |

全程附带音效（提示音、确认音、步骤音）与英文旁白；素材缺失时自动回落浏览器 TTS，TTS 不可用时动画照常播放（不阻塞）。

## 系统要求

- Hermes Desktop v0.21.x 或兼容的桌面端（依赖磁盘插件机制与 `appearance.extra` / `palette` 贡献区）
- 无需 Node、无需网络：运行时单文件自包含

## 安装

### 第 1 步：拿到 plugin.js

从 [Releases](../../releases) 下载 `plugin.js`，或直接从仓库复制 `plugin.js`（仓库根目录即最终产物，单文件约 457 KB，素材已全部内嵌）。

### 第 2 步：放进插件目录

在 Hermes 桌面端打开 **技能与工具 → 插件** 标签页，点标题栏的 **文件夹图标**（"打开插件目录"）——这会直接打开属于你这台机器的插件根目录，路径因平台/配置而异，以这个按钮打开的为准。

在打开的目录里创建子文件夹并放入文件：

```
<插件根目录>/
└── hermes-startup-screen/
    └── plugin.js
```

插件根目录默认位置（未设置 `HERMES_HOME` 时）：

| 平台 | 默认路径 |
|---|---|
| Windows | `%LOCALAPPDATA%\hermes\desktop-plugins` |
| macOS / Linux | `~/.hermes/desktop-plugins` |

> 若设置了 `HERMES_HOME` 环境变量（或 Windows 注册表中的 HermesHome），插件根为 `<HERMES_HOME>/desktop-plugins`——仍以插件页文件夹按钮打开的路径为准。

### 第 3 步：加载

回到 **技能与工具 → 插件** 页，点标题栏的 **刷新按钮**（重新扫描）。或者直接重启 Hermes。

**加载成功的两个信号**：

1. 右下角弹出 toast：`🚀 启动动画插件已加载 · 设置入口：侧栏「启动动画」`
2. 插件列表出现 **启动动画** 条目（绿色开关默认开启）

> 注意：只修改已存在的 `plugin.js` **不会**触发自动重载（文件监听在首次加载后才建立）。改完文件请到插件页点一次刷新。

## 使用

### 播放时机

默认 `session` 模式：**每个应用会话播放一次**（同一次 Hermes 运行期间不重复打断）。其他模式在设置页里可选：

- `always` — 每次注册都播（热重载也会播）
- `session` — 每应用会话一次（默认）
- `daily` — 每天首次启动播一次

停用/启用：插件页的 **启动动画** 开关。应用重启后生效。

### 跳过

动画期间按 **Esc** 或点右上角 **SKIP** 直接揭幕；授权步骤按 **Enter / Space** 或点按钮推进。

### 立即预览（不等下次启动）

两个入口：

- **侧栏「启动动画」**（播放图标，与"看板"同款的独立页面）→ 页面内的「立即播放」。这是配置主入口：33 项设置全部在这一页。
- **命令面板**：先点一下聊天输入框让它获得焦点，再按 <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>K</kbd>——「启动动画：立即播放」直接播，「启动动画：打开设置」进入上面那页。

### 配置项（侧栏「启动动画」设置页内）

- **播放**：启用开关、播放时机、播放速度（0.35–3×）、是否必须交互、是否允许跳过
- **视觉**：主题（暖白 / 暗色）、强调色、色散双色、噪点/扫描线等装饰开关
- **声音**：总音效音量、音效来源（内嵌素材 / 合成音）、旁白开关、语速、音量、起声延迟
- **文案**：身份名称（授权面板显示的 `ID CONFIRMED : XXX`，默认 `OPERATOR`，可改成你的名字/代号）、品牌三行字、页脚等 14 项文本

改动即时写入插件存储，下次播放生效；「恢复默认」一键回初始值。

## 目录结构（开发者）

```
hermes-startup-screen/
├── plugin.js            # 最终产物（单文件，直接安装用这个）
├── build.py             # 构装脚本：src + 素材 + glyph → plugin.js / preview
├── src/
│   ├── shell.js         # 插件壳：register、贡献区、播放生命周期、设置 UI
│   ├── splash.js        # 六幕运行时（源自原项目，字符串手术 Hermes 化）
│   ├── splash.css       # 全部动画样式（选择器改名注入）
│   ├── glyph.txt        # Hermes 图标 path 数据
│   └── assets/*.mp3     # 台词与音效素材
├── preview/index.html   # 离线预览页（mock 界面 + 重播/跳过按钮）
└── test/smoke.mjs       # 冒烟测试：配置边界 / 播放门控 / 注册结构
```

重建与验证：

```bash
python build.py        # 字符串手术逐条 assert，语法错误不写产物
node test/smoke.mjs    # 需要 Node 18+
```

预览：直接用浏览器打开 `preview/index.html`（构建时自动生成），走完整六幕。

## 隐私说明

- 单文件自包含，**不发起任何网络请求**：音频/图标/样式全部以 data URI 内嵌
- 语音旁白使用浏览器本地 `speechSynthesis`，素材音为本地解码播放；不上传任何数据
- 配置存于 Hermes 桌面端本地存储，不落盘到仓库或云端

## 致谢

- [dsh-startup-screen](https://github.com/6shenhonghong9/dsh-startup-screen) — 启动动画的创意与实现基础，音频台词素材，© 2026 沈宏宏，MIT
- Hermes 桌面插件 SDK — 贡献区、磁盘插件加载与开发文档
- Hermes 图标版权归 [Nous Research](https://nousresearch.com) 所有，此处仅作为启动画面中的产品标识使用

## License

[MIT](./LICENSE)（含原项目版权声明）
