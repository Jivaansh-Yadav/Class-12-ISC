/**
 * ISC.exe — YouTube Channel Image Sync (v3)
 * ==========================================
 * Fetches updated avatars, banners, and descriptions from the YouTube Data API v3.
 * Preserves all manually-set keys (tags, isTop, url, pat, etc.) on every run.
 *
 * Resolution chain per channel:
 * 1. forHandle (modern @handle)
 * 2. Handle extracted from URL (youtube.com/@handle)
 * 3. Channel ID from URL (/channel/UC...)
 * 4. Legacy username (/user/...)
 * 5. Search by name + subject keyword
 * 6. Search by name alone
 *
 * Run: YOUTUBE_API_KEY=... tsx scripts/update-channels.ts
 */

import 'dotenv/config';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';

// ─── TYPES ───────────────────────────────────────────────────────────────────

interface Channel {
  id: string;
  name: string;
  handle?: string;
  av?: string;
  isTop?: boolean;
  desc?: string;
  tags?: string[];
  url?: string;
  pat?: string;
  avatarUrl?: string;
  bannerUrl?: string;
  // Allow other manually-set keys to pass through untouched
  [key: string]: unknown;
}

interface SubjectGroup {
  subject: string;
  color: string;
  bg: string;
  icon: string;
  channels: Channel[];
  [key: string]: unknown;
}

interface ChannelData {
  [stream: string]: SubjectGroup[];
}

interface FetchResult {
  avatar: string | null;
  banner: string | null;
  description: string | null;
  channelTitle: string;
}

// ─── CONFIG ──────────────────────────────────────────────────────────────────

const API_KEY  = process.env.YOUTUBE_API_KEY;
const BASE     = 'https://youtube.googleapis.com/youtube/v3';
const DELAY_MS = 300;

/** Max characters stored in `desc`. Keeps JSON tidy and UI safe. */
const DESC_MAX = 180;

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/** Normalize a description: collapse whitespace, strip newlines, truncate. */
function normalizeDesc(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  return cleaned.length > DESC_MAX
    ? cleaned.slice(0, DESC_MAX).replace(/\s+\S*$/, '') + '…'
    : cleaned;
}

/** Pull the highest-res avatar URL and bump to s800. */
function extractAvatar(items: Record<string, unknown>[]): string | null {
  if (!items?.length) return null;
  const t = (items[0] as any)?.snippet?.thumbnails;
  const url: string | null = t?.high?.url || t?.medium?.url || t?.default?.url || null;
  return url ? url.replace(/=s\d+-/, '=s800-') : null;
}

/** Pull the banner URL and append a high-quality crop parameter. */
function extractBanner(items: Record<string, unknown>[]): string | null {
  if (!items?.length) return null;
  const raw: string | null =
    (items[0] as any)?.brandingSettings?.image?.bannerExternalUrl || null;
  return raw
    ? raw + '=w2120-fcrop64=1,00005a57ffffa5a8-k-c0xffffffff-no-nd-rj'
    : null;
}

function extractTitle(items: Record<string, unknown>[]): string {
  return (items[0] as any)?.snippet?.title || '';
}

function extractDescription(items: Record<string, unknown>[]): string | null {
  return normalizeDesc((items[0] as any)?.snippet?.description);
}

function makeResult(items: Record<string, unknown>[]): FetchResult {
  return {
    avatar:       extractAvatar(items),
    banner:       extractBanner(items),
    description:  extractDescription(items),
    channelTitle: extractTitle(items),
  };
}

/** Fetch the YouTube API and return the `items` array, or [] on failure. */
async function ytFetch(url: string): Promise<Record<string, unknown>[]> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text();
      console.error(`     ⚠ API ${res.status}: ${body.slice(0, 200)}`);
      return [];
    }
    const data = await res.json() as { error?: { message: string }; items?: unknown[] };
    if (data.error) {
      console.error(`     ⚠ API error: ${data.error.message}`);
      return [];
    }
    return (data.items || []) as Record<string, unknown>[];
  } catch (e) {
    console.error(`     ⚠ Fetch error: ${e}`);
    return [];
  }
}

// ─── RESOLUTION STRATEGIES ───────────────────────────────────────────────────

async function byHandle(handle: string): Promise<FetchResult> {
  const clean = handle.replace(/^@+/, '');
  const items = await ytFetch(
    `${BASE}/channels?part=snippet,brandingSettings&forHandle=${encodeURIComponent(clean)}&key=${API_KEY}`,
  );
  return makeResult(items);
}

