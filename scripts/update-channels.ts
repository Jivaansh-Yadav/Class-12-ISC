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

async function fetchYoutubeImages(handle: string): Promise<{ avatar: string | null, banner: string | null }> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  
  if (!apiKey || apiKey === 'your_api_key_here') {
    console.error("  [!] Error: YOUTUBE_API_KEY is missing or invalid in your .env file/GitHub Secrets.");
    return { avatar: null, banner: null };
  }

  const cleanHandle = handle.startsWith('@') ? handle.substring(1) : handle;
  const url = `https://youtube.googleapis.com/youtube/v3/channels?part=snippet,brandingSettings&forHandle=${cleanHandle}&key=${apiKey}`;
  
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    
    const data = await res.json();
    
    if (!data.items || data.items.length === 0) {
      console.warn(`  [!] Warning: No YouTube channel found for handle "${handle}".`);
      return { avatar: null, banner: null };
    }

    const channelData = data.items[0];
    
    const avatar = channelData.snippet?.thumbnails?.high?.url 
                || channelData.snippet?.thumbnails?.default?.url 
                || null;

    let banner = channelData.brandingSettings?.image?.bannerExternalUrl || null;
    if (banner) {
      banner = `${banner}=w2120-fcrop64=1,00005a57ffffa5a8-k-c0xffffffff-no-nd-rj`;
    }

    return { avatar, banner };
  } catch (error) {
    console.error(`  [X] API Request failed for ${handle}:`, error);
    return { avatar: null, banner: null };
  }
}

async function main() {
  const jsonPath = join(process.cwd(), 'channels.json');
  
  console.log("Loading channels.json...");
  const rawData = await readFile(jsonPath, 'utf-8');
  const data: ChannelData = JSON.parse(rawData);

  let updatedCount = 0;

  for (const streamKey of Object.keys(data)) {
    const stream = data[streamKey];
    if (!stream) continue;

    for (const group of stream) {
      for (const channel of group.channels) {
        if (!channel.handle) continue;

        console.log(`Fetching data for: ${channel.name} (${channel.handle})...`);
        const { avatar, banner } = await fetchYoutubeImages(channel.handle);

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
        
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
  }

  if (updatedCount > 0) {
    console.log(`Saving ${updatedCount} updates to channels.json...`);
    await writeFile(jsonPath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
    console.log("✨ Success! channels.json has been updated.");
  } else {
    console.log("✨ All channels are already up-to-date! No changes saved.");
  }
}

main().catch(error => {
  console.error("Fatal Error running script:", error);
  process.exit(1);
});