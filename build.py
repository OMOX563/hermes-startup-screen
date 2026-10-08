# -*- coding: utf-8 -*-
"""
hermes-startup-screen 构装脚本
============================================================================
src/shell.js（插件壳，占位符）+ src/splash.css + src/splash.js（改造为
runSplash 函数）+ src/assets/*.mp3（base64）+ 官方 glyph → plugin.js。

每处字符串手术都 assert 命中次数——任何一处失配立即报错，绝不静默产出。
用法：python build.py
"""
import base64
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'src')
OUT = os.path.join(HERE, 'plugin.js')

GLYPH_VIEWBOX = '182.1875888671875 150.036837890625 4951.215650390624 5337.024662109375'


def fail(msg):
    print('BUILD FAILED: ' + msg, file=sys.stderr)
    sys.exit(1)


def sub(text, old, new, count, label):
    """替换并断言精确命中 count 次。"""
    n = text.count(old)
    if n != count:
        fail('%s: expected %d occurrence(s), found %d\n  needle: %r' % (label, count, n, old[:120]))
    return text.replace(old, new)


def read(name):
    with open(os.path.join(SRC, name), encoding='utf-8') as f:
        return f.read()


# ── 1. 配置模型：从 splash.js 提取 DEFAULTS，从 index.js 逻辑移植 normalize ──

splash = read('splash.js')

m = re.search(r'var DEFAULTS = \{.*?\n  \}', splash, re.S)
if not m:
    fail('DEFAULTS block not found in splash.js')
defaults_block_original = m.group(0)
defaults_block = m.group(0)

# 身份编号：构建时随机生成 16 位十六进制哈希（每次重建都会换）
import secrets as _secrets
_RID = _secrets.token_hex(8)

# 品牌适配：DeepSeek → Hermes（逐条 assert 1 次）
branding = [
    ("identity: 'JOYCE MOORE',", "identity: 'OMOX',"),
    ("accessLevel: '3',", "accessLevel: '0',"),
    ("identityId: '0087',", "identityId: '%s'," % _RID),
    ("brand1: 'DEEPSEEK',", "brand1: 'HERMES',"),
    ("brand2: 'SYNTHESIZE INTELLIGENCE',", "brand2: 'AGENTIC INTELLIGENCE',"),
    ("brand3a: 'HARNESS',", "brand3a: 'DESKTOP',"),
    ("brand3b: 'OS',", "brand3b: 'APP',"),
    ("orgZh: '深度求索',", "orgZh: '赫尔墨斯',"),
    ("orgEn: 'DEEPSEEK',", "orgEn: 'HERMES',"),
    ("orgSub: 'DEEPSEEK HARNESS',", "orgSub: 'HERMES DESKTOP',"),
    ("welcomeBox: 'DEEPSEEK HARNESS',", "welcomeBox: 'HERMES DESKTOP',"),
    ("footer: 'POWERED BY DEEPSEEK',", "footer: 'POWERED BY NOUS RESEARCH',"),
]
for old, new in branding:
    defaults_block = sub(defaults_block, old, new, 1, 'branding: ' + old)

defaults_const = 'const ' + defaults_block[len('var '):]

