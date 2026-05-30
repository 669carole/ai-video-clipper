import Dexie from 'dexie';

export const db = new Dexie('AIClipperDatabase');

db.version(1).stores({
  projects: 'id, videoId, title, duration, thumbnail, channel, createdAt',
  clips: 'id, videoId, title, start, end, viralityScore, reason, aspectRatio, editingState, createdAt',
  exports: 'id, clipId, videoId, title, blob, thumbnail, createdAt'
});

// Helper functions for easy storage operations
export async function saveProject(project) {
  return await db.projects.put({
    ...project,
    createdAt: project.createdAt || new Date().toISOString()
  });
}

export async function getProjects() {
  return await db.projects.orderBy('createdAt').reverse().toArray();
}

export async function saveClip(clip) {
  return await db.clips.put({
    ...clip,
    createdAt: clip.createdAt || new Date().toISOString()
  });
}

export async function getClips(videoId) {
  if (videoId) {
    return await db.clips.where('videoId').equals(videoId).toArray();
  }
  return await db.clips.orderBy('createdAt').reverse().toArray();
}

export async function deleteClipFromDb(id) {
  await db.clips.delete(id);
  await db.exports.where('clipId').equals(id).delete();
}

export async function saveExport(exportItem) {
  return await db.exports.put({
    ...exportItem,
    createdAt: exportItem.createdAt || new Date().toISOString()
  });
}

export async function getExports() {
  return await db.exports.orderBy('createdAt').reverse().toArray();
}

export async function getStorageUsage() {
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      const used = estimate.usage || 0;
      const total = estimate.quota || 1;
      return {
        used: (used / (1024 * 1024)).toFixed(1), // MB
        quota: (total / (1024 * 1024 * 1024)).toFixed(1), // GB
        percentage: ((used / total) * 100).toFixed(1)
      };
    }
  } catch (err) {
    console.error("Storage estimation error:", err);
  }
  return { used: '0', quota: '0', percentage: '0' };
}
