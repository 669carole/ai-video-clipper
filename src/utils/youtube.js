// Module-level AbortController for cancelling in-flight fetchVideoDetails calls
let _fetchVideoDetailsController = null;

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

async function fetchInvidiousMetadataClientSide(videoId, externalSignal) {
  const candidates = [
    'https://inv.thepixora.com',
    'https://invidious.nerdvpn.de',
    'https://vid.puffyan.us',
    'https://invidious.snopyta.org',
    'https://invidious.kavin.rocks',
    'https://y.com.sb',
    'https://invidious.tiekoetter.com',
    'https://invidious.projectsegfau.lt'
  ];
  
  console.log(`Client-side fallback: Racing ${candidates.length} Invidious instances...`);
  
  const fetchPromises = candidates.map(async (baseUri) => {
    const url = `${baseUri}/api/v1/videos/${videoId}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

    // Abort per-instance controller if the external signal fires
    const onExternalAbort = () => controller.abort();
    if (externalSignal) {
      if (externalSignal.aborted) throw new Error('Aborted');
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
    
    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.status === 200) {
        const videoData = await res.json();
        if (videoData && videoData.title) {
          return { videoData, baseUri };
        }
      }
    } catch (e) {
      // fall through
    } finally {
      if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);
    }
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
  
  const rewriteToProxy = (rawUrl) => {
    if (rawUrl && rawUrl.includes('googlevideo.com/videoplayback')) {
      try {
        const gvUrl = new URL(rawUrl);
        return `${baseUri}/videoplayback${gvUrl.search}`;
      } catch (e) {}
    }
    return rawUrl;
  };

  if (videoData.formatStreams) {
    for (const f of videoData.formatStreams) {
      const { width, height } = parseSize(f.size);
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

export async function fetchVideoDetails(url, externalSignal) {
  // Abort any previous in-flight fetchVideoDetails call
  if (_fetchVideoDetailsController) {
    _fetchVideoDetailsController.abort();
  }
  _fetchVideoDetailsController = new AbortController();
  const signal = _fetchVideoDetailsController.signal;

  // If the caller supplied an external signal, forward its abort
  const onExternalAbort = () => _fetchVideoDetailsController?.abort();
  if (externalSignal) {
    if (externalSignal.aborted) {
      _fetchVideoDetailsController.abort();
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  try {
    // 1. Try backend server extraction (yt-dlp or server-side fallback)
    const response = await fetch(`/api/youtube/info?url=${encodeURIComponent(url)}`, { signal });
    if (response.ok) {
      return await response.json();
    }
  } catch (backendErr) {
    if (signal.aborted) throw new DOMException('Fetch aborted', 'AbortError');
    console.warn("Backend video fetch failed, proceeding to client-side fallback:", backendErr);
  }

  // 2. Client-side fallback if backend fails
  const videoId = getYoutubeId(url);
  if (!videoId) {
    throw new Error("Could not extract a valid YouTube video ID from the URL.");
  }

  if (signal.aborted) throw new DOMException('Fetch aborted', 'AbortError');
  const clientFallback = await fetchInvidiousMetadataClientSide(videoId, signal);
  if (!clientFallback) {
    throw new Error("All extraction methods failed (Server and Client fallback). Please try another video.");
  }

  const { videoData, baseUri } = clientFallback;
  const mappedData = mapInvidiousResponse(videoData, baseUri);

  // Fetch captions client-side if available
  if (mappedData.captions && mappedData.captions.length > 0) {
    const enCap = mappedData.captions.find(c => c.language_code === 'en' || c.label?.toLowerCase()?.includes('english'));
    if (enCap && enCap.url) {
      try {
        const capUrl = `${mappedData.baseUri}${enCap.url}`;
        const capRes = await fetch(capUrl, { signal });
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

  // Clean up external signal listener
  if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);

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