# normalize 所需的键表 + 校验函数（与原 Host 侧 lib/index.js 语义一致）
keys_and_normalize = '''
const TEXT_KEYS = [
  'identity', 'identityId', 'accessLevel',
  'brand1', 'brand2', 'brand3a', 'brand3b',
  'orgZh', 'orgEn', 'orgSub', 'welcomeBox', 'footer', 'voiceName'
]
const COLOR_KEYS = ['accent', 'glitchA', 'glitchB']
const ENUMS = {
  mode: ['always', 'session', 'daily'],
  theme: ['light', 'dark'],
  voiceLang: ['en', 'zh', 'both'],
  sfx: ['audio', 'synth'],
  voiceSource: ['asset', 'tts']
}
const BOOL_KEYS = ['enabled', 'requireInteraction', 'allowSkip', 'sound', 'voice', 'voiceCue']
const RANGES = {
  speed: [0.35, 3],
  soundVolume: [0, 1],
  voiceRate: [0.5, 2],
  voiceLead: [0, 1200],
  voicePitch: [0, 2],
  voiceVolume: [0, 1]
}

function normalize(input) {
  const out = { ...DEFAULTS }
  const src = input && typeof input === 'object' ? input : {}
  for (const key of Object.keys(DEFAULTS)) {
    if (!(key in src) || src[key] === undefined || src[key] === null) continue
    const value = src[key]
    if (BOOL_KEYS.includes(key)) {
      out[key] = value === true || value === 'true' || value === 1 || value === '1'
    } else if (ENUMS[key]) {
      out[key] = ENUMS[key].includes(value) ? value : DEFAULTS[key]
    } else if (key === 'speed' || RANGES[key]) {
      const [lo, hi] = RANGES[key] || RANGES.speed
      const n = Number(value)
      out[key] = Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : DEFAULTS[key]
    } else if (COLOR_KEYS.includes(key)) {
      const s = String(value).trim()
      out[key] = /^#[0-9a-fA-F]{3,8}$/.test(s) ? s : DEFAULTS[key]
    } else if (TEXT_KEYS.includes(key)) {
      out[key] = String(value).slice(0, 64)
    } else {
      out[key] = value
    }
  }
  if (!String(out.identity).trim()) out.identity = DEFAULTS.identity
  if (!String(out.identityId).trim()) {
    out.identityId = String(out.identity).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12)
  }
  if (!String(out.identityId).trim()) out.identityId = 'OPERATOR'
  return out
}
'''.strip('\n')

defaults_and_normalize = defaults_const + '\n\n' + keys_and_normalize

# ── 2. splash.js → runSplash() 函数（逐条手术）────────────────────────────

s = splash

# 2.1 头部：IIFE → 函数声明；ROOT_ID 用模块级常量
s = sub(s, "(function () {\n  'use strict'", "function runSplash() {\n  'use strict'", 1, 'iife-head')
s = sub(s, "\n  var ROOT_ID = 'dsh-startup-root'", '', 1, 'root-id-line')

# 2.2 WHALE_PATH → 模块级 glyph（多行拼接整体替换；Z' 仅出现在整体结尾）
s = re.sub(r"var WHALE_PATH =[\s\S]*?Z'", 'var WHALE_PATH = GLYPH_D /* Hermes 官方图标路径，见模块级常量 */', s, count=1)
if 'var WHALE_PATH = GLYPH_D' not in s:
    fail('whale path replacement did not apply')

# 2.3 glyph viewBox + 描边线宽等比换算（1.1/50 → 109/4951，视觉 1.85px @84px 不变）
s = sub(s, "svg.setAttribute('viewBox', '0 0 50 50')",
        "svg.setAttribute('viewBox', '" + GLYPH_VIEWBOX + "')", 1, 'viewbox')
s = sub(s, "path.style.strokeWidth = '1.1'", "path.style.strokeWidth = '109'", 1, 'stroke-width')

# 2.4 音频：HTTP 路由 → 模块级 data URI 表
s = sub(s, "fetch('/dsh-startup/asset/' + name + '.mp3')", 'fetchAsset(name)', 2, 'asset-fetch')

# 2.5 持久化键 / 事件名 / 日志前缀 → hermes 命名
s = sub(s, "'dsh-startup-screen:shown'", "'hermes-startup-screen:shown'", 1, 'key-shown')
s = sub(s, "'dsh-startup-screen:day'", "'hermes-startup-screen:day'", 1, 'key-day')
s = sub(s, "'dsh-startup:done'", "'hermes-startup:done'", 1, 'evt-done')
s = sub(s, "'[dsh-startup-screen] 动画异常，直接揭幕：'", "'[hermes-startup-screen] 动画异常，直接揭幕：'", 1, 'warn-prefix')

# 2.6 品牌文案（运行时内嵌字面量）
s = sub(s, "'D E E P S E E K  ·  H A R N E S S'", "'H E R M E S  ·  D E S K T O P'", 1, 'w3-label')
s = sub(s, "'D E E P S E E K'", "'H E R M E S'", 1, 'logo-label')
s = sub(s, "'REV 0.1.0 · WEB PROFILE'", "'REV 1.0.0 · HERMES DESKTOP'", 1, 'rev-meta')

# 2.7 DEFAULTS 块移出（模块级单一来源），runSplash 引用模块常量
s = sub(s, defaults_block_original, '', 1, 'defaults-block removal')

