#!/usr/bin/env node
/**
 * generate_song.mjs — MiniMax music generation script.
 * Aligned with official API: https://platform.minimaxi.com/docs/api-reference/music-generation
 *
 * Usage:
 *   echo '<JSON>' | node generate_song.mjs
 *
 * Input JSON (stdin):
 *   {
 *     "mode": "bgm" | "song",
 *     "prompt": "风格,情绪,场景",
 *     "lyrics": "[Verse]\n...",              // required for mode=song (music-2.5)
 *     "model": "music-2.5" | "music-2.5+",  // default: music-2.5
 *     "format": "mp3" | "wav" | "pcm",      // default: mp3
 *     "output": "/tmp/openclaw/song.mp3"     // optional, auto-generated if omitted
 *   }
 *
 * Official API parameters used:
 *   model, prompt, lyrics, output_format, audio_setting, aigc_watermark,
 *   is_instrumental (music-2.5+ only), lyrics_optimizer
 *
 * NOT official API parameters (removed):
 *   duration, reference_audio_url — these were silently ignored by the API
 */

import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// ── Constants ──────────────────────────────────────────────────────────
const MINIMAX_BASE_URL = 'https://api.minimaxi.com/v1';
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000;
const NON_RETRYABLE_CODES = new Set([1002, 1004, 1008, 1026, 2013, 2049, 2061]);

// ── Auth ───────────────────────────────────────────────────────────────

const MODEL_PROFILES = {
  'music-2.5': ['minimax:cn', 'minimax-portal:default', 'minimax:default'],
  'music-2.5+': ['minimax:music-plus'],
};

/**
 * Resolve MiniMax API key based on model.
 * - music-2.5: env vars → auth-profiles (minimax:cn)
 * - music-2.5+: auth-profiles (minimax:music-plus) only
 */
async function resolveApiKey(model = 'music-2.5') {
  const stateDir = process.env.OPENCLAW_STATE_DIR?.trim()
    || path.join(os.homedir(), '.openclaw');
  const authStorePath = path.join(stateDir, 'agents', 'main', 'agent', 'auth-profiles.json');

  if (model === 'music-2.5+') {
    if (existsSync(authStorePath)) {
      try {
        const raw = JSON.parse(await readFile(authStorePath, 'utf8'));
        const profiles = raw.profiles ?? {};
        for (const profileId of MODEL_PROFILES['music-2.5+']) {
          const token = extractToken(profiles[profileId]);
          if (token) return token;
        }
      } catch { /* ignore */ }
    }
    throw Object.assign(
      new Error('music-2.5+ requires minimax:music-plus profile in auth-profiles.json'),
      { code: 'AUTH_MISSING_PLUS' },
    );
  }

  const envKey = process.env.MINIMAX_API_KEY?.trim()
    || process.env.MINIMAX_OAUTH_TOKEN?.trim();
  if (envKey) return envKey;

  if (existsSync(authStorePath)) {
    try {
      const raw = JSON.parse(await readFile(authStorePath, 'utf8'));
      const profiles = raw.profiles ?? {};
      const preferredIds = [
        raw.lastGood?.['minimax-portal'],
        raw.lastGood?.minimax,
        ...MODEL_PROFILES['music-2.5'],
      ].filter(Boolean);

      for (const profileId of preferredIds) {
        const token = extractToken(profiles[profileId]);
        if (token) return token;
      }
      for (const [id, cred] of Object.entries(profiles)) {
        if (!id.startsWith('minimax')) continue;
        const token = extractToken(cred);
        if (token) return token;
      }
    } catch { /* ignore */ }
  }

  throw Object.assign(
    new Error('Missing MINIMAX_API_KEY or MINIMAX_OAUTH_TOKEN in environment, and no valid token found in OpenClaw auth store'),
    { code: 'AUTH_MISSING' },
  );
}

