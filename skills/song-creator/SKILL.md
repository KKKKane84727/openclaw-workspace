---
name: song-creator
description: >
  Standalone song/music creation. BGM, song with lyrics, or original composed song.
  MiniMax music-2.5 (default) / music-2.5+ (explicit). Handles "写歌/作曲/编曲/BGM/配乐/歌曲/soundtrack" requests.
tags: [music, song, bgm, minimax, audio, lyrics, composition]
platforms: [Claude, Gemini]
allowed-tools: [Bash, Read, Write]
---

# Song Creator

Create songs, background music, and instrumentals using MiniMax music generation.

**默认模型**: `music-2.5`（sk-cp key）。用户明确要求时可切换 `music-2.5+`（JWT key，支持 `is_instrumental` 原生参数）。

## 需求字段

**必填:**
- 类型: 有歌词的歌曲 / 纯音乐BGM
- 主题: (自由文本，描述歌曲要表达的内容、故事或场景)

**可选:**
- 风格: 流行 / 摇滚 / 爵士 / 电子 / 民谣 / R&B
- 情绪: 欢快 / 伤感 / 史诗 / 温暖 / 暗黑 / 激昂
- 歌词: 已有歌词(请粘贴) / 需要你来写
- 参考曲目: (自由文本，如"类似周杰伦的XX风格")

---

## Hard Rules

1. **永远不要跳过 Phase 2（作词）** — `auto_song` 模式必须先由 Agent 作词，再用 `song` 模式作曲。禁止使用占位歌词交给 MiniMax 自由发挥。
2. **歌词必须有结构标签** — `[Verse]`、`[Chorus]` 等标签是 MiniMax 理解歌曲结构的关键。无标签 = 无结构。
3. **output 路径必须在 mediaLocalRoots 白名单** — 默认 `/tmp/openclaw/`，否则飞书发送会被拒绝。
4. **歌曲时长由歌词长度决定** — API 没有 duration 参数。想要更长的歌，写更多段歌词。想要更短的歌，精简歌词。
5. **BGM 模式**：`music-2.5` 时脚本自动添加 "纯音乐,无人声" 前缀；`music-2.5+` 时使用原生 `is_instrumental` 参数，prompt 保持干净。
6. **生成完成后，立即 `open` 交付物目录** — 让用户可以直接试听。

---

## Two Modes

| Mode | Input | Output | Use When |
|------|-------|--------|----------|
| `bgm` | prompt (风格描述) | 纯器乐 | 背景音乐、配乐、氛围音、无人声 |
| `song` | lyrics + prompt | 有歌词的歌曲 | 用户提供歌词，或 Agent 先作词再作曲 |

> **不再有 `auto_song` 模式。** 用户说"帮我写一首歌"时，Agent 先作词（Phase 2），再用 `song` 模式作曲（Phase 3）。这比 MiniMax 内部生成歌词质量高得多。

---

## Workflow

### Phase 1: Understand Request

> **参数继承**: 用户已通过需求澄清（socratic-requirements 表单或对话）提供的参数直接采用，不再重复询问。本阶段只补全以下未覆盖的细化参数。

检查并补全（仅问用户未提供的）：
1. **语言**: 中文 / English / 日本語？（必须明确确认，不要仅从用户消息语言推断）
2. **人声**: 男声 / 女声 / 童声？(bgm 模式忽略)
3. **时长**: 默认 30 秒，范围 5-150 秒（歌曲模式下时长由歌词长度决定，可跳过）

以下参数已在「需求字段」中覆盖，如已收集则直接使用：
- 类型、主题、风格、情绪、歌词、参考曲目

> **注意**：官方 API 没有 `reference_audio_url` 参数。音色锁定完全通过 **prompt 的场景化描述**实现。

### Phase 2: Write Lyrics (if song mode)

**如果用户提供了歌词** → 直接进入 Phase 3。

**如果用户需要 Agent 作词** → 按以下 4 步流程执行：

#### Step 1: Agent 写初稿

读取 `references/lyrics-guide.md`，按结构标签和模板创作歌词初稿。

**韵脚要求**（默认必须，按风格豁免）：
- **流行/民谣/抒情/爵士/R&B**：尾韵必须。中文押韵母（如 ang/ang、ou/ou），英文 AABB 或 ABAB
- **说唱/Hip-Hop**：内韵（行内押韵）优先于尾韵，允许半韵和近韵
- **实验/后摇/意识流**：意象和情感优先，韵脚降级为加分项
- **其他风格**：默认要求尾韵

#### Step 2: 调用 MiniMax lyrics_generation 获取韵脚参考

用同一主题/风格调用 MiniMax 原生歌词生成，作为韵脚和结构参考（不替代 Agent 作品）：

```bash
echo '{"prompt": "<风格,情绪,主题的逗号描述>"}' | node ~/.openclaw/skills/song-creator/scripts/generate_lyrics.mjs
```

返回 `{"ok": true, "lyrics": "...", "style_tags": "...", "song_title": "..."}`。

#### Step 3: 对比优化

对比 Agent 初稿与 MiniMax 生成版本：
1. **韵脚**：MiniMax 歌词天然适配其旋律引擎。检查 Agent 初稿的韵脚密度是否达到同等水平，不足则修正
2. **结构**：MiniMax 的段落划分和标签使用是否有参考价值
3. **保留 Agent 优势**：Agent 的具体意象、叙事弧线、情感深度通常优于 MiniMax 生成——不要为了押韵牺牲这些

> 原则：Agent 负责创意质量，MiniMax 负责韵脚校准。最终歌词 = Agent 的意象深度 + MiniMax 级别的韵脚密度。

#### Step 4: 自检

- V2 是否引入了新场景（而非重复 V1 情绪）
- Bridge 是否有视角切换或时间跳跃
- 段落间是否有情感递进（V1 建立→V2 深化→Bridge 反转→Final Chorus 升华）
- 是否有具体意象而非抽象形容
- **韵脚是否符合风格要求**（见 Step 1 韵脚规范）

自检通过后向用户展示并确认，再进入 Phase 3。

### Phase 3: Generate Music

读取 `references/prompt-and-api-guide.md`，按 Prompt 结构公式构造 prompt，调用 generate_song.mjs 脚本生成。

### Phase 4: Deliver

1. **Always**: `open` 交付物目录
2. **If requested**: Send to Feishu:
   ```
   message(target="oc_5006225a09c968e88b01f66903fa1162", text="歌曲已生成", media="/tmp/openclaw/song.mp3", accountId="cartooner")
   ```

> **mediaLocalRoots 白名单**: `/tmp/openclaw/`、`~/.openclaw/media/`、`~/.openclaw/workspace/`、`~/.openclaw/sandboxes/`、`~/.openclaw/workspace-cartooner/`。

### Phase 5: Present to User

Tell the user:
- File path, format, duration
- Show lyrics (if Agent composed)
- Offer: "需要调整风格、时长或歌词吗？"

---

## Error Recovery

| Error Code | Cause | Fix |
|-----------|-------|-----|
| `AUTH_MISSING` | No API key | Check `MINIMAX_API_KEY` env or OpenClaw auth store |
| `MISSING_PROMPT` | bgm without prompt | Add style description |
| `MISSING_LYRICS` | song without lyrics | Provide lyrics or switch to bgm |
| `INVALID_DURATION` | <5 or >150 | Adjust to 5-150 range |
| `2013` | Invalid API params | Check payload structure |
| `2061` | Token plan limit | Upgrade MiniMax plan or change model |

---

## Environment & Cost

- **Auth**: OpenClaw auth-profiles.json（按模型路由 key）
  - `music-2.5` → `minimax:cn` profile（sk-cp key）
  - `music-2.5+` → `minimax:music-plus` profile（JWT key）
  - 也支持 `MINIMAX_API_KEY` / `MINIMAX_OAUTH_TOKEN` 环境变量覆盖（仅 music-2.5）
- **默认模型**: `music-2.5`（用户明确要求时切 `music-2.5+`）
- **Cost**: ~$0.02 per generation
- **Latency**: 30-60 seconds per generation
- **Duration limit**: 5-150 seconds per call

## 关于歌词

歌词创作是 Phase 2 的内置流程，**不需要单独的 skill**。执行本 skill 的 Agent 本身具备创意能力，作词能力由 `references/lyrics-guide.md` 中的规范保证（14 种结构标签、韵脚规范、意象要求）。经 La La Land、窦唯、波西米亚狂想曲等多风格实测验证，Agent 直接作词的质量远高于 MiniMax 内部 lyrics_optimizer。