# 2.8 injectSelf → 桥接插件生命周期（原实现依赖 script 标签重注入，插件环境无此通道）
old_inject = '''  function injectSelf() {
    window.__DSH_STARTUP_LOADED__ = false
    var old = document.getElementById(ROOT_ID)
    if (old && old.parentNode) old.parentNode.removeChild(old)
    window.__DSH_STARTUP_SKIP__ = false
    var s = document.createElement('script')
    /* 正式运行时由 Host 路由提供（加时间戳绕开缓存）；
       离线预览页会把相对路径写进 __DSH_STARTUP_SCRIPT_URL__，file:// 下不加查询串。 */
    if (window.__DSH_STARTUP_SCRIPT_URL__) {
      s.src = window.__DSH_STARTUP_SCRIPT_URL__
    } else {
      s.src = '/dsh-startup/splash.js?t=' + Date.now()
    }
    document.head.appendChild(s)
  }'''
new_inject = '''  function injectSelf() {
    /* Hermes 适配：重播交回插件壳的完整生命周期（清旧 DOM/监听 → 重新判定）。 */
    if (typeof window.__HS_REPLAY__ === 'function') window.__HS_REPLAY__()
  }'''
s = sub(s, old_inject, new_inject, 1, 'injectSelf')

# 2.9 Esc 监听句柄化：finish 时摘除，避免热重载重播后 document 监听累积
s = sub(s, '  var timers = []', '  var timers = []\n  var escHandler = null', 1, 'esc-decl')
s = sub(s, '''    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') requestSkip()
    })''', """    escHandler = function (e) { if (e.key === 'Escape') requestSkip() }
    document.addEventListener('keydown', escHandler)""",
        1, 'esc-listen')
s = sub(s, '''    releaseAll()
    stopHex()
    voice.stop()''', '''    releaseAll()
    stopHex()
    voice.stop()
    if (escHandler) {
      document.removeEventListener('keydown', escHandler)
      escHandler = null
    }''', 1, 'esc-cleanup')

# 2.10 尾部：IIFE 收口 → 函数收口
s = sub(s, '''  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { run() })
  } else {
    run()
  }
})()''', '''  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { run() })
  } else {
    run()
  }
}''', 1, 'iife-tail')

# 2.11 头注释更新
s = sub(s, ' * dsh-startup-screen — 启动动画运行时（浏览器端，零依赖）',
        ' * hermes-startup-screen — 启动动画运行时（适配自 dsh-startup-screen，零依赖）', 1, 'header-comment')

# 2.11b 注释与文档行里的原品牌字样 → Hermes 语境
s = sub(s, ' *   第一幕  黑幕 + DeepSeek 鲸鱼标识／"深度求索"／"DEEPSEEK"（字距收紧 + 扫光）',
        ' *   第一幕  黑幕 + Hermes 标识／"赫尔墨斯"／"HERMES"（字距收紧 + 扫光）', 1, 'comment-act1')
s = sub(s, ' *   终幕    WELCOME TO / [DEEPSEEK HARNESS] / 鲸鱼标识，青红色散故障后揭幕',
        ' *   终幕    WELCOME TO / [HERMES DESKTOP] / 标识，青红色散故障后揭幕', 1, 'comment-finale')
s = sub(s, '  /* ── DeepSeek 官方鲸鱼标识（取自 DSH 自带 favicon.svg 的路径数据）──────── */',
        '  /* ── Hermes 官方标识（取自 Hermes 桌面端 favicon.svg 的路径数据）──────── */', 1, 'comment-glyph')
s = sub(s, '    /* 从 /dsh-startup/asset/ 拉真素材（用户音频里抠出来的"哒"）并解码缓存；',
        '    /* 从模块级 data URI 表取真素材（用户音频里抠出来的"哒"）并解码缓存；', 1, 'comment-asset')
s = sub(s, '      /* 第一幕：黑幕 --> DeepSeek 标识 */',
        '      /* 第一幕：黑幕 --> Hermes 标识 */', 1, 'comment-run1')

# 2.12 残留清点：品牌与 dsh 命名必须归零（__DSH_STARTUP_* 内部协议名除外；
#      头部出处署名"适配自 dsh-startup-screen"是刻意保留的溯源，逐行放行）
for line in s.split('\n'):
    if '适配自 dsh-startup-screen' in line:
        continue
    for token in ['DEEPSEEK', 'DeepSeek', '深度求索', 'SYNTHESIZE', 'JOYCE', 'dsh-startup',
                  'HARNESS OS', 'POWERED BY DEEPSEEK', '/dsh-startup/']:
        if token in line:
            fail('runtime residual token: %s\n  line: %s' % (token, line.strip()[:140]))

