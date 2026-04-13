/**
 * ISC.exe — YouTube Channel Image Sync (v2)
 * ==========================================
 * Dramatically improved accuracy for finding channel avatars/banners.
 *
 * Resolution chain per channel:
 *   1. forHandle (modern @handle)
 *   2. forHandle with stripped/cleaned handle variants
 *   3. Channel ID extracted from URL (/channel/UC...)
 *   4. forUsername (legacy /user/ URLs)
 *   5. Search by channel name + subject keyword
 *   6. Search by channel name alone
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
}

interface SubjectGroup {
  subject: string;
  color: string;
  bg: string;
  icon: string;
  channels: Channel[];
}

interface ChannelData {
  [stream: string]: SubjectGroup[];
}

interface FetchResult {
  avatar: string | null;
  banner: string | null;
  channelTitle?: string;  // for verification
}

// ─── CONFIG ──────────────────────────────────────────────────────────────────

const API_KEY = process.env.YOUTUBE_API_KEY;
const BASE = 'https://youtube.googleapis.com/youtube/v3';
const DELAY_MS = 300; // between API calls — be gentle on quota

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Extract high-res avatar URL, bumping to s800 */
function extractAvatar(items: any[]): string | null {
  if (!items?.length) return null;
  const t = items[0]?.snippet?.thumbnails;
  const url = t?.high?.url || t?.medium?.url || t?.default?.url || null;
  if (!url) return null;
  // Ensure s800 resolution
  return url.replace(/=s\d+-/, '=s800-');
}

/** Extract banner URL */
function extractBanner(items: any[]): string | null {
  if (!items?.length) return null;
  let b = items[0]?.brandingSettings?.image?.bannerExternalUrl || null;
  if (b) b += '=w2120-fcrop64=1,00005a57ffffa5a8-k-c0xffffffff-no-nd-rj';
  return b;
}

/** Extract channel title for name-matching verification */
function extractTitle(items: any[]): string {
  return items?.[0]?.snippet?.title || '';
}

function makeResult(items: any[]): FetchResult {
  return {
    avatar: extractAvatar(items),
    banner: extractBanner(items),
    channelTitle: extractTitle(items),
  };
}

/** Fetch and parse YouTube API response */
async function ytFetch(url: string): Promise<any[]> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text();
      console.error(`     ⚠ API error ${res.status}: ${body.slice(0, 200)}`);
      return [];
    }
    const data = await res.json();
    if (data.error) {
      console.error(`     ⚠ API error: ${data.error.message}`);
      return [];
    }
    return data.items || [];
  } catch (e) {
    console.error(`     ⚠ Fetch error: ${e}`);
    return [];
  }
}

// ─── RESOLUTION STRATEGIES ───────────────────────────────────────────────────

/** Try YouTube's forHandle endpoint */
async function byHandle(handle: string): Promise<FetchResult> {
  const clean = handle.replace(/^@+/, '');
  const items = await ytFetch(
    `${BASE}/channels?part=snippet,brandingSettings&forHandle=${encodeURIComponent(clean)}&key=${API_KEY}`
  );
  return makeResult(items);
}

/** Try YouTube's forUsername endpoint (legacy) */
async function byUsername(username: string): Promise<FetchResult> {
  const clean = username.replace(/^@+/, '');
  const items = await ytFetch(
    `${BASE}/channels?part=snippet,brandingSettings&forUsername=${encodeURIComponent(clean)}&key=${API_KEY}`
  );
  return makeResult(items);
}

/** Fetch by explicit channel ID */
async function byId(channelId: string): Promise<FetchResult> {
  const items = await ytFetch(
    `${BASE}/channels?part=snippet,brandingSettings&id=${encodeURIComponent(channelId)}&key=${API_KEY}`
  );
  return makeResult(items);
}

/**
 * Search YouTube for a channel — returns top candidate.
 * Uses name + optional subject hint for better accuracy.
 */
