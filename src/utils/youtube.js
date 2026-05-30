export function getYoutubeId(url) {
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

async function fetchInvidiousMetadataClientSide(videoId) {
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
  
  console.log(`Client-side fallback: Racing ${candidates.length} Invidious instances...`);
  
  const fetchPromises = candidates.map(async (baseUri) => {
    const url = `${baseUri}/api/v1/videos/${videoId}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout
    
    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.status === 200) {
        const videoData = await res.json();
        if (videoData && videoData.title) {
          return { videoData, baseUri };
        }
      }
    } catch (e) {}
    throw new Error(`Failed to fetch from ${baseUri}`);
  });
  
  try {
    const winner = await Promise.any(fetchPromises);
    return winner;
  } catch (err) {
    console.error("Client-side fallback failed for all candidates:", err);
  }
  return null;
}

function mapInvidiousResponse(videoData, baseUri) {
  let thumbnail = '';
  if (videoData.videoThumbnails && videoData.videoThumbnails.length > 0) {
    const thumb = videoData.videoThumbnails.find(t => t.quality === 'medium') || videoData.videoThumbnails[0];
    thumbnail = thumb.url;
  }
  
  const formats = [];
  const parseSize = (sizeStr) => {
    if (!sizeStr) return { width: undefined, height: undefined };
    const parts = sizeStr.split('x');
    return { width: parseInt(parts[0]), height: parseInt(parts[1]) };
  };
  
  if (videoData.formatStreams) {
    for (const f of videoData.formatStreams) {
      const { width, height } = parseSize(f.size);
      const proxiedUrl = `/api/youtube/stream?url=${encodeURIComponent(f.url)}`;
      formats.push({
        id: f.itag,
        ext: f.container || 'mp4',
        url: proxiedUrl,
        rawUrl: f.url,
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
  
  if (videoData.adaptiveFormats) {
    for (const f of videoData.adaptiveFormats) {
      const { width, height } = parseSize(f.size);
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
      
      const proxiedUrl = `/api/youtube/stream?url=${encodeURIComponent(f.url)}`;
      formats.push({
        id: f.itag,
        ext: f.container || 'mp4',
        url: proxiedUrl,
        rawUrl: f.url,
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
  
  const parseWebVttOrSrt = (text) => {
    const list = [];
    if (!text) return list;
    const lines = text.replace(/\r/g, '').split('\n');
    let currentStart = null;
    let currentEnd = null;
    let currentTextParts = [];
    
    const parseTimestampToSeconds = (ts) => {
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
    };
    
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
  };
  
  return {
    id: videoData.videoId,
    title: videoData.title,
    description: videoData.description || '',
    duration: videoData.lengthSeconds || 0,
    thumbnail: thumbnail,
    channel: videoData.author || '',
    viewCount: videoData.viewCount || 0,
    uploadDate: videoData.publishedText || '',
    formats: formats,
    captions: videoData.captions || [],
    baseUri: baseUri,
    parseCaptions: parseWebVttOrSrt
  };
}

export async function fetchVideoDetails(url) {
  try {
    // 1. Try backend server extraction (yt-dlp or server-side fallback)
    const response = await fetch(`/api/youtube/info?url=${encodeURIComponent(url)}`);
    if (response.ok) {
      return await response.json();
    }
  } catch (backendErr) {
    console.warn("Backend video fetch failed, proceeding to client-side fallback:", backendErr);
  }

  // 2. Client-side fallback if backend fails
  const videoId = getYoutubeId(url);
  if (!videoId) {
    throw new Error("Could not extract a valid YouTube video ID from the URL.");
  }

  const clientFallback = await fetchInvidiousMetadataClientSide(videoId);
  if (!clientFallback) {
    throw new Error("All extraction methods failed (Server and Client fallback). Please try another video.");
  }

  const { videoData, baseUri } = clientFallback;
  const mappedData = mapInvidiousResponse(videoData, baseUri);

  // Fetch captions client-side if available
  if (mappedData.captions && mappedData.captions.length > 0) {
    const enCap = mappedData.captions.find(c => c.language_code === 'en' || c.label.toLowerCase().includes('english'));
    if (enCap && enCap.url) {
      try {
        const capUrl = `${mappedData.baseUri}${enCap.url}`;
        const capRes = await fetch(capUrl);
        if (capRes.ok) {
          const capText = await capRes.text();
          mappedData.captions = mappedData.parseCaptions(capText);
        } else {
          mappedData.captions = [];
        }
      } catch (e) {
        console.error("Failed to fetch captions in client-side fallback:", e);
        mappedData.captions = [];
      }
    } else {
      mappedData.captions = [];
    }
  } else {
    mappedData.captions = [];
  }

  // Remove the temporary parser method from final data
  delete mappedData.parseCaptions;
  delete mappedData.baseUri;

  return mappedData;
}

export function formatDuration(seconds) {
  if (isNaN(seconds) || seconds === null || seconds < 0) return '00:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hrs > 0) {
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function formatViews(views) {
  if (isNaN(views) || views === null) return '0';
  const num = Number(views);
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}