run_splash = s.rstrip() + '\n'

# ── 3. splash.css → JS 字符串 + 选择器改名 ────────────────────────────────

css = read('splash.css')
css = sub(css, '#dsh-startup-root', '#hermes-startup-root', 16, 'css-root-selector')
css = sub(css, '* dsh-startup-screen — 启动界面 / 启动动画样式',
          '* hermes-startup-screen — 启动界面 / 启动动画样式', 1, 'css-header')
css = sub(css, '/* ── 第一幕：黑幕 + DeepSeek 标识 ─────────────────────────────────────── */',
          '/* ── 第一幕：黑幕 + Hermes 标识 ──────────────────────────────────────── */', 1, 'css-act1')
for token in ['DEEPSEEK', 'DeepSeek', 'dsh-startup']:
    if token in css:
        fail('css residual token: %s' % token)
splash_css_literal = json.dumps(css)

# ── 4. 音频素材 → base64 data URI 表 ──────────────────────────────────────

ASSETS = ['line-1', 'line-2', 'line-3', 'line-4', 'line-5', 'line-6', 'sfx-tick', 'sfx-ticks-run']
uris = {}
for name in ASSETS:
    path = os.path.join(SRC, 'assets', name + '.mp3')
    if not os.path.exists(path):
        fail('missing asset: ' + path)
    with open(path, 'rb') as f:
        b64 = base64.b64encode(f.read()).decode('ascii')
    uris[name] = 'data:audio/mp3;base64,' + b64

uri_lines = [json.dumps(k) + ': ' + json.dumps(v) for k, v in uris.items()]
assets_literal = '{\n  ' + ',\n  '.join(uri_lines) + '\n}'

# ── 5. glyph ──────────────────────────────────────────────────────────────

with open(os.path.join(SRC, 'glyph.txt'), encoding='utf-8') as f:
    glyph_d = f.read().strip()
if len(glyph_d) < 1000:
    fail('glyph path suspiciously short: %d' % len(glyph_d))
glyph_literal = json.dumps(glyph_d)

# ── 6. 组装 shell ─────────────────────────────────────────────────────────

shell = read('shell.js')
placeholders = [
    ('/*@DEFAULTS_AND_NORMALIZE@*/', defaults_and_normalize),
    ('/*@SPLASH_CSS@*/', splash_css_literal),
    ('/*@ASSET_URIS@*/', assets_literal),
    ('/*@GLYPH_D@*/', glyph_literal),
    ('/*@RUN_SPLASH@*/', run_splash.rstrip()),
]
for ph, value in placeholders:
    if shell.count(ph) != 1:
        fail('placeholder count != 1: ' + ph)
    shell = shell.replace(ph, value)

if '/*@' in shell:
    fail('unreplaced placeholder remains')

with open(OUT, 'w', encoding='utf-8', newline='\n') as f:
    f.write(shell)

size = os.path.getsize(OUT)
print('OK -> %s (%.1f KB)' % (OUT, size / 1024))
print('  runtime: %d lines, css: %d KB, audio: %d KB (b64), glyph: %d KB' % (
    run_splash.count('\n'), len(css) / 1024,
    sum(len(u) for u in uris.values()) / 1024, len(glyph_d) / 1024))

# ── 7. 浏览器预览页（自包含，动画视觉在落地前先验）─────────────────────────

