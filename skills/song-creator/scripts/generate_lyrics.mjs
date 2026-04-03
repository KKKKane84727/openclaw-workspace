#!/usr/bin/env node
/**
 * generate_lyrics.mjs — MiniMax lyrics generation script.
 * Calls /v1/lyrics_generation to get model-native lyrics as a rhyme/structure reference.
 *
 * Usage:
 *   echo '<JSON>' | node generate_lyrics.mjs
 *
 * Input JSON (stdin):
 *   {
 *     "prompt": "主题/风格/方向描述",   // required, max 2000 chars
 *     "mode": "write_full_song",        // optional, default: write_full_song
 *     "lyrics": "[Verse]\n...",         // optional, for "edit" mode only
 *     "title": "歌名"                  // optional, preserved in output
 *   }
 *
 * Output (stdout JSON):
 *   {
 *     "ok": true,
 *     "lyrics": "[Verse]\n街灯微亮...",
 *     "style_tags": "indie,folk,melancholy",
 *     "song_title": "城市漫步"
 *   }
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// ── Constants ──────────────────────────────────────────────────────────
const MINIMAX_BASE_URL = 'https://api.minimaxi.com/v1';
const MAX_RETRIES = 2;
const RETRY_BASE_MS = 1000;
const NON_RETRYABLE_CODES = new Set([1002, 1004, 1008, 1026, 2013, 2049, 2061]);

// ── Auth (shared logic with generate_song.mjs) ───────────────────────

// lyrics_generation requires JWT key (sk-cp keys return 2061).
// Prefer JWT profiles first, then fall back to sk-cp.
const AUTH_PROFILES_JWT = ['minimax:music-plus', 'minimax:apiplus'];
const AUTH_PROFILES_SKCP = ['minimax-portal:default', 'minimax:cn', 'minimax:default'];

async function resolveApiKey() {
  // Prefer JWT tokens from env (lyrics_generation needs JWT, not sk-cp)
  const envToken = process.env.MINIMAX_OAUTH_TOKEN?.trim()
    || process.env.MINIMAX_SPEECH_API_KEY?.trim();
  if (envToken) return envToken;

  const stateDir = process.env.OPENCLAW_STATE_DIR?.trim()
    || path.join(os.homedir(), '.openclaw');
  const authStorePath = path.join(stateDir, 'agents', 'main', 'agent', 'auth-profiles.json');

  if (existsSync(authStorePath)) {
    try {
      const raw = JSON.parse(await readFile(authStorePath, 'utf8'));
      const profiles = raw.profiles ?? {};

      // Try JWT profiles first (lyrics_generation needs them)
      for (const profileId of AUTH_PROFILES_JWT) {
        const token = extractToken(profiles[profileId]);
        if (token) return token;
      }

      // Fall back to sk-cp (may fail with 2061 but worth trying)
      const envKey = process.env.MINIMAX_API_KEY?.trim();
      if (envKey) return envKey;

      const preferredIds = [
        raw.lastGood?.['minimax-portal'],
        raw.lastGood?.minimax,
        ...AUTH_PROFILES_SKCP,
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

  const envKey = process.env.MINIMAX_API_KEY?.trim();
  if (envKey) return envKey;

  throw Object.assign(
    new Error('Missing MiniMax JWT token for lyrics_generation. Set MINIMAX_OAUTH_TOKEN or add minimax:music-plus profile.'),
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

// ── Validation ─────────────────────────────────────────────────────────

function validate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw Object.assign(new Error('Input must be a JSON object'), { code: 'INVALID_INPUT' });
  }

  const prompt = input.prompt?.trim();
  if (!prompt) {
    throw Object.assign(new Error('prompt is required'), { code: 'MISSING_PROMPT' });
  }
  if (prompt.length > 2000) {
    throw Object.assign(new Error('prompt exceeds 2000 characters'), { code: 'PROMPT_TOO_LONG' });
  }

  const mode = input.mode ?? 'write_full_song';
  if (!['write_full_song', 'edit'].includes(mode)) {
    throw Object.assign(
      new Error(`mode must be write_full_song or edit (got "${mode}")`),
      { code: 'INVALID_MODE' },
    );
  }

  const lyrics = input.lyrics?.trim() || undefined;
  if (mode === 'edit' && !lyrics) {
    throw Object.assign(new Error('edit mode requires lyrics'), { code: 'MISSING_LYRICS' });
  }

  const title = input.title?.trim() || undefined;

  return { prompt, mode, lyrics, title };
}

// ── Main ───────────────────────────────────────────────────────────────

async function main() {
  const input = await readJsonStdin();
  const { prompt, mode, lyrics, title } = validate(input);
  const bearer = await resolveApiKey();

  const payload = { prompt, mode };
  if (lyrics) payload.lyrics = lyrics;
  if (title) payload.title = title;

  const response = await fetchMinimax('/lyrics_generation', payload, bearer);

  // Extract lyrics from response (handle different response shapes)
  const data = response.data ?? response;
  const resultLyrics = [data.lyrics, response.lyrics].find(
    c => typeof c === 'string' && c.trim().length > 0,
  );

  if (!resultLyrics) {
    throw Object.assign(
      new Error('MiniMax response missing lyrics field'),
      { code: 'NO_LYRICS_IN_RESPONSE' },
    );
  }

  printOk({
    lyrics: resultLyrics.trim(),
    style_tags: data.style_tags ?? response.style_tags ?? undefined,
    song_title: data.song_title ?? response.song_title ?? title ?? undefined,
  });
}

main().catch(err => {
  printError(err.code || 'LYRICS_GENERATION_FAILED', err.message);
});