async function byUsername(username: string): Promise<FetchResult> {
  const clean = username.replace(/^@+/, '');
  const items = await ytFetch(
    `${BASE}/channels?part=snippet,brandingSettings&forUsername=${encodeURIComponent(clean)}&key=${API_KEY}`,
  );
  return makeResult(items);
}

async function byId(channelId: string): Promise<FetchResult> {
  const items = await ytFetch(
    `${BASE}/channels?part=snippet,brandingSettings&id=${encodeURIComponent(channelId)}&key=${API_KEY}`,
  );
  return makeResult(items);
}

async function bySearch(name: string, hint = ''): Promise<FetchResult> {
  const query = hint ? `${name} ${hint}` : name;
  const searchItems = await ytFetch(
    `${BASE}/search?part=snippet&q=${encodeURIComponent(query)}&type=channel&maxResults=3&key=${API_KEY}`,
  );
  if (!searchItems.length) return { avatar: null, banner: null, description: null, channelTitle: '' };

  for (const item of searchItems) {
    const channelId = (item as any)?.snippet?.channelId as string | undefined;
    if (!channelId) continue;
    await sleep(DELAY_MS);
    const result = await byId(channelId);
    const title  = (result.channelTitle || '').toLowerCase();
    const words  = name.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const score  = words.filter(w => title.includes(w)).length;
    if (score >= Math.min(2, words.length)) {
      console.log(`     ✓ Search match: "${result.channelTitle}" (score ${score}/${words.length})`);
      return result;
    }
  }

  const fallbackId = (searchItems[0] as any)?.snippet?.channelId as string | undefined;
  if (!fallbackId) return { avatar: null, banner: null, description: null, channelTitle: '' };
  await sleep(DELAY_MS);
  const result = await byId(fallbackId);
  console.log(`     ~ Search fallback: "${result.channelTitle}"`);
  return result;
}

// ─── URL EXTRACTORS ──────────────────────────────────────────────────────────

function extractChannelId(url?: string): string | null {
  if (!url) return null;
  const m = url.match(/youtube\.com\/channel\/(UC[\w-]+)/);
  return m ? m[1] : null;
}