preview = '''<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>hermes-startup-screen · 离线预览</title>
<style>
  html, body { margin: 0; height: 100%; overflow: hidden; }
  body { font-family: "Microsoft YaHei", "Segoe UI", system-ui, sans-serif; background: #17181c; }
  /* mock 应用：揭幕那一刻要有东西可看 */
  #mockApp { position: fixed; inset: 0; z-index: 1; display: flex; background: #f6f6f4; }
  #mockApp .side { width: 232px; background: #ececea; border-right: 1px solid #e0e0dd; padding: 14px 12px; }
  #mockApp .brand { font-weight: 700; color: #2c2c2e; font-size: 13px; letter-spacing: .04em; margin-bottom: 14px; }
  #mockApp .item { font-size: 12.5px; color: #5b5b60; padding: 7px 9px; border-radius: 7px; margin-bottom: 3px; }
  #mockApp .item.on { background: #fff; color: #1d1d1f; box-shadow: 0 1px 2px rgba(0,0,0,.06); }
  #mockApp .main { flex: 1; display: flex; flex-direction: column; }
  #mockApp .top { height: 44px; border-bottom: 1px solid #e6e6e3; display: flex; align-items: center; padding: 0 18px; font-size: 12.5px; color: #6a6b70; }
  #mockApp .body { flex: 1; padding: 26px 32px; }
  #mockApp .bubble { max-width: 560px; font-size: 13px; line-height: 1.75; color: #2c2d31; background: #fff; border: 1px solid #e8e8e5; border-radius: 12px; padding: 13px 15px; margin-bottom: 12px; }
  #mockApp .bubble.me { margin-left: auto; background: #e9eaf6; border: 0; }
  /* 预览控制条 */
  #pctl { position: fixed; right: 14px; bottom: 14px; z-index: 2147483600; display: flex; gap: 8px; }
  #pctl button { font: inherit; font-size: 12px; padding: 7px 14px; border-radius: 8px; border: 1px solid rgba(255,255,255,.2); background: rgba(20,20,24,.9); color: #f0f0f2; cursor: pointer; }
  #pctl button:hover { background: rgba(40,40,46,.95); }
</style>
<style>
html.dsu-lock,html.dsu-lock body{overflow:hidden!important}
#hermes-startup-root.dsu-boot{position:fixed;inset:0;z-index:2147483000;background:#000}
__SPLASH_CSS__
</style>
</head>
<body>
<div id="mockApp">
  <div class="side">
    <div class="brand">HERMES</div>
    <div class="item on">新会话</div>
    <div class="item">代理工作流</div>
    <div class="item">技能库</div>
    <div class="item">定时任务</div>
  </div>
  <div class="main">
    <div class="top">hermes-startup-screen · 预览用 mock 界面</div>
    <div class="body">
      <div class="bubble">揭幕之后看到的这屏就是 mock 应用——动画结束时应正常移交。</div>
      <div class="bubble me">先把动画完整看一遍。</div>
    </div>
  </div>
</div>
<div id="pctl">
  <button id="btnReplay">重播</button>
  <button id="btnSkip">跳过</button>
</div>
<script>
/* 与插件壳同款的资源与运行时（构建注入） */
const ROOT_ID = 'hermes-startup-root'
const GLYPH_D = __GLYPH_D__;
const ASSET_URIS = __ASSET_URIS__;
function fetchAsset(name) {
  const u = ASSET_URIS[name]
  if (!u) return Promise.reject(new Error('missing asset: ' + name))
  return fetch(u)
}
__DEFAULTS__;
__RUN_SPLASH__

function stopPrev() {
  try { if (window.__DSH_STARTUP_API__ && window.__DSH_STARTUP_API__.finish) window.__DSH_STARTUP_API__.finish() } catch (e) {}
  const old = document.getElementById('hermes-startup-root')
  if (old && old.parentNode) old.parentNode.removeChild(old)
  document.documentElement.classList.remove('dsu-lock')
  document.documentElement.style.overflow = ''
}
function play() {
  stopPrev()
  window.__DSH_STARTUP__ = { ...DEFAULTS }
  window.__DSH_STARTUP_LOADED__ = false
  window.__DSH_STARTUP_SKIP__ = false
  const root = document.createElement('div')
  root.id = 'hermes-startup-root'
  root.className = 'dsu-root dsu-boot'
  document.body.appendChild(root)
  document.documentElement.classList.add('dsu-lock')
  runSplash()
}
window.__HS_REPLAY__ = play
document.getElementById('btnReplay').onclick = play
document.getElementById('btnSkip').onclick = function () {
  if (window.__DSH_STARTUP_API__) window.__DSH_STARTUP_API__.skip()
}
play()
</script>
</body>
</html>
'''
preview_dir = os.path.join(HERE, 'preview')
os.makedirs(preview_dir, exist_ok=True)
preview = preview.replace('__SPLASH_CSS__', css)
preview = preview.replace('__GLYPH_D__', glyph_literal)
preview = preview.replace('__ASSET_URIS__', assets_literal)
preview = preview.replace('__DEFAULTS__', defaults_const)
preview = preview.replace('__RUN_SPLASH__', run_splash.rstrip())
preview_path = os.path.join(preview_dir, 'index.html')
with open(preview_path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(preview)
print('preview -> %s (%.1f KB)' % (preview_path, os.path.getsize(preview_path) / 1024))
