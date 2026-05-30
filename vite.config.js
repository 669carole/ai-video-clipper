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
            console.error("yt-dlp execution error:", err.message);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Failed to fetch video info', details: err.message }));
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
