import { create } from 'zustand';

export const useExportStore = create((set) => ({
  exportQueue: [],        // List of rendering or completed clip exports
  
  addToQueue: (item) => set((state) => ({
    exportQueue: [...state.exportQueue, {
      id: item.id,
      clipId: item.clipId,
      title: item.title,
      progress: 0,
      status: 'idle', // 'idle', 'processing', 'completed', 'failed', 'paused'
      outputBlobUrl: null,
      error: null,
      eta: null,
      quality: item.quality || '1080p',
      format: item.format || 'mp4',
      fps: item.fps || 30,
      createdAt: new Date().toISOString()
    }]
  })),
  
  updateQueueItem: (id, updates) => set((state) => ({
    exportQueue: state.exportQueue.map((item) => (item.id === id ? { ...item, ...updates } : item))
  })),
  
  removeFromQueue: (id) => set((state) => ({
    exportQueue: state.exportQueue.filter((item) => item.id !== id)
  })),
  
  clearQueue: () => set({ exportQueue: [] })
}));
