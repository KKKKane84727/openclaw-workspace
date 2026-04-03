---
name: audio-transcribe
description: >
  本地音频转文字。中文用 FunASR/Paraformer（高精度），其他语言用 Whisper large-v3。
  Use when: (1) 用户上传音频需要转写, (2) 会议录音转文字, (3) 语音转文字/transcribe/听写。
  NOT when: (1) 实时流式转写（本技能为离线批处理）, (2) 纯文本已提供无需转写, (3) 需要说话人分离/diarization（当前不支持）。
---

# Audio Transcribe

本地音频转文字。输出纯文本，不做总结——总结交给 `meeting-to-action` 或 agent 自行处理。

## 语言路由

| 语言 | 工具 | 模型 | 适用场景 |
|------|------|------|----------|
| 中文 (zh/zh-CN/chinese) | FunASR | paraformer-zh + ct-punc | 中文会议、播客、访谈 |
| 其他语言 | Whisper | large-v3 | 英文及多语种音频 |

未指定语言时根据上下文推断；无法推断默认中文。

## 使用方法

### 中文音频（推荐）

```bash
python3 {baseDir}/scripts/transcribe_zh.py "<音频文件绝对路径>"
```

### 其他语言

```bash
bash {baseDir}/scripts/transcribe_whisper.sh "<音频文件绝对路径>"
```

## 注意事项

- FunASR 首次加载模型约 10-15 秒，后续调用更快
- Whisper large-v3 模型已缓存在 `~/.cache/whisper/`
- 支持格式：mp3, wav, m4a, flac, ogg, mp4（含音频轨）
- 长音频（>30 分钟）建议先用 `ffmpeg` 切分为 ≤15 分钟片段再逐段转写
- 输出纯文本到 stdout，不写文件
