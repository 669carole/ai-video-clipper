export function getYoutubeId(url) {
  if (!url) return null;
  // Handles standard URLs, short urls, embed urls, and mobile links
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|shorts\/)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
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