async function bySearch(name: string, hint = ''): Promise<FetchResult> {
  const query = hint ? `${name} ${hint}` : name;
  const searchItems = await ytFetch(
    `${BASE}/search?part=snippet&q=${encodeURIComponent(query)}&type=channel&maxResults=3&key=${API_KEY}`
  );
  if (!searchItems.length) return { avatar: null, banner: null };

  // Try to find the best match by checking channel title similarity
  for (const item of searchItems) {
    const channelId = item?.snippet?.channelId;
    if (!channelId) continue;
    await sleep(DELAY_MS);
    const result = await byId(channelId);
    // If the title roughly matches the channel name we're looking for, use it
    const title = (result.channelTitle || '').toLowerCase();
    const nameLower = name.toLowerCase();
    const words = nameLower.split(/\s+/).filter(w => w.length > 2);
    const matchScore = words.filter(w => title.includes(w)).length;
    if (matchScore >= Math.min(2, words.length)) {
      console.log(`     ✓ Search match: "${result.channelTitle}" (score ${matchScore}/${words.length})`);
      return result;
    }
  }

  // Fall back to first result if no good match
  const channelId = searchItems[0]?.snippet?.channelId;
  if (!channelId) return { avatar: null, banner: null };
  await sleep(DELAY_MS);
  const result = await byId(channelId);
  console.log(`     ~ Search fallback: "${result.channelTitle}"`);
  return result;
}

/** Extract a /channel/UC... ID from any YouTube URL */
function extractChannelId(url?: string): string | null {
  if (!url) return null;
  const m = url.match(/youtube\.com\/channel\/(UC[\w-]+)/);
  return m ? m[1] : null;
}

