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

async function fetchYoutubeImages(handle: string): Promise<{ avatar: string | null; banner: string | null }> {
  const apiKey = process.env.YOUTUBE_API_KEY;

  if (!apiKey || apiKey === 'your_api_key_here') {
    console.error('  [!] YOUTUBE_API_KEY is missing.');
    return { avatar: null, banner: null };
  }

  const cleanHandle = handle.startsWith('@') ? handle.substring(1) : handle;

  // Try forHandle first
  const url = `https://youtube.googleapis.com/youtube/v3/channels?part=snippet,brandingSettings&forHandle=${cleanHandle}&key=${apiKey}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`  [!] HTTP ${res.status} for handle: ${handle}`);
      return { avatar: null, banner: null };
    }

    const data = await res.json();

    if (data.error) {
      console.error(`  [!] API error for ${handle}:`, data.error.message);
      return { avatar: null, banner: null };
    }

    if (!data.items || data.items.length === 0) {
      console.warn(`  [!] No channel found for: @${cleanHandle}`);
      return { avatar: null, banner: null };
    }

    const ch = data.items[0];
    const avatar =
      ch.snippet?.thumbnails?.high?.url ||
      ch.snippet?.thumbnails?.medium?.url ||
      ch.snippet?.thumbnails?.default?.url ||
      null;

    let banner = ch.brandingSettings?.image?.bannerExternalUrl || null;
    if (banner) {
      banner = `${banner}=w2120-fcrop64=1,00005a57ffffa5a8-k-c0xffffffff-no-nd-rj`;
    }

    console.log(`  [✓] Found: ${ch.snippet?.title} | avatar: ${avatar ? 'yes' : 'no'} | banner: ${banner ? 'yes' : 'no'}`);
    return { avatar, banner };
  } catch (error) {
    console.error(`  [✗] Fetch failed for ${handle}:`, error);
    return { avatar: null, banner: null };
  }
}

async function main() {
  const jsonPath = join(process.cwd(), 'channels.json');

  console.log('Loading channels.json...');
  const rawData = await readFile(jsonPath, 'utf-8');
  const data: ChannelData = JSON.parse(rawData);

  let updatedCount = 0;
  let skippedCount = 0;
  let notFoundCount = 0;

  for (const streamKey of Object.keys(data)) {
    const stream = data[streamKey];
    if (!stream) continue;

    for (const group of stream) {
      console.log(`\n[${streamKey.toUpperCase()}] ${group.subject}`);

      for (const channel of group.channels) {
        if (!channel.handle) {
          console.log(`  [-] ${channel.name}: no handle, skipping`);
          skippedCount++;
          continue;
        }

        console.log(`  Fetching: ${channel.name} (${channel.handle})`);
        const { avatar, banner } = await fetchYoutubeImages(channel.handle);

        if (!avatar && !banner) {
          notFoundCount++;
          continue;
        }

        let modified = false;

        if (avatar && channel.avatarUrl !== avatar) {
          channel.avatarUrl = avatar;
          modified = true;
        }

        if (banner && channel.bannerUrl !== banner) {
          channel.bannerUrl = banner;
          modified = true;
        }

        if (modified) updatedCount++;

        // Rate limit: 200ms between requests
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
  }

  console.log(`\n=============================`);
  console.log(`Updated:   ${updatedCount} channels`);
  console.log(`Not found: ${notFoundCount} channels`);
  console.log(`Skipped:   ${skippedCount} channels (no handle)`);
  console.log(`=============================`);

  if (updatedCount > 0) {
    console.log('\nSaving channels.json...');
    await writeFile(jsonPath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
    console.log('✓ Saved successfully.');
  } else {
    console.log('\nNo changes to save.');
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});