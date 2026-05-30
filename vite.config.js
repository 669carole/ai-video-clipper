import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { execFile } from 'child_process';
import { request as requestHttps } from 'https';
import { request as requestHttp } from 'http';
import { URL } from 'url';
import { existsSync } from 'fs';

// Define binary paths with local fallbacks
const localYtDlp = '/home/gc/node-v22/bin/yt-dlp';
const localNode = '/home/gc/node-v22/bin/node';

const ytDlpPath = existsSync(localYtDlp) ? localYtDlp : 'yt-dlp';
const nodePath = existsSync(localNode) ? localNode : 'node';

// Helper to extract YouTube video ID from URL supporting Shorts, Live, Music, Share, Embed, and raw IDs
function extractVideoId(url) {
  if (!url) return null;
  const cleanUrl = url.trim();
  
  if (/^[a-zA-Z0-9_-]{11}$/.test(cleanUrl)) {
    return cleanUrl;
  }
  
  try {
    const regExp = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts|live)\/|presentation\/|watch\?.*v=|embed\/|watch\?.*\&v=)|youtu\.be\/|music\.youtube\.com\/watch\?.*v=)([a-zA-Z0-9_-]{11})/;
    const match = cleanUrl.match(regExp);
    if (match && match[1] && match[1].length === 11) {
      return match[1];
    }
  } catch (e) {}
  
  const backupRegex = /(?:\/|=)([a-zA-Z0-9_-]{11})(?:[?&]|$)/;
  const backupMatch = cleanUrl.match(backupRegex);
  if (backupMatch && backupMatch[1] && backupMatch[1].length === 11) {
    return backupMatch[1];
  }
  
  return null;
}

// Simple WebVTT/SRT subtitle parser
function parseWebVttOrSrt(text) {
  const list = [];
  if (!text) return list;
  const lines = text.replace(/\r/g, '').split('\n');
  let currentStart = null;
  let currentEnd = null;
  let currentTextParts = [];
  
  function parseTimestampToSeconds(ts) {
    if (!ts) return 0;
    const cleanTs = ts.replace(',', '.');
    const parts = cleanTs.split(':');
    let secs = 0;
    if (parts.length === 3) {
      secs = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2]);
    } else if (parts.length === 2) {
      secs = parseInt(parts[0]) * 60 + parseFloat(parts[1]);
    }
    return secs;
  }
  
  for (let line of lines) {
    line = line.trim();
    if (line.includes('-->')) {
      if (currentStart !== null && currentTextParts.length > 0) {
        list.push({
          start: currentStart,
          duration: Math.max(0.1, currentEnd - currentStart),
          text: currentTextParts.join(' ')
        });
      }
      currentTextParts = [];
      const parts = line.split('-->').map(p => p.trim());
      currentStart = parseTimestampToSeconds(parts[0]);
      currentEnd = parseTimestampToSeconds(parts[1]);
    } else if (line === '' || /^\d+$/.test(line) || line.startsWith('WEBVTT')) {
      continue;
    } else {
      if (currentStart !== null) {
        const cleanLine = line.replace(/<\/?[^>]+(>|$)/g, "");
        if (cleanLine) {
          currentTextParts.push(cleanLine);
        }
      }
    }
  }
  if (currentStart !== null && currentTextParts.length > 0) {
    list.push({
      start: currentStart,
      duration: Math.max(0.1, currentEnd - currentStart),
      text: currentTextParts.join(' ')
    });
  }
  return list;
}

