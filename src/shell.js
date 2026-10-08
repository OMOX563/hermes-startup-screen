/**
 * hermes-startup-screen — Hermes 桌面端启动动画插件
 * ============================================================================
 * 适配自 dsh-startup-screen（DeepSeek Harness 启动动画，MIT © 沈宏宏）。
 * 六幕开机动画：黑幕标识 → 过曝洗白 → 暖白技术档案底板 → 五步交互式访问
 * 授权 → 色散故障揭幕。原版经由 index.html 注入；本适配改走桌面插件 SDK：
 * register() 时同步注入样式与黑幕根节点，运行时封装为 runSplash() 函数。
 *
 * 音频素材（五句真声台词 + 终幕 + 界面音效）以 base64 内嵌——桌面插件
 * 是单文件加载，没有 HTTP 路由可用；素材缺失时自动回落 Web Speech TTS /
 * WebAudio 合成，功能不依赖素材。
 *
 * 本文件由 build.py 从 src/ 组装生成，改 src/ 后重新运行 build.py。
 */

import {
  host,
  haptic,
  APPEARANCE_AREAS,
  PALETTE_AREA,
  ROUTES_AREA,
  SIDEBAR_NAV_AREA,
  ToggleRow,
  ListRow,
  SegmentedControl,
  Input,
  Button
} from '@hermes/plugin-sdk'
import { jsx, jsxs } from 'react/jsx-runtime'
import { useState } from 'react'

const ID = 'hermes-startup-screen'
const ROOT_ID = 'hermes-startup-root'
const STYLE_ID = 'hermes-startup-screen-style'
const STORAGE_KEY = 'config'
/** 与运行时 finish() 写入的键保持一致（build 校验）。 */
const SHOWN_KEY = 'hermes-startup-screen:shown'
const DAY_KEY = 'hermes-startup-screen:day'

/* ── 配置模型（DEFAULTS 由构建脚本从运行时源码提取，保证单一来源）───────── */
/*@DEFAULTS_AND_NORMALIZE@*/

/* ── 内嵌资源 ───────────────────────────────────────────────────────────── */
const SPLASH_CSS = /*@SPLASH_CSS@*/
const ASSET_URIS = /*@ASSET_URIS@*/
const GLYPH_D = /*@GLYPH_D@*/

/* ── 启动动画运行时（由构建脚本从 src/splash.js 改造注入）───────────────── */
/*@RUN_SPLASH@*/

/* ── 配置读写 ───────────────────────────────────────────────────────────── */

function readCfg(ctx) {
  try {
    return normalize(ctx.storage.get(STORAGE_KEY, null))
  } catch (e) {
    return normalize(null)
  }
}

function writeCfg(ctx, next) {
  const cfg = normalize(next)
  try {
    ctx.storage.set(STORAGE_KEY, cfg)
  } catch (e) {
    /* storage 不可用时配置仅存活于本窗口 */
  }
  return cfg
}

/* ── 播放控制 ───────────────────────────────────────────────────────────── */

let gCtx = null
let styleInjected = false

/** 注入样式：完整 splash.css + 首屏黑幕关键规则（与原版 CRITICAL_CSS 等价）。 */
function injectStyle() {
  if (document.getElementById(STYLE_ID)) return
  const el = document.createElement('style')
  el.id = STYLE_ID
  el.textContent =
    'html.dsu-lock,html.dsu-lock body{overflow:hidden!important}' +
    '#' + ROOT_ID + '.dsu-boot{position:fixed;inset:0;z-index:2147483000;background:#000}' +
    SPLASH_CSS
  document.head.appendChild(el)
  styleInjected = true
}

/** 素材取回：base64 data URI 表 → fetch；缺失即 reject，调用方 .catch 自然回落。 */
function fetchAsset(name) {
  const u = ASSET_URIS[name]
  if (!u) return Promise.reject(new Error('missing asset: ' + name))
  return fetch(u)
}