function extractToken(credential) {
  if (!credential || typeof credential !== 'object') return undefined;
  const { type } = credential;
  if (type === 'api_key') return credential.key?.trim() || undefined;
  if (type === 'token') return credential.token?.trim() || undefined;
  if (type === 'oauth') return (credential.access || credential.accessToken)?.trim() || undefined;
  return undefined;
}

// ── I/O Helpers ────────────────────────────────────────────────────────

async function readJsonStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf-8').trim();
  if (!raw) throw Object.assign(new Error('No JSON input on stdin'), { code: 'EMPTY_STDIN' });
  try {
    return JSON.parse(raw);
  } catch {
    throw Object.assign(new Error('Invalid JSON on stdin'), { code: 'INVALID_JSON' });
  }
}

function printOk(data) {
  process.stdout.write(JSON.stringify({ ok: true, ...data }, null, 2) + '\n');
}

function printError(code, message) {
  process.stderr.write(JSON.stringify({ ok: false, code, message }, null, 2) + '\n');
  process.exitCode = 1;
}

async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true });
}

function looksLikeUrl(s) {
  return s.startsWith('http://') || s.startsWith('https://');
}

function looksLikeHex(s) {
  return s.length > 0 && s.length % 2 === 0 && /^[0-9a-f]+$/i.test(s);
}

// ── MiniMax API ────────────────────────────────────────────────────────

async function fetchMinimax(endpoint, payload, bearer) {
  const url = `${MINIMAX_BASE_URL}${endpoint}`;
  let lastError;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise(r => setTimeout(r, RETRY_BASE_MS * Math.pow(2, attempt - 1)));
    }

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${bearer}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.text();
        const err = new Error(`MiniMax ${res.status}: ${body.slice(0, 500)}`);
        if (res.status >= 400 && res.status < 500) {
          err.retryable = false;
          throw err;
        }
        throw err;
      }

      const body = await res.json();
      const baseResp = body.base_resp;
      const statusCode = typeof baseResp?.status_code === 'number'
        ? baseResp.status_code
        : Number(baseResp?.status_code) || 0;

      if (statusCode !== 0) {
        const msg = baseResp?.status_msg || 'unknown error';
        const err = new Error(`MiniMax API error ${statusCode}: ${msg}`);
        if (NON_RETRYABLE_CODES.has(statusCode)) {
          err.retryable = false;
          throw err;
        }
        throw err;
      }

      return body;
    } catch (e) {
      lastError = e;
      if (e.retryable === false) break;
    }
  }

  throw lastError;
}

// ── Audio Persistence ──────────────────────────────────────────────────

async function persistAudio(response, outputPath) {
  const data = response.data;
  const extraInfo = response.extra_info;
  const candidates = [
    data?.audio, data?.audio_url, data?.audioUrl,
    data?.url, data?.file_url, response.audio,
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || !candidate.trim()) continue;

    await ensureDir(path.dirname(outputPath));

    if (looksLikeUrl(candidate)) {
      const dl = await fetch(candidate);
      if (!dl.ok) throw new Error(`Download failed: ${dl.status}`);
      await writeFile(outputPath, Buffer.from(await dl.arrayBuffer()));
    } else if (looksLikeHex(candidate)) {
      await writeFile(outputPath, Buffer.from(candidate, 'hex'));
    } else {
      await writeFile(outputPath, Buffer.from(candidate, 'base64'));
    }

    // Extract duration from response metadata (music_duration is in ms)
    const durationCandidates = [
      extraInfo?.audio_length, extraInfo?.music_duration,
      data?.duration, data?.audio_duration,
    ];
    let duration;
    for (const d of durationCandidates) {
      const num = typeof d === 'number' ? d : Number(d);
      if (Number.isFinite(num) && num > 0) {
        duration = num > 1000 ? num / 1000 : num;
        break;
      }
    }

    return { path: outputPath, duration };
  }

  throw new Error('MiniMax response did not include audio data');
}

// ── Metadata Logging ───────────────────────────────────────────────────