// Invidious API metadata fetcher fallback (high-speed parallel racing over stable instances)
async function fetchInvidiousMetadata(videoId) {
  // A pool of stable public Invidious instances to query immediately in parallel.
  // This bypasses api.invidious.io which may be blocked by the cloud egress firewall.
  const candidates = [
    'https://inv.thepixora.com',
    'https://invidious.nerdvpn.de',
    'https://yewtu.be',
    'https://invidious.f5.si',
    'https://yt.chocolatemoo53.com',
    'https://inv.nadeko.net',
    'https://invidious.tiekoetter.com',
    'https://invidious.flokinet.to',
    'https://invidious.privacydev.net',
    'https://invidious.projectsegfau.lt',
    'https://invidious.lunar.icu',
    'https://invidious.slipfox.xyz'
  ];
  
  console.log(`Running parallel race across ${candidates.length} Invidious instances for video: ${videoId}`);
  
  // Create parallel fetch promises
  const fetchPromises = candidates.map(async (baseUri) => {
    const url = `${baseUri}/api/v1/videos/${videoId}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4500); // 4.5s timeout per request
    
    try {
      const res = await fetch(url, { 
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
        }
      });
      clearTimeout(timeoutId);
      
      if (res.status === 200) {
        try {
          const videoData = await res.json();
          if (videoData && videoData.title) {
            console.log(`Fallback Race Winner: ${baseUri} responded first!`);
            return { videoData, baseUri };
          }
        } catch (jsonErr) {
          // not json
        }
      }
    } catch (e) {
      // Fail silently so other instances can win
    }
    throw new Error(`Failed to fetch from ${baseUri}`);
  });
  
  try {
    // Promise.any resolves as soon as one fetch succeeds
    const winner = await Promise.any(fetchPromises);
    return winner;
  } catch (err) {
    console.error("fetchInvidiousMetadata parallel race failed for all candidates:", err.message);
  }
  return null;
}

function proxyStream(targetUrl, req, res, depth = 0) {
  if (depth > 5) {
    res.statusCode = 500;
    res.end('Too many redirects');
    return;
  }

  try {
    const urlObj = new URL(targetUrl);
    const requestLib = targetUrl.startsWith('https') ? requestHttps : requestHttp;

    const headers = { ...req.headers };
    delete headers.host;
    delete headers.referer;
    delete headers.origin;
    headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    headers['Referer'] = 'https://www.youtube.com/';

    // Forward range requests correctly
    if (req.headers.range) {
      headers['Range'] = req.headers.range;
    }

    const ytReq = requestLib(targetUrl, {
      method: req.method || 'GET',
      headers: headers
    }, (ytRes) => {
      const statusCode = ytRes.statusCode || 200;
      
      // Check for redirects
      if ([301, 302, 303, 307, 308].includes(statusCode) && ytRes.headers.location) {
        const nextUrl = new URL(ytRes.headers.location, targetUrl).toString();
        proxyStream(nextUrl, req, res, depth + 1);
        return;
      }

      // Set CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');

      const resHeaders = { ...ytRes.headers };
      delete resHeaders['set-cookie'];
      
      res.writeHead(statusCode, resHeaders);
      ytRes.pipe(res);
    });

    ytReq.on('error', (err) => {
      console.error("Proxy stream error:", err);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end('Proxy streaming error');
      }
    });

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      req.pipe(ytReq);
    } else {
      ytReq.end();
    }
  } catch (e) {
    console.error("Proxy stream exception:", e);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.end('Internal proxy exception');
    }
  }
}

function setupYoutubeProxy(middlewares) {
  middlewares.use(async (req, res, next) => {
    try {
      const urlObj = new URL(req.url || '', 'http://localhost');
      
      // 1. Video Info Endpoint
      if (urlObj.pathname === '/api/youtube/info') {
        const videoUrl = urlObj.searchParams.get('url');
        if (!videoUrl) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Missing url parameter' }));
          return;
        }
        
        execFile(ytDlpPath, [
          '--js-runtimes', `node:${nodePath}`,
          '-j',
          videoUrl
        ], { maxBuffer: 15 * 1024 * 1024 }, async (err, stdout, stderr) => {
          if (err) {
            console.warn("yt-dlp failed, attempting Invidious fallback. Error:", err.message);
            const videoId = extractVideoId(videoUrl);
            if (!videoId) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'yt-dlp failed and no valid video ID extracted for fallback', details: err.message }));
              return;
            }
            
            const fallbackResult = await fetchInvidiousMetadata(videoId);
            if (!fallbackResult) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'All extraction methods failed (yt-dlp and Invidious fallback)', details: err.message }));
              return;
            }
            
            const { videoData, baseUri } = fallbackResult;
            
            // Map thumbnails
            let thumbnail = '';
            if (videoData.videoThumbnails && videoData.videoThumbnails.length > 0) {
              const thumb = videoData.videoThumbnails.find(t => t.quality === 'medium') || videoData.videoThumbnails[0];
              thumbnail = thumb.url;
            }
            
            // Map formats
            const formats = [];
            
            // Helper to rewrite googlevideo URLs to the winning Invidious proxy URL
            const rewriteToProxy = (rawUrl) => {
              if (rawUrl && rawUrl.includes('googlevideo.com/videoplayback')) {
                try {
                  const gvUrl = new URL(rawUrl);
                  return `${baseUri}/videoplayback${gvUrl.search}`;
                } catch (e) {}
              }
              return rawUrl;
            };
            
            // 1. Format streams (combined video + audio)
            if (videoData.formatStreams) {
              for (const f of videoData.formatStreams) {
                let width = undefined, height = undefined;
                if (f.size) {
                  const parts = f.size.split('x');
                  width = parseInt(parts[0]);
                  height = parseInt(parts[1]);
                }
                const rewrittenUrl = rewriteToProxy(f.url);
                const proxiedUrl = `/api/youtube/stream?url=${encodeURIComponent(rewrittenUrl)}`;
                formats.push({
                  id: f.itag,
                  ext: f.container || 'mp4',
                  url: proxiedUrl,
                  rawUrl: rewrittenUrl,
                  resolution: f.resolution || f.qualityLabel || (height ? `${height}p` : undefined),
                  width: width,
                  height: height,
                  fps: f.fps || 30,
                  vcodec: 'h264',
                  acodec: 'aac',
                  filesize: f.clen ? parseInt(f.clen) : undefined
                });
              }
            }
            
            // 2. Adaptive formats (separate video and audio streams)
            if (videoData.adaptiveFormats) {
              for (const f of videoData.adaptiveFormats) {
                let width = undefined, height = undefined;
                if (f.size) {
                  const parts = f.size.split('x');
                  width = parseInt(parts[0]);
                  height = parseInt(parts[1]);
                }
                
                let vcodec = 'none', acodec = 'none';
                if (f.type) {
                  if (f.type.includes('video')) {
                    const match = f.type.match(/codecs="([^"]+)"/);
                    vcodec = match ? match[1].split(',')[0].trim() : 'yes';
                    acodec = 'none';
                  } else if (f.type.includes('audio')) {
                    acodec = 'yes';
                    vcodec = 'none';
                  }
                }
                
                const rewrittenUrl = rewriteToProxy(f.url);
                const proxiedUrl = `/api/youtube/stream?url=${encodeURIComponent(rewrittenUrl)}`;
                formats.push({
                  id: f.itag,
                  ext: f.container || 'mp4',
                  url: proxiedUrl,
                  rawUrl: rewrittenUrl,
                  resolution: f.resolution || f.qualityLabel || (height ? `${height}p` : undefined),
                  width: width,
                  height: height,
                  fps: f.fps || 30,
                  vcodec: vcodec,
                  acodec: acodec,
                  filesize: f.clen ? parseInt(f.clen) : undefined
                });
              }
            }
            
            // Fetch captions if available
            let captions = [];
            const enCap = videoData.captions?.find(c => c.language_code === 'en' || c.label.toLowerCase().includes('english'));
            if (enCap && enCap.url) {
              try {
                const capUrl = `${baseUri}${enCap.url}`;
                const capRes = await fetch(capUrl);
                if (capRes.status === 200) {
                  const capText = await capRes.text();
                  if (capText && capText.length > 0) {
                    captions = parseWebVttOrSrt(capText);
                  }
                }
              } catch (capErr) {
                console.error("Failed to fetch fallback captions:", capErr);
              }
            }
            
            const responseData = {
              id: videoData.videoId,
              title: videoData.title,
              description: videoData.description || '',
              duration: videoData.lengthSeconds || 0,
              thumbnail: thumbnail,
              channel: videoData.author || '',
              viewCount: videoData.viewCount || 0,
              uploadDate: videoData.publishedText || '',
              formats: formats,
              captions: captions
            };
            
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.end(JSON.stringify(responseData));
            return;
          }
          
          try {
            const metadata = JSON.parse(stdout);
            
            // Fetch captions if available
            let captions = [];
            const enCaps = metadata.automatic_captions?.en || metadata.subtitles?.en;
            if (enCaps) {
              const json3Cap = enCaps.find(c => c.ext === 'json3');
              if (json3Cap) {
                try {
                  const capRes = await fetch(json3Cap.url);
                  const capData = await capRes.json();
                  if (capData.events) {
                    captions = capData.events
                      .filter(e => e.segs && e.segs.some(s => s.utf8.trim()))
                      .map(e => {
                        const text = e.segs.map(s => s.utf8).join('').trim();
                        return {
                          start: (e.tStartMs || 0) / 1000,
                          duration: (e.dDurationMs || 0) / 1000,
                          text: text
                        };
                      });
                  }
                } catch (capErr) {
                  console.error("Failed to fetch/parse captions:", capErr);
                }
              }
            }
            
            // Extract video formats and audio formats
            const formats = (metadata.formats || [])
              .filter(f => {
                if (!f.url) return false;
                const urlStr = f.url.toLowerCase();
                const isManifest = urlStr.includes('manifest') ||
                                   urlStr.includes('hls_playlist') ||
                                   urlStr.includes('.m3u8') ||
                                   urlStr.includes('.mpd') ||
                                   (f.protocol && f.protocol.includes('m3u8')) ||
                                   (f.protocol && f.protocol.includes('dash'));
                return !isManifest;
              })
              .map(f => {
                const proxiedUrl = `/api/youtube/stream?url=${encodeURIComponent(f.url)}`;
                return {
                  id: f.format_id,
                  ext: f.ext,
                  url: proxiedUrl,
                  rawUrl: f.url,
                  resolution: f.resolution,
                  width: f.width,
                  height: f.height,
                  fps: f.fps,
                  vcodec: f.vcodec,
                  acodec: f.acodec,
                  filesize: f.filesize || f.filesize_approx
                };
              });
            
            const responseData = {
              id: metadata.id,
              title: metadata.title,
              description: metadata.description,
              duration: metadata.duration,
              thumbnail: metadata.thumbnail || (metadata.thumbnails && metadata.thumbnails[0]?.url),
              channel: metadata.channel || metadata.uploader,
              viewCount: metadata.view_count,
              uploadDate: metadata.upload_date,
              formats: formats,
              captions: captions
            };
            
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.end(JSON.stringify(responseData));
          } catch (parseErr) {
            console.error("JSON parsing error on metadata:", parseErr);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Failed to parse metadata', details: parseErr.message }));
          }
        });
        return;
      }
      
      // 2. Video Stream Proxying Endpoint
      if (urlObj.pathname === '/api/youtube/stream') {
        if (req.method === 'OPTIONS') {
          res.statusCode = 200;
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', '*');
          res.end();
          return;
        }
        const streamUrl = urlObj.searchParams.get('url');
        if (!streamUrl) {
          res.statusCode = 400;
          res.end('Missing stream URL');
          return;
        }
        proxyStream(streamUrl, req, res);
        return;
      }

      // 3. Generic Proxy Endpoint
      if (urlObj.pathname === '/api/proxy') {
        if (req.method === 'OPTIONS') {
          res.statusCode = 200;
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', '*');
          res.end();
          return;
        }
        const targetUrl = urlObj.searchParams.get('url');
        if (!targetUrl) {
          res.statusCode = 400;
          res.end('Missing target URL');
          return;
        }
        proxyStream(targetUrl, req, res);
        return;
      }
    } catch (e) {
      console.error("Vite server middleware error:", e);
    }
    next();
  });
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'youtube-proxy',
      configureServer(server) {
        setupYoutubeProxy(server.middlewares);
      },
      configurePreviewServer(server) {
        setupYoutubeProxy(server.middlewares);
      }
    }
  ],
  server: {
    port: 5173,
    host: true,
    cors: true,
    allowedHosts: true
  },
  preview: {
    port: 5173,
    host: true,
    cors: true,
    allowedHosts: true
  }
});
