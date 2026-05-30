import { create } from 'zustand';

export const useClipStore = create((set) => ({
  clips: [],              // User-created or selected clips
  activeClipId: null,     // Currently edited clip ID
  detectedMoments: [],    // AI-generated moment recommendations
  momentDetectionProgress: 0, // Loading / sentiment scoring progress
  isDetectingMoments: false,  // AI moment analysis indicator
  
  setClips: (clips) => set({ clips }),
  setActiveClipId: (id) => set({ activeClipId: id }),
  setDetectedMoments: (moments) => set({ detectedMoments: moments }),
  setMomentDetectionProgress: (progress) => set({ momentDetectionProgress: progress }),
  setIsDetectingMoments: (val) => set({ isDetectingMoments: val }),
  
  addClip: (clip) => set((state) => ({ 
    clips: [...state.clips, clip],
    activeClipId: clip.id // Automatically focus on new clip
  })),
  
  updateClip: (id, updates) => set((state) => ({
    clips: state.clips.map((c) => (c.id === id ? { ...c, ...updates } : c))
  })),
  
  deleteClip: (id) => set((state) => ({
    clips: state.clips.filter((c) => c.id !== id),
    activeClipId: state.activeClipId === id ? null : state.activeClipId
  })),
  
  clearClips: () => set({ clips: [], activeClipId: null, detectedMoments: [] })
}));