/** Extract /user/... from a YouTube URL */
function extractUsername(url?: string): string | null {
  if (!url) return null;
  const m = url.match(/youtube\.com\/user\/([^/?#]+)/);
  return m ? m[1] : null;
}

/** Extract @handle from a URL like youtube.com/@handle */
function extractHandleFromUrl(url?: string): string | null {
  if (!url) return null;
  const m = url.match(/youtube\.com\/@([^/?#]+)/);
  return m ? m[1] : null;
}

// ─── MAIN RESOLVER ───────────────────────────────────────────────────────────

/**
 * Full resolution chain for a single channel.
 * Tries multiple strategies in order of reliability.
 */
async function resolveChannel(ch: Channel, subjectHint = ''): Promise<FetchResult> {
  const tried: string[] = [];

  // Strategy 1: forHandle with the explicit handle field
  if (ch.handle) {
    tried.push(`handle:${ch.handle}`);
    await sleep(DELAY_MS);
    const r = await byHandle(ch.handle);
    if (r.avatar) { console.log(`     → Found via forHandle (${ch.handle})`); return r; }
  }

  // Strategy 2: Handle extracted from the URL
  const urlHandle = extractHandleFromUrl(ch.url);
  if (urlHandle && urlHandle !== ch.handle?.replace('@', '')) {
    const handleToTry = `@${urlHandle}`;
    tried.push(`url-handle:${handleToTry}`);
    await sleep(DELAY_MS);
    const r = await byHandle(handleToTry);
    if (r.avatar) { console.log(`     → Found via URL-extracted handle (@${urlHandle})`); return r; }
  }

  // Strategy 3: Channel ID from URL
  const channelId = extractChannelId(ch.url);
  if (channelId) {
    tried.push(`id:${channelId}`);
    await sleep(DELAY_MS);
    const r = await byId(channelId);
    if (r.avatar) { console.log(`     → Found via channel ID (${channelId})`); return r; }
  }

  // Strategy 4: Legacy username from /user/ URL
  const username = extractUsername(ch.url);
  if (username) {
    tried.push(`username:${username}`);
    await sleep(DELAY_MS);
    const r = await byUsername(username);
    if (r.avatar) { console.log(`     → Found via username (${username})`); return r; }

    // Also try it as a handle
    await sleep(DELAY_MS);
    const r2 = await byHandle(`@${username}`);
    if (r2.avatar) { console.log(`     → Found via username-as-handle (@${username})`); return r2; }
  }

  // Strategy 5: Search with subject context
  if (ch.name) {
    tried.push(`search:"${ch.name}" + "${subjectHint}"`);
    await sleep(DELAY_MS);
    const r = await bySearch(ch.name, subjectHint);
    if (r.avatar) { return r; }
  }

  // Strategy 6: Search by name alone (no subject hint)
  if (ch.name && subjectHint) {
    tried.push(`search:"${ch.name}"`);
    await sleep(DELAY_MS);
    const r = await bySearch(ch.name);
    if (r.avatar) { return r; }
  }

  console.log(`     ✗ Not found. Tried: ${tried.join(', ')}`);
  return { avatar: null, banner: null };
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (!API_KEY || API_KEY === 'your_api_key_here') {
    console.error('❌  YOUTUBE_API_KEY env var is missing or invalid.');
    process.exit(1);
  }

  const jsonPath = join(process.cwd(), 'channels.json');
  console.log('📂 Loading channels.json…\n');
  const raw = await readFile(jsonPath, 'utf-8');
  const data: ChannelData = JSON.parse(raw);

  /**
   * Dedup cache — keyed by "handle|name" so duplicate channels
   * (e.g. Yash appearing in Physics, Chemistry, Bio, Maths) are
   * only fetched once from the API.
   */
  const cache = new Map<string, FetchResult>();

  let updated = 0, skipped = 0, notFound = 0;

  for (const [streamKey, groups] of Object.entries(data)) {
    for (const group of groups) {
      console.log(`\n[${streamKey.toUpperCase()}] ▸ ${group.subject}`);

      for (const ch of group.channels) {
        const cacheKey = (ch.handle || '') + '|' + ch.name;

        // Serve from cache for duplicate channels
        if (cache.has(cacheKey)) {
          const cached = cache.get(cacheKey)!;
          if (cached.avatar || cached.banner) {
            let changed = false;
            if (cached.avatar && ch.avatarUrl !== cached.avatar) { ch.avatarUrl = cached.avatar; changed = true; }
            if (cached.banner && ch.bannerUrl !== cached.banner) { ch.bannerUrl = cached.banner; changed = true; }
            if (changed) { updated++; console.log(`  [cached ✓] ${ch.name}`); }
            else console.log(`  [cached =] ${ch.name}`);
          } else {
            console.log(`  [cached ✗] ${ch.name}`);
          }
          continue;
        }

        // Skip channels with no handle and no URL
        if (!ch.handle && !ch.url && !ch.name) {
          console.log(`  [-] ${ch.name}: nothing to search with`);
          skipped++;
          cache.set(cacheKey, { avatar: null, banner: null });
          continue;
        }

        console.log(`  ▸ ${ch.name}  (${ch.handle ?? ch.url ?? 'name only'})`);
        const result = await resolveChannel(ch, group.subject);
        cache.set(cacheKey, result);

        if (!result.avatar && !result.banner) {
          notFound++;
          continue;
        }

        let changed = false;
        if (result.avatar && ch.avatarUrl !== result.avatar) { ch.avatarUrl = result.avatar; changed = true; }
        if (result.banner && ch.bannerUrl !== result.banner) { ch.bannerUrl = result.banner; changed = true; }
        if (changed) updated++;
      }
    }
  }

  console.log('\n════════════════════════════════');
  console.log(`✅  Updated:   ${updated}`);
  console.log(`✗   Not found: ${notFound}`);
  console.log(`⏭   Skipped:   ${skipped}`);
  console.log('════════════════════════════════\n');

  console.log('💾 Saving channels.json…');
  await writeFile(jsonPath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  console.log('✓  Done.');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });