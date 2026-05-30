import { create } from 'zustand';

export const useVideoStore = create((set) => ({
  currentVideo: null, // { id, title, description, duration, thumbnail, channel, viewCount, uploadDate }
  formats: [],        // all format objects (video/audio streams)
  captions: [],       // transcript array of { start, duration, text }
  selectedAudioFormat: null, // active audio format
  selectedVideoFormat: null, // active video format
  isLoading: false,
  error: null,
  
  setCurrentVideo: (video) => set({ currentVideo: video }),
  setFormats: (formats) => set({ formats }),
  setCaptions: (captions) => set({ captions }),
  setSelectedAudioFormat: (format) => set({ selectedAudioFormat: format }),
  setSelectedVideoFormat: (format) => set({ selectedVideoFormat: format }),
  setIsLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  
  resetVideo: () => set({
    currentVideo: null,
    formats: [],
    captions: [],
    selectedAudioFormat: null,
    selectedVideoFormat: null,
    isLoading: false,
    error: null
  })
}));
