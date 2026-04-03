# Prompt Engineering & API Guide

Phase 3 生成音乐时的 API 用法和 prompt 构造参考。

## Table of Contents

- [Helper Contract](#helper-contract) — 脚本调用方式、输入输出格式
- [Examples](#examples) — BGM / Song 各模式示例
- [Prompt Engineering](#prompt-engineering) — 官方格式、音色锁定、8 维度公式
- [配器关键词表](#配器关键词表) — 弦乐/键盘/打击/管乐/电子/民族
- [流派 × 配器速查](#流派--配器速查) — 12 种流派推荐配器组合
- [时长控制](#时长控制)

---

## Helper Contract

**Script**: `~/.openclaw/workspace-cartooner/skills/song-creator/scripts/generate_song.mjs`
**Invocation**: `echo '<JSON>' | node <script>`

**Input (stdin JSON):**

| Field | Required | Type | Default | Constraint |
|-------|----------|------|---------|------------|
| `mode` | Yes | `"bgm"` \| `"song"` | — | 明确指定 |
| `prompt` | Yes | string | — | 风格,情绪,场景（官方格式，逗号分隔） |
| `lyrics` | song only | string | — | 带 14 种官方标签，长度 1-3500 字符 |
| `model` | No | `"music-2.5"` \| `"music-2.5+"` | `"music-2.5"` | 用户明确要求 plus 时传 |
| `format` | No | `"mp3"` \| `"wav"` \| `"pcm"` | `"mp3"` | 官方仅支持这三种 |
| `output` | No | string | `/tmp/openclaw/song-{mode}-{ts}.{fmt}` | Must be in mediaLocalRoots |

> **已移除的非官方参数**：`duration`（API 不支持，时长由歌词长度决定）、`reference_audio_url`（API 不支持，被静默忽略）。

**Output (stdout JSON):**

Success:
```json
{
  "ok": true,
  "path": "/tmp/openclaw/song-song-2026-03-23T12-00-00.mp3",
  "duration": 30.5,
  "mode": "song",
  "model": "music-2.5",
  "format": "mp3",
  "metadata": "/tmp/openclaw/song-song-2026-03-23T12-00-00.meta.json"
}
```

Error:
```json
{
  "ok": false,
  "code": "MISSING_LYRICS",
  "message": "song mode requires lyrics"
}
```

---

## Examples

**BGM（基础，官方格式）:**
```json
{
  "mode": "bgm",
  "prompt": "轻松爵士,钢琴,适合烹饪视频"
}
```

**BGM（music-2.5+，原生纯音乐）:**
```json
{
  "mode": "bgm",
  "model": "music-2.5+",
  "prompt": "Lo-Fi Hip Hop,慵懒,雨天东京咖啡馆,电钢琴Rhodes和弦,采样鼓,黑胶质感"
}
```

**Song（官方示例风格）:**
```json
{
  "mode": "song",
  "prompt": "独立民谣,忧郁,内省,渴望,独自漫步,咖啡馆",
  "lyrics": "[Verse]\n街灯微亮晚风轻抚\n影子拉长独自漫步\n旧外套裹着深深忧郁\n不知去向渴望何处\n\n[Chorus]\n推开木门香气弥漫\n熟悉的角落陌生人看"
}
```

**Song（高质量场景化 prompt — La La Land 风格，经实测验证）:**
```json
{
  "mode": "song",
  "prompt": "浪漫爵士华尔兹,梦幻女声气声唱法像星光下低语,钢琴琶音如心跳,弱音小号在城市雾中哭泣,立式贝斯拨弦在路灯间漫步,刷鼓像屋顶轻柔细雨,副歌弦乐渐强如剧院大幕升起,颤音琴微光,三拍子华尔兹,温暖模拟录音磁带质感,洛杉矶黄昏电影感",
  "lyrics": "[Intro]\n(钢琴琶音,轻柔而探寻)\n\n[Verse 1]\nI trace the city lights from up this hill\nThe boulevard hums a melody, bending still\n\n[Chorus]\nWe're dancing in the afterglow\nOf a city that won't let us go\n\n[Bridge]\n(小号独奏,温柔而心痛)\n\n[Outro]\n(钢琴渐弱,单音如流星坠落)",
  "format": "wav"
}
```

**Song with music-2.5+:**
```json
{
  "mode": "song",
  "model": "music-2.5+",
  "prompt": "中文后朋克摇滚,低沉沙哑迷幻男声像空荡地下室独白,失真电吉他feedback,drone贝斯,冷冽军鼓,暗黑梦境质感",
  "lyrics": "[Verse]\n...\n\n[Chorus]\n..."
}
```

---

## Prompt Engineering

### 官方推荐（MiniMax platform.minimaxi.com）

官方 prompt 格式：**风格,情绪,场景**，中文逗号分隔关键词：
```
独立民谣,忧郁,内省,渴望,独自漫步,咖啡馆
```
```
流行音乐,难过,适合在下雨的晚上
```

> **中文 prompt 是官方示例语言。** 英文 prompt 也可用，但中文关键词可能与模型训练数据更匹配。

### 音色锁定策略

MiniMax music API **没有 voice_id 或 reference_audio_url 参数**。音色控制的唯一方式是 **prompt 描述**：

```
# 抽象，效果差
男声，低沉，有磁性

# 场景化比喻，效果好
低沉沙哑迷幻男声，像在空荡荡的地下室里对着墙壁独白

# 参考艺术家 + 质感描述
类似窦唯黑梦时期的嗓音，带有磁性和距离感，混响深邃

# 多维度音色刻画（性别 + 质感 + 发声方式 + 效果）
清澈女高音，气声唱法，带轻微混响，像晨雾中的教堂钟声
```

> **核心发现**：场景化的音色比喻（"空荡荡的地下室"、"晨雾中的教堂钟声"）比堆砌形容词（"低沉、磁性、温暖"）对模型输出的区分度大得多。

### Prompt 结构公式

一个好的 prompt 应覆盖 **至少 4 个维度**，用逗号分隔：

```
{语言} + {风格流派} + {情绪/氛围} + {人声} + {编曲/配器} + {BPM} + {音色质感} + {场景用途}
```

**示例 — 从简到全**：

```
# 基础 (3 维度)
中文流行，女声，温暖

# 标准 (5 维度)
中文流行，女声，温暖治愈，吉他+钢琴，90 BPM

# 专业 (8 维度)
中文独立民谣，女声，温暖治愈，木吉他分解和弦+钢琴点缀+轻刷鼓，88 BPM，温润人声混响，适合深夜电台片尾
```

### 8 个维度详解

| # | 维度 | 关键词示例 | 影响程度 |
|---|------|-----------|---------|
| 1 | **语言** | 中文 / English / 日本語 / 粤语 / 韩语 | 决定歌词发音和旋律走向 |
| 2 | **风格流派** | 流行 / 摇滚 / 爵士 / 电子 / 古典 / R&B / 嘻哈 / 民谣 / 后摇 / 蓝调 / 放克 / 雷鬼 / 金属 / 朋克 / 乡村 / gospel / bossa nova / lo-fi | 核心风格分类器 |
| 3 | **情绪/氛围** | 欢快 / 伤感 / 史诗 / 温暖 / 暗黑 / 激昂 / 治愈 / 迷幻 / 孤独 / 怀旧 / 紧张 / 浪漫 / 空灵 / 压抑 | 情感色调 |
| 4 | **人声** | 男声 / 女声 / 童声 / 男低音 / 女高音 / 沙哑男声 / 清澈女声 / 合唱 / 和声 | BGM 模式忽略 |
| 5 | **编曲/配器** | 见下方配器表 | 决定音色层次 |
| 6 | **BPM** | 60 (慢歌/抒情) / 80-100 (中速流行) / 120 (舞曲) / 140+ (快节奏) | 节奏骨架 |
| 7 | **音色质感** | 温润 / 冷色 / 粗糙 / 干净 / 复古 / 失真 / 混响重 / 空间感 / Lo-Fi 质感 / 模拟磁带 / 数字清晰 | 后期感觉 |
| 8 | **场景用途** | 适合深夜电台 / 适合短视频片头 / 适合婚礼 / 适合游戏战斗 / 适合冥想放松 / 适合Vlog旅行 / 适合悬疑推理 | 给模型明确的上下文意图 |

---

## 配器关键词表

**弦乐类**：
- 木吉他 / 电吉他 / 尼龙弦吉他 / 贝斯 / 贝斯拨弦 / 大提琴 / 小提琴独奏 / 弦乐四重奏 / 管弦乐团 / 竖琴 / 尤克里里 / 班卓琴 / 曼陀林

**键盘类**：
- 钢琴 / 电钢琴 / 风琴 / 手风琴 / 合成器 / 合成器Pad / 合成器Lead / 合成器Bass / Rhodes电钢 / Wurlitzer / 钟琴 / 马林巴

**打击类**：
- 鼓组 / 电子鼓 / 808低音鼓 / 军鼓 / 踩镲 / 碎音镲 / 手鼓 / 沙锤 / 铃鼓 / 拍手 / 弹指 / 木鱼 / 定音鼓

**管乐类**：
- 萨克斯 / 小号 / 长号 / 长笛 / 单簧管 / 口琴 / 竹笛 / 箫 / 唢呐

**电子/合成类**：
- 合成器Arp / 电子脉冲 / 环境Pad / 白噪音 / 低频嗡鸣 / Vocoder / Auto-Tune

**民族/特色**：
- 古筝 / 琵琶 / 二胡 / 三弦 / 三味线 / 西塔尔 / 卡林巴 / 非洲鼓 / 邦哥鼓 / 钢鼓

### 编曲模式描述

除了列出乐器，还可以描述**编曲手法**来增加细节：

```
# 描述演奏方式
木吉他分解和弦      （而非只写"木吉他"）
电吉他失真Riff      （而非只写"电吉他"）
钢琴琶音            （而非只写"钢琴"）
贝斯Walking Bass    （而非只写"贝斯"）

# 描述层次关系
钢琴为主+轻刷鼓+贝斯铺底
弦乐铺底+钢琴点缀+电子鼓节奏
前奏吉他独奏→主歌加入鼓组→副歌弦乐加厚

# 描述动态变化
从轻柔渐入到饱满
verse安静，chorus爆发
层层递进，不断叠加乐器
```

---

## 流派 × 配器速查

| 流派 | 推荐配器组合 | BPM |
|------|-------------|-----|
| 流行抒情 | 钢琴+吉他+轻鼓+弦乐 | 72-92 |
| 摇滚 | 电吉他失真+贝斯+鼓组+偶尔钢琴 | 110-140 |
| 爵士 | 萨克斯+钢琴+Walking Bass+刷鼓 | 100-130 |
| 电子/EDM | 合成器+808+电子鼓+Arp+Pad | 120-150 |
| Lo-Fi | 电钢琴+采样鼓+Lo-Fi质感+环境音 | 70-90 |
| 古典 | 弦乐四重奏/管弦乐团+钢琴 | 60-120 |
| R&B | 电钢琴+贝斯+轻鼓+和声 | 80-100 |
| 嘻哈 | 808低音+采样鼓+合成器Bass+Auto-Tune | 80-100 |
| 民谣 | 木吉他+口琴+手鼓+贝斯 | 80-110 |
| 中国风 | 古筝+琵琶+竹笛+轻鼓 | 70-100 |
| 日系动漫 | 电吉他+钢琴+鼓组+弦乐 | 140-180 |
| 影视配乐 | 管弦乐团+定音鼓+钢琴+合唱 | 60-100 |
| Bossa Nova | 尼龙弦吉他+轻刷鼓+贝斯+长笛 | 120-140 |

---

## 时长控制

> **API 没有 duration 参数。** 歌曲时长由**歌词长度**决定。实测：4 行歌词 ≈ 30-40s，8 行 ≈ 60-80s，完整 Verse+Chorus×2+Bridge 结构 ≈ 120-160s。BGM 模式时长不可控（通常 40-260s）。如需精确裁剪，后续用 `ffmpeg -t <seconds>` 截取。
