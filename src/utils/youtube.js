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

export async function fetchVideoDetails(url) {
  const response = await fetch(`/api/youtube/info?url=${encodeURIComponent(url)}`);
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || `Failed to fetch video details (Status: ${response.status})`);
  }
  return await response.json();
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
