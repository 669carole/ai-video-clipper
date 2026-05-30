import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useSettingsStore = create(
  persist(
    (set) => ({
      cloudflareApiToken: '',
      cloudflareAccountId: '',
      concurrentExports: 2,
      exportQuality: 'medium', // low, medium, high, lossless
      exportFormat: 'mp4', // mp4, webm, gif
      exportFps: 30, // 24, 30, 60
      watermarkText: 'AI Clipper',
      watermarkEnabled: false,
      useLocalAIOnly: true, // option to force HuggingFace Transformers.js
      youtubeCookies: '',
      setCloudflareApiToken: (token) => set({ cloudflareApiToken: token }),
      setCloudflareAccountId: (id) => set({ cloudflareAccountId: id }),
      setConcurrentExports: (num) => set({ concurrentExports: num }),
      setExportQuality: (q) => set({ exportQuality: q }),
      setExportFormat: (f) => set({ exportFormat: f }),
      setExportFps: (fps) => set({ exportFps: fps }),
      setWatermarkText: (text) => set({ watermarkText: text }),
      setWatermarkEnabled: (enabled) => set({ watermarkEnabled: enabled }),
      setUseLocalAIOnly: (val) => set({ useLocalAIOnly: val }),
      setYoutubeCookies: (val) => set({ youtubeCookies: val }),
    }),
    {
      name: 'ai-clipper-settings',
    }
  )
);
