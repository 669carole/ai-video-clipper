import { execFile } from 'child_process';

const videoUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const ytDlpPath = '/home/gc/node-v22/bin/yt-dlp';
const nodePath = '/home/gc/node-v22/bin/node';

console.log("Spawning yt-dlp to fetch JSON metadata...");
execFile(ytDlpPath, [
  '--js-runtimes', `node:${nodePath}`,
  '-j',
  videoUrl
], { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
  if (err) {
    console.error("Error executing yt-dlp:", err);
    return;
  }
  
  try {
    const metadata = JSON.parse(stdout);
    console.log("Successfully parsed JSON!");
    console.log("Title:", metadata.title);
    console.log("Duration (sec):", metadata.duration);
    console.log("Formats count:", metadata.formats?.length || 0);
    
    // Check first 3 formats with URLs
    const formatsWithUrl = metadata.formats?.filter(f => f.url);
    console.log("Formats with URL count:", formatsWithUrl?.length || 0);
    
    if (formatsWithUrl && formatsWithUrl.length > 0) {
      console.log("Sample formats details:");
      for (const f of formatsWithUrl.slice(0, 3)) {
        console.log(`- itag: ${f.format_id}, ext: ${f.ext}, resolution: ${f.resolution}, acodec: ${f.acodec}, vcodec: ${f.vcodec}`);
        console.log(`  URL starts with: ${f.url.substring(0, 100)}...`);
      }
    }
  } catch (parseErr) {
    console.error("JSON parsing error:", parseErr);
  }
});