async function saveMetadata(outputPath, data) {
  const metaPath = outputPath.replace(/\.[^.]+$/, '.meta.json');
  await writeFile(metaPath, JSON.stringify({
    ...data,
    generated_at: new Date().toISOString(),
    script: 'song-creator/scripts/generate_song.mjs',
  }, null, 2) + '\n');
  return metaPath;
}

// ── Validation ─────────────────────────────────────────────────────────

function validate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw Object.assign(new Error('Input must be a JSON object'), { code: 'INVALID_INPUT' });
  }

  const mode = input.mode ?? (input.lyrics ? 'song' : 'bgm');
  if (!['bgm', 'song'].includes(mode)) {
    throw Object.assign(
      new Error(`mode must be one of: bgm, song (got "${mode}")`),
      { code: 'INVALID_MODE' },
    );
  }

  const prompt = input.prompt?.trim() || undefined;
  const lyrics = input.lyrics?.trim() || undefined;

  const model = input.model ?? 'music-2.5';
  if (!['music-2.5', 'music-2.5+'].includes(model)) {
    throw Object.assign(
      new Error(`model must be music-2.5 or music-2.5+ (got "${model}")`),
      { code: 'INVALID_MODEL' },
    );
  }

  // BGM validation: music-2.5+ requires prompt for is_instrumental; music-2.5 requires prompt for hint
  if (mode === 'bgm' && !prompt) {
    throw Object.assign(new Error('bgm mode requires a prompt'), { code: 'MISSING_PROMPT' });
  }
  // Song validation: music-2.5 always requires lyrics; music-2.5+ requires lyrics unless lyrics_optimizer
  if (mode === 'song' && !lyrics) {
    throw Object.assign(new Error('song mode requires lyrics'), { code: 'MISSING_LYRICS' });
  }

  // Official formats: mp3, wav, pcm (NOT flac)
  const format = input.format ?? 'mp3';
  if (!['mp3', 'wav', 'pcm'].includes(format)) {
    throw Object.assign(
      new Error(`format must be mp3, wav, or pcm (got "${format}")`),
      { code: 'INVALID_FORMAT' },
    );
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const ext = format === 'pcm' ? 'pcm' : format;
  const defaultOutput = `/tmp/openclaw/song-${mode}-${timestamp}.${ext}`;
  const output = input.output?.trim() || defaultOutput;

  return { mode, prompt, lyrics, format, output, model };
}

// ── Main ───────────────────────────────────────────────────────────────

async function main() {
  const input = await readJsonStdin();
  const { mode, prompt, lyrics, format, output, model } = validate(input);
  const bearer = await resolveApiKey(model);

  // Build payload — only official API parameters
  const payload = {
    model,
    output_format: 'url',
    aigc_watermark: false,
    audio_setting: {
      sample_rate: 44100,
      bitrate: 256000,
      format,
    },
  };

  if (mode === 'bgm') {
    if (model === 'music-2.5+') {
      // Official: is_instrumental makes lyrics optional, prompt required
      payload.is_instrumental = true;
      payload.prompt = prompt;
    } else {
      // music-2.5: no is_instrumental; use prompt hint + placeholder lyrics
      payload.prompt = `纯音乐,无人声,${prompt}`;
      payload.lyrics = ' ';
    }
  } else {
    // Song mode
    if (prompt) payload.prompt = prompt;
    payload.lyrics = lyrics;
  }

  // Generate music
  const response = await fetchMinimax('/music_generation', payload, bearer);

  // Persist audio file
  const result = await persistAudio(response, output);

  // Save metadata
  const metaPath = await saveMetadata(output, {
    mode,
    model,
    prompt: payload.prompt,
    lyrics: mode === 'song' ? lyrics : undefined,
    duration_actual: result.duration,
    format,
    audio_path: result.path,
  });

  // Output result
  printOk({
    path: result.path,
    duration: result.duration,
    mode,
    model,
    format,
    metadata: metaPath,
  });
}

main().catch(err => {
  printError(err.code || 'GENERATION_FAILED', err.message);
});