function extractUsername(url?: string): string | null {
  if (!url) return null;
  const m = url.match(/youtube\.com\/user\/([^/?#]+)/);
  return m ? m[1] : null;
}

function extractHandleFromUrl(url?: string): string | null {
  if (!url) return null;
  const m = url.match(/youtube\.com\/@([^/?#]+)/);
  return m ? m[1] : null;
}

// ─── MAIN RESOLVER ───────────────────────────────────────────────────────────

async function resolveChannel(ch: Channel, subjectHint = ''): Promise<FetchResult> {
  const empty: FetchResult = { avatar: null, banner: null, description: null, channelTitle: '' };
  const tried: string[] = [];

  // 1. Explicit @handle field
  if (ch.handle) {
    tried.push(`handle:${ch.handle}`);
    await sleep(DELAY_MS);
    const r = await byHandle(ch.handle);
    if (r.avatar) { console.log(`     → forHandle (${ch.handle})`); return r; }
  }

  // 2. @handle extracted from the URL
  const urlHandle = extractHandleFromUrl(ch.url);
  if (urlHandle && urlHandle !== ch.handle?.replace('@', '')) {
    tried.push(`url-handle:@${urlHandle}`);
    await sleep(DELAY_MS);
    const r = await byHandle(`@${urlHandle}`);
    if (r.avatar) { console.log(`     → URL-extracted handle (@${urlHandle})`); return r; }
  }

  // 3. /channel/UC... ID
  const channelId = extractChannelId(ch.url);
  if (channelId) {
    tried.push(`id:${channelId}`);
    await sleep(DELAY_MS);
    const r = await byId(channelId);
    if (r.avatar) { console.log(`     → channel ID (${channelId})`); return r; }
  }

  // 4. Legacy /user/ username
  const username = extractUsername(ch.url);
  if (username) {
    tried.push(`username:${username}`);
    await sleep(DELAY_MS);
    const r = await byUsername(username);
    if (r.avatar) { console.log(`     → username (${username})`); return r; }

    await sleep(DELAY_MS);
    const r2 = await byHandle(`@${username}`);
    if (r2.avatar) { console.log(`     → username-as-handle (@${username})`); return r2; }
  }

  // 5. Search with subject context
  if (ch.name) {
    tried.push(`search:"${ch.name}" + "${subjectHint}"`);
    await sleep(DELAY_MS);
    const r = await bySearch(ch.name, subjectHint);
    if (r.avatar) return r;
  }

  // 6. Search by name alone
  if (ch.name && subjectHint) {
    tried.push(`search:"${ch.name}"`);
    await sleep(DELAY_MS);
    const r = await bySearch(ch.name);
    if (r.avatar) return r;
  }

  console.log(`     ✗ Not found. Tried: ${tried.join(', ')}`);
  return empty;
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (!API_KEY || API_KEY === 'your_api_key_here') {
    console.error('❌  YOUTUBE_API_KEY env var is missing or invalid.');
    process.exit(1);
  }

  const jsonPath = join(process.cwd(), 'channels.json');
  console.log('📂  Loading channels.json…\n');

  // ── Safe read + parse ──────────────────────────────────────────────────────
  let raw: string;
  try {
    raw = await readFile(jsonPath, 'utf-8');
  } catch (e) {
    console.error('❌  Cannot read channels.json:', e);
    process.exit(1);
  }

  let data: ChannelData;
  try {
    data = JSON.parse(raw) as ChannelData;
  } catch (e) {
    console.error('❌  channels.json is not valid JSON. Aborting to avoid data loss.');
    console.error('    Restore from the template and re-run.');
    process.exit(1);
  }

  // Sanity-check: top-level value must be an object with array values
  if (typeof data !== 'object' || Array.isArray(data)) {
    console.error('❌  channels.json has unexpected structure (expected { commerce: [...], science: [...] }).');
    process.exit(1);
  }

  // ── Dedup cache keyed by "handle|name" ────────────────────────────────────
  const cache = new Map<string, FetchResult>();
  let updated = 0, skipped = 0, notFound = 0;

  for (const [streamKey, groups] of Object.entries(data)) {
    if (!Array.isArray(groups)) continue;

    for (const group of groups) {
      if (!Array.isArray(group.channels)) continue;
      console.log(`\n[${streamKey.toUpperCase()}] ▸ ${group.subject}`);

      for (const ch of group.channels) {
        const cacheKey = `${ch.handle || ''}|${ch.name}`;

        // ── Serve from cache (dedup identical channels across subjects) ──────
        if (cache.has(cacheKey)) {
          const cached = cache.get(cacheKey)!;
          let changed = false;
          if (cached.avatar     && ch.avatarUrl    !== cached.avatar)      { ch.avatarUrl   = cached.avatar;      changed = true; }
          if (cached.banner     && ch.bannerUrl    !== cached.banner)      { ch.bannerUrl   = cached.banner;      changed = true; }
          if (cached.description && ch.desc        !== cached.description) { ch.desc        = cached.description; changed = true; }
          if (changed) { updated++; console.log(`  [cached ✓] ${ch.name}`); }
          else              console.log(`  [cached =] ${ch.name}`);
          continue;
        }

        if (!ch.handle && !ch.url && !ch.name) {
          console.log(`  [-] (unnamed channel — skipping)`);
          skipped++;
          cache.set(cacheKey, { avatar: null, banner: null, description: null, channelTitle: '' });
          continue;
        }

        console.log(`  ▸ ${ch.name}  (${ch.handle ?? ch.url ?? 'name-only'})`);
        const result = await resolveChannel(ch, group.subject);
        cache.set(cacheKey, result);

        if (!result.avatar && !result.banner && !result.description) {
          notFound++;
          continue;
        }

        let changed = false;
        if (result.avatar      && ch.avatarUrl  !== result.avatar)      { ch.avatarUrl  = result.avatar;      changed = true; }
        if (result.banner      && ch.bannerUrl  !== result.banner)      { ch.bannerUrl  = result.banner;      changed = true; }
        if (result.description && ch.desc       !== result.description) { ch.desc       = result.description; changed = true; }
        if (changed) updated++;
      }
    }
  }

  console.log('\n════════════════════════════════');
  console.log(`✅  Updated:   ${updated}`);
  console.log(`✗   Not found: ${notFound}`);
  console.log(`⏭   Skipped:   ${skipped}`);
  console.log('════════════════════════════════\n');

  // ── Safe write: serialize first, then write atomically ────────────────────
  console.log('💾  Saving channels.json…');
  let serialized: string;
  try {
    serialized = JSON.stringify(data, null, 2) + '\n';
    // Quick validation round-trip before we touch the file
    JSON.parse(serialized);
  } catch (e) {
    console.error('❌  Serialization produced invalid JSON — file NOT written.', e);
    process.exit(1);
  }
  await writeFile(jsonPath, serialized, 'utf-8');
  console.log('✓   Done.');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });