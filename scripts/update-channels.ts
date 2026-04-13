import 'dotenv/config';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';

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
  commerce?: SubjectGroup[];
  science?: SubjectGroup[];
  humanities?: SubjectGroup[];
  [key: string]: SubjectGroup[] | undefined;
}

interface FetchResult {
  avatar: string | null;
  banner: string | null;
}

const API_KEY = process.env.YOUTUBE_API_KEY;
const BASE = 'https://youtube.googleapis.com/youtube/v3';

/** Sleep to avoid quota hammering */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Extract channel ID from a YouTube URL */
function extractChannelIdFromUrl(url?: string): string | null {
  if (!url) return null;
  const m = url.match(/youtube\.com\/channel\/(UC[\w-]+)/);
  return m ? m[1] : null;
}

/** Try fetching by forHandle (strips leading @) */
async function fetchByHandle(handle: string): Promise<FetchResult> {
  const clean = handle.replace(/^@/, '');
  const url = `${BASE}/channels?part=snippet,brandingSettings&forHandle=${encodeURIComponent(clean)}&key=${API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) return { avatar: null, banner: null };
  const data = await res.json();
  return extractFromItems(data.items);
}

/** Try fetching by forUsername (legacy usernames) */
async function fetchByUsername(username: string): Promise<FetchResult> {
  const clean = username.replace(/^@/, '');
  const url = `${BASE}/channels?part=snippet,brandingSettings&forUsername=${encodeURIComponent(clean)}&key=${API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) return { avatar: null, banner: null };
  const data = await res.json();
  return extractFromItems(data.items);
}

/** Try fetching by channel ID */
async function fetchById(channelId: string): Promise<FetchResult> {
  const url = `${BASE}/channels?part=snippet,brandingSettings&id=${channelId}&key=${API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) return { avatar: null, banner: null };
  const data = await res.json();
  return extractFromItems(data.items);
}

/** Search as last resort */
async function fetchBySearch(name: string): Promise<FetchResult> {
  const url = `${BASE}/search?part=snippet&q=${encodeURIComponent(name)}&type=channel&maxResults=1&key=${API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) return { avatar: null, banner: null };
  const data = await res.json();
  if (!data.items?.length) return { avatar: null, banner: null };

  const channelId: string | undefined = data.items[0]?.snippet?.channelId;
  if (!channelId) return { avatar: null, banner: null };

  // Now fetch full channel details with the ID
  await sleep(200);
  return fetchById(channelId);
}

/** Extract avatar + banner from API items array */
function extractFromItems(items: any[]): FetchResult {
  if (!items?.length) return { avatar: null, banner: null };
  const ch = items[0];

  const avatar =
    ch.snippet?.thumbnails?.high?.url ||
    ch.snippet?.thumbnails?.medium?.url ||
    ch.snippet?.thumbnails?.default?.url ||
    null;

  let banner: string | null = ch.brandingSettings?.image?.bannerExternalUrl || null;
  if (banner) {
    banner = `${banner}=w2120-fcrop64=1,00005a57ffffa5a8-k-c0xffffffff-no-nd-rj`;
  }

  if (avatar || banner) {
    console.log(`     title: ${ch.snippet?.title ?? 'unknown'} | avatar: ${avatar ? '✓' : '✗'} | banner: ${banner ? '✓' : '✗'}`);
  }

  return { avatar, banner };
}

/** Main fetch with fallback chain: handle → username → channelId from URL → search */
async function fetchYoutubeImages(channel: Channel): Promise<FetchResult> {
  if (!API_KEY || API_KEY === 'your_api_key_here') {
    console.error('  [!] YOUTUBE_API_KEY is missing or invalid.');
    process.exit(1);
  }

  // 1. Try forHandle
  if (channel.handle) {
    const r = await fetchByHandle(channel.handle);
    if (r.avatar || r.banner) return r;
    await sleep(150);

    // 2. Try forUsername (same value, different endpoint)
    const r2 = await fetchByUsername(channel.handle);
    if (r2.avatar || r2.banner) return r2;
    await sleep(150);
  }

  // 3. Try channel ID extracted from URL
  const channelId = extractChannelIdFromUrl(channel.url);
  if (channelId) {
    const r3 = await fetchById(channelId);
    if (r3.avatar || r3.banner) return r3;
    await sleep(150);
  }

  // 4. Search by channel name as last resort
  if (channel.name) {
    console.log(`     ↳ falling back to search for: "${channel.name}"`);
    const r4 = await fetchBySearch(channel.name);
    if (r4.avatar || r4.banner) return r4;
  }

  return { avatar: null, banner: null };
}

async function main(): Promise<void> {
  if (!API_KEY || API_KEY === 'your_api_key_here') {
    console.error('❌ YOUTUBE_API_KEY env var is missing.');
    process.exit(1);
  }

  const jsonPath = join(process.cwd(), 'channels.json');
  console.log('📂 Loading channels.json...\n');
  const rawData = await readFile(jsonPath, 'utf-8');
  const data: ChannelData = JSON.parse(rawData);

  // Deduplicate channels across streams so we don't hit the API twice
  // for the same channel (e.g. Yash appears in every science subject)
  const seen = new Map<string, FetchResult>();

  let updatedCount = 0;
  let skippedCount = 0;
  let notFoundCount = 0;

  for (const streamKey of Object.keys(data)) {
    const stream = data[streamKey];
    if (!stream) continue;

    for (const group of stream) {
      console.log(`\n[${streamKey.toUpperCase()}] ${group.subject}`);

      for (const channel of group.channels) {
        const cacheKey = channel.handle ?? channel.name;

        // Use cached result for duplicate channels
        if (seen.has(cacheKey)) {
          const cached = seen.get(cacheKey)!;
          let modified = false;
          if (cached.avatar && channel.avatarUrl !== cached.avatar) {
            channel.avatarUrl = cached.avatar;
            modified = true;
          }
          if (cached.banner && channel.bannerUrl !== cached.banner) {
            channel.bannerUrl = cached.banner;
            modified = true;
          }
          if (modified) {
            updatedCount++;
            console.log(`  [cached] ${channel.name}`);
          } else {
            console.log(`  [skip-dup] ${channel.name}`);
          }
          continue;
        }

        if (!channel.handle && !channel.url) {
          console.log(`  [-] ${channel.name}: no handle or URL — skipping`);
          skippedCount++;
          seen.set(cacheKey, { avatar: null, banner: null });
          continue;
        }

        console.log(`  → ${channel.name} (${channel.handle ?? 'no handle'})`);
        const result = await fetchYoutubeImages(channel);
        seen.set(cacheKey, result);

        if (!result.avatar && !result.banner) {
          console.log(`     ✗ not found`);
          notFoundCount++;
          continue;
        }

        let modified = false;
        if (result.avatar && channel.avatarUrl !== result.avatar) {
          channel.avatarUrl = result.avatar;
          modified = true;
        }
        if (result.banner && channel.bannerUrl !== result.banner) {
          channel.bannerUrl = result.banner;
          modified = true;
        }
        if (modified) updatedCount++;

        // Respect quota: 250ms between unique API calls
        await sleep(250);
      }
    }
  }

  console.log('\n=============================');
  console.log(`✅ Updated:   ${updatedCount} channels`);
  console.log(`❓ Not found: ${notFoundCount} channels`);
  console.log(`⏭  Skipped:   ${skippedCount} channels`);
  console.log('=============================\n');

  console.log('💾 Saving channels.json...');
  await writeFile(jsonPath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  console.log('✓ Saved successfully.');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});