/** 本次是否该播——判定与原版 BOOTSTRAP_JS 语义一致。 */
function shouldPlay(cfg) {
  if (!cfg.enabled) return false
  try {
    if (cfg.mode === 'session' && window.sessionStorage.getItem(SHOWN_KEY) === '1') return false
    if (cfg.mode === 'daily' && window.localStorage.getItem(DAY_KEY) === new Date().toISOString().slice(0, 10)) return false
  } catch (e) {
    /* 隐私模式下读不到就按可播处理 */
  }
  return true
}

/**
 * 播放一次启动动画。force=true 无视 mode 门控（设置页预览 / palette 命令）。
 * 时序对齐原版 Host 注入：关键样式 + 黑幕根节点先行（同步），运行时随后
 * 复用该根节点填充 DOM 并揭幕。
 */
function play(ctx, force) {
  const cfg = readCfg(ctx)
  if (!force && !shouldPlay(cfg)) return false

  stopInternal(false)

  window.__DSH_STARTUP__ = cfg
  window.__DSH_STARTUP_LOADED__ = false
  window.__DSH_STARTUP_SKIP__ = false

  injectStyle()

  let root = document.getElementById(ROOT_ID)
  if (!root) {
    root = document.createElement('div')
    root.id = ROOT_ID
    root.className = 'dsu-root dsu-boot'
    document.body.appendChild(root)
  } else {
    root.classList.add('dsu-boot')
  }
  document.documentElement.classList.add('dsu-lock')
  document.documentElement.style.overflow = 'hidden'

  /* 运行时 API.replay 的桥：把「配置改动后重播」转给插件的完整生命周期。 */
  window.__HS_REPLAY__ = function () {
    if (gCtx) replay(gCtx)
  }

  try {
    runSplash()
  } catch (err) {
    console.error('[hermes-startup-screen] 动画启动失败：', err)
    teardown()
    host.notify({ kind: 'error', message: '启动动画加载失败，已跳过本次播放' })
    return false
  }

  /* 兜底：运行时若没能在 12 秒内接管（自身 9 秒兕底 + 余量），无条件放行，
     绝不把用户锁在黑幕里。 */
  window.setTimeout(function () {
    try {
      const r = document.getElementById(ROOT_ID)
      if (r && r.classList.contains('dsu-boot')) teardown()
    } catch (e) { /* noop */ }
  }, 12000)

  return true
}

/** 立即停止当前动画并清理其 DOM（不清样式）。 */
function stopInternal(removeStyle) {
  try {
    const api = window.__DSH_STARTUP_API__
    if (api && typeof api.finish === 'function') api.finish()
  } catch (e) { /* noop */ }
  const old = document.getElementById(ROOT_ID)
  if (old && old.parentNode) old.parentNode.removeChild(old)
  document.documentElement.classList.remove('dsu-lock')
  document.documentElement.style.overflow = ''
  if (document.body) document.body.style.overflow = ''
  if (removeStyle) {
    const st = document.getElementById(STYLE_ID)
    if (st && st.parentNode) st.parentNode.removeChild(st)
    styleInjected = false
  }
}

/** 全量清理：插件卸载 / 禁用时调用。 */
function teardown() {
  stopInternal(true)
}

/** 强制重播（palette 命令 / 设置页预览）。 */
function replay(ctx) {
  return play(ctx, true)
}

/* ── 设置卡片（Settings → Appearance 页尾） ─────────────────────────────── */

const GROUP_LABEL = {
  fontSize: '11px',
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--ui-text-tertiary)',
  marginTop: '18px',
  marginBottom: '2px'
}

const ROW_HINT = {
  fontSize: '11px',
  lineHeight: 1.55,
  color: 'var(--ui-text-quaternary)'
}

const RANGE_WRAP = { display: 'flex', alignItems: 'center', gap: '10px', width: '100%' }
const RANGE_INPUT = { flex: 1, accentColor: 'var(--ui-accent)' }
const RANGE_VAL = {
  fontFamily: 'ui-monospace, Consolas, monospace',
  fontSize: '11px',
  color: 'var(--ui-text-tertiary)',
  minWidth: '42px',
  textAlign: 'right'
}
const COLOR_INPUT = {
  width: '46px',
  height: '26px',
  padding: 0,
  border: '1px solid var(--ui-stroke-secondary)',
  borderRadius: '6px',
  background: 'transparent',
  cursor: 'pointer'
}
const TEXT_INPUT = { width: '100%', maxWidth: '360px' }

function RangeRow({ label, hint, min, max, step, value, onChange, fmt }) {
  return jsx(ListRow, {
    title: label,
    description: hint ? jsx('span', { style: ROW_HINT, children: hint }) : undefined,
    action: jsx('div', { style: RANGE_WRAP, children: [
      jsx('input', {
        type: 'range',
        min: min,
        max: max,
        step: step,
        value: value,
        style: RANGE_INPUT,
        onInput: e => onChange(Number(e.target.value))
      }),
      jsx('span', { style: RANGE_VAL, children: fmt ? fmt(value) : String(value) })
    ] })
  })
}

function TextRow({ label, hint, value, mono, onChange }) {
  return jsx(ListRow, {
    title: label,
    description: hint ? jsx('span', { style: ROW_HINT, children: hint }) : undefined,
    action: jsx(Input, {
      value: value == null ? '' : String(value),
      maxLength: 64,
      style: TEXT_INPUT,
      className: mono ? 'font-mono text-xs' : undefined,
      onChange: e => onChange(e.target.value)
    })
  })
}

function ColorRow({ label, hint, value, onChange }) {
  return jsx(ListRow, {
    title: label,
    description: hint ? jsx('span', { style: ROW_HINT, children: hint }) : undefined,
    action: jsx('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' }, children: [
      jsx('input', {
        type: 'color',
        value: value,
        style: COLOR_INPUT,
        onInput: e => onChange(e.target.value)
      }),
      jsx('span', { style: RANGE_VAL, children: value })
    ] })
  })
}

function Group({ title, children }) {
  return jsxs('div', { children: [
    jsx('div', { style: GROUP_LABEL, children: title }),
    jsx('div', { style: { display: 'flex', flexDirection: 'column' }, children: children })
  ] })
}

/* ── 独立设置页（路由 /startup-animation，侧栏入口直达）──────────────────
   官方 APPEARANCE_AREAS.extra 的挂载条件 subpage === undefined 在当前构建
   不可达（resolveSettingsSubpage 恒返回子页 id），故配置面板改走 ROUTES_AREA。 */
function SettingsPage() {
  return jsxs('div', { style: { padding: '20px 24px 32px', maxWidth: 720 }, children: [
    jsxs('div', { style: { marginBottom: 16 }, children: [
      jsx('h1', { style: { fontSize: 18, fontWeight: 650, margin: '0 0 4px' }, children: '启动动画' }),
      jsx('p', { style: { fontSize: 12.5, opacity: 0.65, margin: 0 }, children: '六幕开机序列：黑幕标识 → 过曝洗白 → 档案底板 → 五步授权 → 色散揭幕。' })
    ] }),
    jsx(AppearanceCard, {})
  ] })
}

function AppearanceCard() {
  const [cfg, setCfg] = useState(() => (gCtx ? readCfg(gCtx) : normalize(null)))
  const [playing, setPlaying] = useState(false)

  if (!gCtx) return null

  function set(key, value) {
    const next = writeCfg(gCtx, { ...cfg, [key]: value })
    setCfg(next)
  }

  function preview() {
    haptic('tap')
    setPlaying(true)
    const ok = replay(gCtx)
    if (!ok) setPlaying(false)
    window.setTimeout(() => setPlaying(false), 1200)
  }

  function reset() {
    haptic('tap')
    const next = writeCfg(gCtx, { ...DEFAULTS })
    setCfg(next)
  }

  const modeOptions = [
    { id: 'always', label: '总是' },
    { id: 'session', label: '每次启动' },
    { id: 'daily', label: '每天' }
  ]

  return jsxs('div', {
    style: { display: 'flex', flexDirection: 'column', paddingTop: '10px' },
    children: [
      /* 页头：标题 + 版本 + 动作 */
      jsxs('div', {
        style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' },
        children: [
          jsxs('div', { style: { display: 'flex', flexDirection: 'column', gap: '2px' }, children: [
            jsx('div', { style: { fontSize: '14px', fontWeight: 600, color: 'var(--ui-text-primary)' }, children: '启动动画' }),
            jsx('div', {
              style: { fontSize: '11px', color: 'var(--ui-text-quaternary)' },
              children: '开机六幕：黑幕标识 → 过曝洗白 → 档案底板 → 五步授权 → 揭幕'
            })
          ] }),
          jsxs('div', { style: { display: 'flex', gap: '8px' }, children: [
            jsx(Button, {
              size: 'sm',
              disabled: playing,
              onClick: preview,
              children: playing ? '播放中…' : '立即播放'
            }),
            jsx(Button, {
              variant: 'outline',
              size: 'sm',
              onClick: reset,
              children: '恢复默认'
            })
          ] })
        ]
      }),

      /* ── 播放 ── */
      jsx(Group, {
        title: '播放',
        children: [
          jsx(ToggleRow, {
            label: '启用',
            description: '关闭后完全不播启动动画（设置与命令仍可用）',
            checked: cfg.enabled,
            onChange: v => set('enabled', v)
          }),
          jsx(ListRow, {
            title: '显示模式',
            description: jsx('span', { style: ROW_HINT, children: '总是=每次进应用 / 每次启动=每会话一次 / 每天=每日首次' }),
            action: jsx(SegmentedControl, { options: modeOptions, value: cfg.mode, onChange: v => set('mode', v) })
          }),
          jsx(ListRow, {
            title: '主题',
            action: jsx(SegmentedControl, {
              options: [{ id: 'light', label: '暖白' }, { id: 'dark', label: '暗色' }],
              value: cfg.theme,
              onChange: v => set('theme', v)
            })
          }),
          jsx(RangeRow, {
            label: '速度',
            hint: '整段动画的快慢',
            min: 0.35, max: 3, step: 0.05,
            value: cfg.speed,
            fmt: v => v.toFixed(2) + '×',
            onChange: v => set('speed', v)
          }),
          jsx(ToggleRow, {
            label: '要求确认',
            description: '第 1、2 步等待你点按钮或按 Enter 才继续',
            checked: cfg.requireInteraction,
            onChange: v => set('requireInteraction', v)
          }),
          jsx(ToggleRow, {
            label: '允许跳过',
            description: '显示右上角 SKIP 按钮，并响应 Esc',
            checked: cfg.allowSkip,
            onChange: v => set('allowSkip', v)
          })
        ]
      }),

      /* ── 身份资料 ── */
      jsx(Group, {
        title: '身份资料',
        children: [
          jsx(TextRow, {
            label: '身份名称',
            hint: '终幕「欢迎 xxx 访问」里的名字',
            value: cfg.identity,
            onChange: v => set('identity', v)
          }),
          jsx(TextRow, {
            label: '身份编号',
            hint: '第二步身份卡上的编号，留空则从名称提取',
            value: cfg.identityId,
            mono: true,
            onChange: v => set('identityId', v)
          }),
          jsx(TextRow, {
            label: '权限等级',
            hint: '身份卡上的权限等级',
            value: cfg.accessLevel,
            mono: true,
            onChange: v => set('accessLevel', v)
          })
        ]
      }),

      /* ── 语音 ── */
      jsx(Group, {
        title: '语音',
        children: [
          jsx(ToggleRow, {
            label: '语音播报',
            description: '念出五句授权台词（素材缺失时自动回落系统 TTS）',
            checked: cfg.voice,
            onChange: v => set('voice', v)
          }),
          jsx(ListRow, {
            title: '语音来源',
            action: jsx(SegmentedControl, {
              options: [{ id: 'asset', label: '真声素材' }, { id: 'tts', label: '系统 TTS' }],
              value: cfg.voiceSource,
              onChange: v => set('voiceSource', v)
            })
          }),
          jsx(ListRow, {
            title: '语言',
            description: jsx('span', { style: ROW_HINT, children: '仅影响 TTS 回落时念什么' }),
            action: jsx(SegmentedControl, {
              options: [{ id: 'en', label: '英文' }, { id: 'zh', label: '中文' }, { id: 'both', label: '双语' }],
              value: cfg.voiceLang,
              onChange: v => set('voiceLang', v)
            })
          }),
          jsx(ToggleRow, {
            label: '播报前提示音',
            description: '念台词前先响两声轻提示，更像系统播报',
            checked: cfg.voiceCue,
            onChange: v => set('voiceCue', v)
          }),
          jsx(RangeRow, {
            label: '语速',
            min: 0.5, max: 2, step: 0.01,
            value: cfg.voiceRate,
            fmt: v => v.toFixed(2),
            onChange: v => set('voiceRate', v)
          }),
          jsx(RangeRow, {
            label: '音调',
            hint: '压低更沉稳；1.0 以上像客服播报',
            min: 0, max: 2, step: 0.01,
            value: cfg.voicePitch,
            fmt: v => v.toFixed(2),
            onChange: v => set('voicePitch', v)
          }),
          jsx(RangeRow, {
            label: '语音音量',
            min: 0, max: 1, step: 0.01,
            value: cfg.voiceVolume,
            fmt: v => Math.round(v * 100) + '%',
            onChange: v => set('voiceVolume', v)
          }),
          jsx(RangeRow, {
            label: '开口前留白',
            hint: '提示音响过之后停多久再开口',
            min: 0, max: 1200, step: 20,
            value: cfg.voiceLead,
            fmt: v => v + ' ms',
            onChange: v => set('voiceLead', v)
          })
        ]
      }),

      /* ── 界面音效 ── */
      jsx(Group, {
        title: '界面音效',
        children: [
          jsx(ToggleRow, {
            label: '界面音效',
            description: '文字出现、阶段推进、按钮确认的「哒」声',
            checked: cfg.sound,
            onChange: v => set('sound', v)
          }),
          jsx(RangeRow, {
            label: '音效音量',
            hint: '不影响台词语音',
            min: 0, max: 1, step: 0.01,
            value: cfg.soundVolume,
            fmt: v => Math.round(v * 100) + '%',
            onChange: v => set('soundVolume', v)
          }),
          jsx(ListRow, {
            title: '音效来源',
            action: jsx(SegmentedControl, {
              options: [{ id: 'audio', label: '内置素材' }, { id: 'synth', label: '现场合成' }],
              value: cfg.sfx,
              onChange: v => set('sfx', v)
            })
          })
        ]
      }),

      /* ── 视觉 ── */
      jsx(Group, {
        title: '视觉',
        children: [
          jsx(ColorRow, {
            label: '强调色',
            hint: '阶段条、进度条、准星的主题色',
            value: cfg.accent,
            onChange: v => set('accent', v)
          }),
          jsx(ColorRow, {
            label: '故障色 A',
            hint: '揭幕色散故障的红',
            value: cfg.glitchA,
            onChange: v => set('glitchA', v)
          }),
          jsx(ColorRow, {
            label: '故障色 B',
            hint: '揭幕色散故障的蓝',
            value: cfg.glitchB,
            onChange: v => set('glitchB', v)
          })
        ]
      }),

      /* ── 文案 ── */
      jsx(Group, {
        title: '文案',
        children: [
          jsx(TextRow, { label: '品牌行 1', value: cfg.brand1, onChange: v => set('brand1', v) }),
          jsx(TextRow, { label: '品牌行 2', value: cfg.brand2, onChange: v => set('brand2', v) }),
          jsx(TextRow, { label: '品牌行 3（左段）', value: cfg.brand3a, onChange: v => set('brand3a', v) }),
          jsx(TextRow, { label: '品牌行 3（右段）', value: cfg.brand3b, onChange: v => set('brand3b', v) }),
          jsx(TextRow, { label: '黑幕中文行', value: cfg.orgZh, onChange: v => set('orgZh', v) }),
          jsx(TextRow, { label: '黑幕英文行', value: cfg.orgEn, onChange: v => set('orgEn', v) }),
          jsx(TextRow, { label: '黑幕副行', value: cfg.orgSub, onChange: v => set('orgSub', v) }),
          jsx(TextRow, { label: '终幕方框', hint: '揭幕中央黑底白字框', value: cfg.welcomeBox, onChange: v => set('welcomeBox', v) }),
          jsx(TextRow, { label: '页脚', value: cfg.footer, onChange: v => set('footer', v) })
        ]
      })
    ]
  })
}

/* ── 插件入口 ───────────────────────────────────────────────────────────── */

export default {
  id: ID,
  name: '启动动画',
  description: '开机六幕启动动画：黑幕标识 → 过曝洗白 → 档案底板 → 五步授权 → 揭幕。',
  register(ctx) {
    /* 加载自报家门：toast 出现 = 插件已成功加载并注册（验证信号 + 指路） */
    host.notify({ kind: 'info', message: '🚀 启动动画插件已加载 · 设置入口：侧栏「启动动画」' })
    gCtx = ctx

    /* 设置卡片：Settings → Appearance 页尾 */
    ctx.register({
      id: 'appearance',
      area: APPEARANCE_AREAS.extra,
      render: () => jsx(AppearanceCard, {})
    })

    /* 设置页：独立路由整页（appearance.extra 在本构建不可达，改走这里） */
    ctx.register({
      id: 'page',
      area: ROUTES_AREA,
      data: { path: '/startup-animation', title: '启动动画' },
      render: () => jsx(SettingsPage, {})
    })

    /* 侧栏入口：与路由页配对（同 kanban 的官方范式） */
    ctx.register({
      id: 'nav',
      area: SIDEBAR_NAV_AREA,
      order: 60,
      data: { codicon: 'play', label: '启动动画', path: '/startup-animation' }
    })

    /* ⌘K 命令：打开设置 */
    ctx.register({
      id: 'open-settings',
      area: PALETTE_AREA,
      data: {
        id: 'startup-screen.settings',
        label: '启动动画：打开设置',
        keywords: ['启动', '动画', '设置', 'startup', 'settings', 'splash'],
        run: () => host.navigate('/startup-animation')
      }
    })

    /* ⌘K 命令：立即播放 */
    ctx.register({
      id: 'replay',
      area: PALETTE_AREA,
      data: {
        id: 'startup-screen.replay',
        label: '启动动画：立即播放',
        keywords: ['启动', '动画', '开屏', 'splash', 'startup', 'boot'],
        run: () => {
          if (!replay(gCtx)) {
            host.notify({ kind: 'info', message: '启动动画当前为停用状态（设置里可开启）' })
          }
        }
      }
    })

    /* 冷启动播放：register 同步执行，黑幕先于应用内容可见 */
    try {
      play(ctx, false)
    } catch (err) {
      console.error('[hermes-startup-screen] 启动播放异常：', err)
    }

    ctx.onDispose(() => {
      try {
        teardown()
      } catch (e) { /* noop */ }
      gCtx = null
    })
  }
}
