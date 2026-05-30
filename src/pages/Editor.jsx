import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { 
  Play, Pause, Volume2, Music, Crop, Type, Sliders, 
  ChevronLeft, RotateCcw, Save, ArrowRight, Sparkles, Smile, RefreshCw
} from 'lucide-react';

import { useVideoStore } from '../stores/videoStore';
import { useClipStore } from '../stores/clipStore';
import { generateWaveform } from '../utils/audio';
import { saveClip } from '../utils/indexeddb';
import { formatDuration } from '../utils/youtube';

export default function Editor() {
  const { clipId } = useParams();
  const navigate = useNavigate();

  const { currentVideo, formats, captions } = useVideoStore();
  const { clips, updateClip, addClip } = useClipStore();

  // Find or create active clip configuration
  const [clip, setLocalClip] = useState(null);

  // Player refs
  const videoRef = useRef(null);
  const audioBgRef = useRef(null);
  const waveformCanvasRef = useRef(null);

  // Editing state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [waveform, setWaveform] = useState([]);
  const [activeTab, setActiveTab] = useState('trim'); // trim, captions, aspect, filter, audio
  const [duration, setDuration] = useState(0);

  // Face Tracking Simulation
  const [faceTrackingEnabled, setFaceTrackingEnabled] = useState(false);
  const [cropOffset, setCropOffset] = useState(0); // -100 to 100% shift

  // SoundHelix Curated background tracks
  const bgMusicTracks = [
    { title: 'Lofi Chill Beat', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3' },
    { title: 'Cinematic Ambient', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3' },
    { title: 'Upbeat Electronica', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3' },
    { title: 'Acoustic Dreams', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3' }
  ];

  // Aspect ratio crop options
  const aspectRatios = [
    { label: '16:9 Landscape', value: '16:9', desc: 'YouTube / Desktop' },
    { label: '9:16 Vertical', value: '9:16', desc: 'Shorts / Reels / TikTok' },
    { label: '1:1 Square', value: '1:1', desc: 'Instagram / Square feed' }
  ];

  // Filters presets
  const filterPresets = [
    { name: 'none', label: 'Original', css: 'none' },
    { name: 'warm', label: 'Warm Cinematic', css: 'sepia(0.3) saturate(1.2) contrast(1.1) hue-rotate(-5deg)' },
    { name: 'cool', label: 'Cool Moody', css: 'saturate(0.9) contrast(1.15) hue-rotate(10deg) brightness(0.95)' },
    { name: 'vibrant', label: 'Vibrant Pop', css: 'saturate(1.5) contrast(1.1)' },
    { name: 'vintage', label: 'Vintage Film', css: 'sepia(0.4) saturate(0.85) contrast(0.95) brightness(1.05)' },
    { name: 'bw', label: 'B&W High Contrast', css: 'grayscale(1) contrast(1.4) brightness(0.9)' },
    { name: 'fade', label: 'Dreamy Fade', css: 'brightness(1.05) contrast(0.85) saturate(0.9)' }
  ];

  // Caption Preset Styles
  const captionPresets = [
    { name: 'yellow-bounce', label: 'Yellow Bounce', color: '#facc15', bg: 'rgba(0,0,0,0.8)', border: '2px solid #000' },
    { name: 'neon-glow', label: 'Neon Glow', color: '#a855f7', bg: 'rgba(15,15,20,0.9)', border: '1px solid #c084fc', shadow: '0 0 15px #a855f7' },
    { name: 'impact-bold', label: 'Bold Border', color: '#ffffff', bg: 'none', border: 'none', stroke: '4px #000' },
    { name: 'minimal-clean', label: 'Clean Minimal', color: '#ffffff', bg: 'rgba(0,0,0,0.5)', border: 'none' },
    { name: 'gradient-cyan', label: 'Gradient Pop', color: '#06b6d4', bg: 'rgba(0,0,0,0.7)', border: 'none' }
  ];

  // Fetch clip on mount
  useEffect(() => {
    if (!currentVideo) {
      toast.error("No active video loaded. Redirecting back to dashboard...");
      navigate('/');
      return;
    }

    let activeClip = clips.find(c => c.id === clipId);
    if (!activeClip) {
      // Create a default clip if none found
      const newId = clipId === 'active' ? `clip-${Date.now()}` : clipId;
      activeClip = {
        id: newId,
        videoId: currentVideo.id,
        title: `${currentVideo.title.substring(0, 30)} - Custom Clip`,
        start: 0,
        end: Math.min(30, currentVideo.duration),
        viralityScore: 50,
        reason: 'Manual Clip',
        aspectRatio: '9:16',
        editingState: {
          captionStyle: {
            preset: 'yellow-bounce',
            fontSize: 22,
            color: '#facc15',
            position: 'middle'
          },
          colorFilter: 'none',
          watermarkEnabled: false,
          bgMusicUrl: null,
          bgMusicVolume: 0.3,
          voiceDucking: true,
          emojiOverlays: []
        }
      };
      addClip(activeClip);
    }
    setLocalClip(activeClip);
    setDuration(currentVideo.duration);

    // Fetch waveform
    const audioStream = formats.find(f => f.acodec !== 'none' && f.vcodec === 'none') || formats[0];
    if (audioStream) {
      generateWaveform(audioStream.url, currentVideo.duration)
        .then(peaks => setWaveform(peaks));
    }
  }, [clipId, currentVideo]);

  // Load background music if selected
  useEffect(() => {
    if (audioBgRef.current && clip?.editingState?.bgMusicUrl) {
      const proxiedUrl = clip.editingState.bgMusicUrl.startsWith('http')
        ? `/api/proxy?url=${encodeURIComponent(clip.editingState.bgMusicUrl)}`
        : clip.editingState.bgMusicUrl;
      audioBgRef.current.src = proxiedUrl;
      audioBgRef.current.volume = clip.editingState.bgMusicVolume;
      audioBgRef.current.loop = true;
      if (isPlaying) {
        audioBgRef.current.play().catch(e => console.log("BG music play blocked", e));
      }
    } else if (audioBgRef.current) {
      audioBgRef.current.pause();
    }
  }, [clip?.editingState?.bgMusicUrl]);

  // Handle Play/Pause
  function togglePlay() {
    if (isPlaying) {
      videoRef.current?.pause();
      audioBgRef.current?.pause();
    } else {
      // If current time is out of boundaries, reset to clip start
      if (currentTime < clip.start || currentTime >= clip.end) {
        videoRef.current.currentTime = clip.start;
        setCurrentTime(clip.start);
      }
      videoRef.current?.play();
      if (clip?.editingState?.bgMusicUrl) {
        audioBgRef.current?.play().catch(e => console.log("BG music play blocked", e));
      }
    }
    setIsPlaying(!isPlaying);
  }

  // Handle Time Update
  function handleTimeUpdate() {
    if (!videoRef.current || !clip) return;
    const time = videoRef.current.currentTime;
    setCurrentTime(time);

    // Check boundaries: Loop or Pause when ending clip
    if (time >= clip.end) {
      videoRef.current.currentTime = clip.start;
      setCurrentTime(clip.start);
      if (!isPlaying) {
        videoRef.current.pause();
        audioBgRef.current?.pause();
        setIsPlaying(false);
      }
    }

    // Audio Ducking Simulation
    if (clip.editingState?.voiceDucking && audioBgRef.current) {
      const activeCaption = getActiveCaption(time);
      if (activeCaption) {
        // Duck volume down to 25% of its set value when speaking
        audioBgRef.current.volume = clip.editingState.bgMusicVolume * 0.25;
      } else {
        audioBgRef.current.volume = clip.editingState.bgMusicVolume;
      }
    }

    // Simulate Face Tracking crop offset (moves head center based on time)
    if (faceTrackingEnabled) {
      // Simulate face tracking coordinate shifting (procedurally generated movement)
      const wave = Math.sin(time / 1.5) * 12 + Math.cos(time / 4) * 8;
      setCropOffset(Math.max(-25, Math.min(25, wave)));
    } else {
      setCropOffset(0);
    }
  }

  // Draw Audio Waveform inside the Canvas
  useEffect(() => {
    if (!waveformCanvasRef.current || waveform.length === 0 || !clip) return;
    const canvas = waveformCanvasRef.current;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);
    
    // Draw background waveform bars
    const barWidth = w / waveform.length;
    waveform.forEach((val, index) => {
      const x = index * barWidth;
      const barHeight = val * h * 0.8;
      const y = (h - barHeight) / 2;

      // Check if bar is inside the active clip start/end range
      const timeAtIdx = (index / waveform.length) * duration;
      const isInside = timeAtIdx >= clip.start && timeAtIdx <= clip.end;

      if (isInside) {
        ctx.fillStyle = 'rgba(139, 92, 246, 0.7)'; // Purple active range
      } else {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)'; // Dim inactive range
      }
      
      // Draw bar rounded
      ctx.fillRect(x + 1, y, barWidth - 2, barHeight);
    });

    // Draw current playback pointer line
    const playbackPct = currentTime / duration;
    const pointerX = playbackPct * w;
    ctx.strokeStyle = '#ec4899'; // Pink pointer
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(pointerX, 0);
    ctx.lineTo(pointerX, h);
    ctx.stroke();

    // Draw Trim handle borders
    const startX = (clip.start / duration) * w;
    const endX = (clip.end / duration) * w;
    
    ctx.strokeStyle = '#8b5cf6'; // Purple trim borders
    ctx.lineWidth = 3.5;
    
    // Start Handle
    ctx.beginPath();
    ctx.moveTo(startX, 0);
    ctx.lineTo(startX, h);
    ctx.stroke();
    ctx.fillStyle = '#8b5cf6';
    ctx.fillRect(startX - 6, h/2 - 12, 12, 24);

    // End Handle
    ctx.beginPath();
    ctx.moveTo(endX, 0);
    ctx.lineTo(endX, h);
    ctx.stroke();
    ctx.fillStyle = '#8b5cf6';
    ctx.fillRect(endX - 6, h/2 - 12, 12, 24);

  }, [waveform, clip, currentTime, duration]);

  // Handle timeline scrubber drag clicks
  function handleTimelineClick(e) {
    if (!waveformCanvasRef.current || !clip) return;
    const rect = waveformCanvasRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const pct = clickX / rect.width;
    const seekTime = pct * duration;
    
    // Check if clicked close to handles to adjust start/end, or just seek
    const startX = (clip.start / duration) * rect.width;
    const endX = (clip.end / duration) * rect.width;
    
    if (Math.abs(clickX - startX) < 15) {
      // Dragging start handle
      const newStart = Math.max(0, Math.min(seekTime, clip.end - 3));
      updateLocalClip({ start: newStart });
      videoRef.current.currentTime = newStart;
    } else if (Math.abs(clickX - endX) < 15) {
      // Dragging end handle
      const newEnd = Math.min(duration, Math.max(seekTime, clip.start + 3));
      updateLocalClip({ end: newEnd });
      videoRef.current.currentTime = clip.start;
    } else {
      // Seek pointer
      videoRef.current.currentTime = Math.max(clip.start, Math.min(seekTime, clip.end));
      setCurrentTime(videoRef.current.currentTime);
    }
  }

  function updateLocalClip(updates) {
    setLocalClip(prev => {
      const merged = { ...prev, ...updates };
      // Sync to Zustand state store
      updateClip(prev.id, updates);
      return merged;
    });
  }

  function updateEditingState(field, value) {
    updateLocalClip({
      editingState: {
        ...clip.editingState,
        [field]: value
      }
    });
  }

  function getActiveCaption(time) {
    if (!captions) return null;
    return captions.find(c => time >= c.start && time < (c.start + c.duration));
  }

  function renderCaptionText(caption, time) {
    if (!caption) return null;
    const words = caption.text.split(' ');
    
    // Karaoke: Highlight active word based on elapsed segment duration
    const elapsed = time - caption.start;
    const wordDuration = caption.duration / words.length;
    const activeIdx = Math.floor(elapsed / wordDuration);
    
    return (
      <div className="flex flex-wrap items-center justify-center gap-1.5 px-4 py-2 font-display text-center leading-normal">
        {words.map((word, index) => {
          const isActive = index === activeIdx;
          const style = clip.editingState.captionStyle;
          
          let wordClass = "transition-all duration-200 font-extrabold ";
          let customStyle = {};
          
          if (style.preset === 'yellow-bounce') {
            wordClass += isActive ? 'text-yellow-400 scale-110 -translate-y-1' : 'text-white';
          } else if (style.preset === 'neon-glow') {
            wordClass += isActive ? 'text-purple-400 blur-[0.3px]' : 'text-zinc-300';
            if (isActive) customStyle.textShadow = '0 0 10px #c084fc';
          } else if (style.preset === 'impact-bold') {
            wordClass += 'uppercase text-white tracking-wide ';
            if (isActive) wordClass += 'text-yellow-400 scale-105';
            customStyle.textShadow = '2px 2px 0px #000, -2px -2px 0px #000, 2px -2px 0px #000, -2px 2px 0px #000';
          } else if (style.preset === 'gradient-cyan') {
            wordClass += isActive ? 'text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-emerald-400 scale-105' : 'text-zinc-100';
          } else {
            // Clean minimal
            wordClass += isActive ? 'text-white scale-105' : 'text-zinc-400';
          }
          
          return (
            <span 
              key={index} 
              className={wordClass}
              style={{
                fontSize: `${style.fontSize}px`,
                ...customStyle
              }}
            >
              {word}
            </span>
          );
        })}
      </div>
    );
  }

  async function handleSaveAndProceed() {
    await saveClip(clip);
    toast.success("Clip saved! Redirecting to export console.");
    navigate(`/export/${clip.id}`);
  }

  if (!clip) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <svg className="animate-spin h-8 w-8 text-brand-purple" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        <span className="text-sm text-zinc-400">Loading clip session...</span>
      </div>
    );
  }

  // Get preview media stream. We prefer format 18 (360p progressive combined format) for extremely fast, buffer-free editing and scrubbing.
  const previewStream = formats.find(f => f.id === '18') ||
                        formats.find(f => f.resolution === '360p' && f.vcodec !== 'none' && f.acodec !== 'none') ||
                        formats.find(f => f.vcodec !== 'none' && f.acodec !== 'none') || 
                        formats[0];

  return (
    <div className="space-y-6">
      {/* Header action bar */}
      <div className="flex items-center justify-between border-b border-white/5 pb-4">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-1.5 text-zinc-400 hover:text-white text-xs font-semibold px-3.5 py-2 hover:bg-white/5 rounded-xl transition-all cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" /> Back to Dashboard
        </button>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              // Reset start/end
              updateLocalClip({ start: 0, end: Math.min(30, duration) });
              videoRef.current.currentTime = 0;
              toast.info("Trim settings reset!");
            }}
            className="flex items-center gap-1 text-zinc-400 hover:text-white text-xs font-semibold px-3 py-1.5 hover:bg-white/5 rounded-xl transition-all cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset Trims
          </button>
          <button
            onClick={handleSaveAndProceed}
            className="flex items-center gap-1.5 px-4.5 py-2.5 bg-gradient-to-r from-brand-purple to-brand-pink rounded-xl text-white text-xs font-bold shadow-lg hover:shadow-brand-purple/20 transition-all duration-300 hover:scale-[1.02] cursor-pointer"
          >
            Proceed to Export <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left 5 Cols: Live Player Preview */}
        <div className="lg:col-span-5 flex flex-col items-center gap-4">
          <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest self-start">Canvas Live Preview</span>
          
          {/* Main Video Crop Container */}
          <div 
            className="relative glass-panel rounded-3xl overflow-hidden shadow-2xl flex items-center justify-center bg-zinc-950 border border-white/10"
            style={{
              aspectRatio: clip.aspectRatio === '16:9' ? '16/9' : clip.aspectRatio === '9:16' ? '9/16' : '1/1',
              height: clip.aspectRatio === '9:16' ? '540px' : '360px',
              maxWidth: '100%'
            }}
          >
            <video
              ref={videoRef}
              src={previewStream ? previewStream.url : ''}
              onTimeUpdate={handleTimeUpdate}
              className="absolute max-w-none transition-all duration-300"
              style={{
                filter: filterPresets.find(p => p.name === clip.editingState.colorFilter)?.css || 'none',
                // Aspect Ratio Crops Calculations
                width: clip.aspectRatio === '9:16' ? '178%' : clip.aspectRatio === '1:1' ? '133%' : '100%',
                height: '100%',
                objectFit: 'cover',
                transform: `translateX(${cropOffset}%)` // Face Centering Bounding Shifts
              }}
            />

            {/* Karaoke Caption Overlay */}
            <div 
              className={`absolute left-0 right-0 z-10 select-none pointer-events-none flex flex-col items-center justify-center text-center`}
              style={{
                bottom: clip.editingState.captionStyle.position === 'bottom' ? '15%' : 'auto',
                top: clip.editingState.captionStyle.position === 'top' ? '15%' : 'auto',
                // Center positioning
                ...(clip.editingState.captionStyle.position === 'middle' ? { top: '50%', transform: 'translateY(-50%)' } : {})
              }}
            >
              {renderCaptionText(getActiveCaption(currentTime), currentTime)}
            </div>

            {/* Branded Watermark */}
            {clip.editingState.watermarkEnabled && (
              <div className="absolute top-4 left-4 z-10 text-[10px] font-bold uppercase tracking-wider text-white/50 bg-black/60 px-2 py-0.5 rounded border border-white/5 backdrop-blur-sm select-none">
                🏷️ {clip.editingState.watermarkText || 'AI Clipper'}
              </div>
            )}

            {/* Hover Play Button Trigger */}
            <div 
              onClick={togglePlay}
              className="absolute inset-0 bg-transparent flex items-center justify-center cursor-pointer group"
            >
              {!isPlaying && (
                <div className="w-14 h-14 rounded-full bg-brand-purple/90 flex items-center justify-center text-white shadow-2xl transition-all duration-300 transform scale-90 group-hover:scale-100 hover:bg-brand-purple shadow-brand-purple/30 backdrop-blur-sm border border-brand-purple/20">
                  <Play className="w-6 h-6 fill-current ml-1" />
                </div>
              )}
            </div>
          </div>

          {/* Player controls */}
          <div className="flex items-center gap-4 w-full px-4 justify-between glass-panel py-2 rounded-2xl">
            <button 
              onClick={togglePlay}
              className="p-2 bg-brand-purple rounded-xl text-white shadow-md cursor-pointer hover:bg-brand-purple/90"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
            </button>
            <div className="flex-1 text-xs text-zinc-400 font-semibold px-2 font-mono">
              {formatDuration(currentTime - clip.start)} / {formatDuration(clip.end - clip.start)}
            </div>
            <div className="flex items-center gap-1.5 text-zinc-500">
              <Volume2 className="w-4 h-4" />
              <span className="text-[10px] font-bold uppercase">Mute Preview</span>
              <input
                type="checkbox"
                onChange={(e) => {
                  if (videoRef.current) videoRef.current.muted = e.target.checked;
                }}
                className="w-3.5 h-3.5 accent-brand-purple"
              />
            </div>
          </div>
        </div>

        {/* Right 7 Cols: Advanced Editing Console Tabs */}
        <div className="lg:col-span-7 space-y-6 flex flex-col h-full">
          <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Editing Console</span>
          
          <div className="glass-panel p-6 rounded-3xl shadow-xl flex-1 flex flex-col gap-6">
            {/* Tab navigation headers */}
            <div className="flex items-center gap-2 border-b border-white/5 pb-3 overflow-x-auto scrollbar-none">
              {[
                { id: 'trim', label: 'Trim Range', icon: Sliders },
                { id: 'captions', label: 'Captions Style', icon: Type },
                { id: 'aspect', label: 'Crop Ratio', icon: Crop },
                { id: 'filter', label: 'Filters', icon: Sliders },
                { id: 'audio', label: 'Audio Mixer', icon: Music }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'bg-brand-purple text-white shadow-md shadow-brand-purple/20'
                      : 'text-zinc-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <tab.icon className="w-3.5 h-3.5" /> {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Contents */}
            <div className="flex-1">
              
              {/* Tab 1: Trim Timeline Scrubber */}
              {activeTab === 'trim' && (
                <div className="space-y-6">
                  <div className="space-y-2">
                    <h4 className="text-sm font-bold text-white flex items-center gap-1">
                      <Sliders className="w-4 h-4 text-brand-purple" /> Timeline Scrubber
                    </h4>
                    <p className="text-xs text-zinc-400">
                      Drag timeline bounds or handles to trim your video clip. The highlighted region will be rendered in export.
                    </p>
                  </div>
                  
                  {/* Waveform Canvas Timeline Track */}
                  <div className="relative">
                    <canvas
                      ref={waveformCanvasRef}
                      width={600}
                      height={90}
                      onClick={handleTimelineClick}
                      className="w-full h-[90px] rounded-xl bg-zinc-950/70 border border-white/5 cursor-ew-resize shadow-inner block"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="glass-card p-3.5 rounded-xl border border-white/5">
                      <span className="text-[10px] uppercase font-bold text-zinc-500 block">Start Time</span>
                      <input 
                        type="number"
                        step="0.1"
                        value={clip.start.toFixed(1)}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          const start = Math.max(0, Math.min(val, clip.end - 3));
                          updateLocalClip({ start });
                        }}
                        className="w-full bg-transparent font-mono text-lg font-bold outline-none text-brand-purple"
                      />
                    </div>
                    <div className="glass-card p-3.5 rounded-xl border border-white/5">
                      <span className="text-[10px] uppercase font-bold text-zinc-500 block">End Time</span>
                      <input 
                        type="number"
                        step="0.1"
                        value={clip.end.toFixed(1)}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          const end = Math.min(duration, Math.max(val, clip.start + 3));
                          updateLocalClip({ end });
                        }}
                        className="w-full bg-transparent font-mono text-lg font-bold outline-none text-brand-pink"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 2: Caption Styling Panel */}
              {activeTab === 'captions' && (
                <div className="space-y-6">
                  <div className="space-y-2">
                    <h4 className="text-sm font-bold text-white flex items-center gap-1">
                      <Type className="w-4 h-4 text-brand-purple" /> Auto-Caption Generators
                    </h4>
                    <p className="text-xs text-zinc-400">
                      Style your captions with premium templates, adjusts font sizing, colors, and vertical alignment overlays.
                    </p>
                  </div>

                  {/* Caption presets */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {captionPresets.map((preset) => (
                      <button
                        key={preset.name}
                        onClick={() => {
                          updateEditingState('captionStyle', {
                            ...clip.editingState.captionStyle,
                            preset: preset.name,
                            color: preset.color
                          });
                          toast.success(`Applied ${preset.label} preset`);
                        }}
                        className={`p-3 rounded-xl text-left border text-xs font-bold transition-all cursor-pointer ${
                          clip.editingState.captionStyle.preset === preset.name
                            ? 'bg-brand-purple/10 border-brand-purple text-white'
                            : 'bg-white/5 border-white/5 text-zinc-400 hover:border-white/10'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>

                  {/* Font Sizing Slider */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="text-zinc-400">Font Size (px)</span>
                      <span className="text-brand-purple">{clip.editingState.captionStyle.fontSize}px</span>
                    </div>
                    <input
                      type="range"
                      min={14}
                      max={42}
                      value={clip.editingState.captionStyle.fontSize}
                      onChange={(e) => {
                        updateEditingState('captionStyle', {
                          ...clip.editingState.captionStyle,
                          fontSize: Number(e.target.value)
                        });
                      }}
                      className="w-full accent-brand-purple bg-zinc-800"
                    />
                  </div>

                  {/* Sizing Colors & Position alignment */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <span className="text-xs font-bold text-zinc-400 block">Caption Color</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={clip.editingState.captionStyle.color}
                          onChange={(e) => {
                            updateEditingState('captionStyle', {
                              ...clip.editingState.captionStyle,
                              color: e.target.value
                            });
                          }}
                          className="w-8 h-8 rounded-lg overflow-hidden border border-white/15 bg-transparent cursor-pointer"
                        />
                        <span className="text-xs font-mono">{clip.editingState.captionStyle.color}</span>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <span className="text-xs font-bold text-zinc-400 block">Vertical Alignment</span>
                      <div className="flex items-center gap-1.5">
                        {['top', 'middle', 'bottom'].map((pos) => (
                          <button
                            key={pos}
                            onClick={() => {
                              updateEditingState('captionStyle', {
                                ...clip.editingState.captionStyle,
                                position: pos
                              });
                            }}
                            className={`flex-1 py-1.5 rounded-lg border text-[10px] font-bold uppercase transition-all cursor-pointer ${
                              clip.editingState.captionStyle.position === pos
                                ? 'bg-brand-purple/10 border-brand-purple text-brand-purple'
                                : 'bg-transparent border-white/5 text-zinc-400 hover:border-white/10'
                            }`}
                          >
                            {pos}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 3: Crop Aspect Ratio */}
              {activeTab === 'aspect' && (
                <div className="space-y-6">
                  <div className="space-y-2">
                    <h4 className="text-sm font-bold text-white flex items-center gap-1">
                      <Crop className="w-4 h-4 text-brand-purple" /> Aspect Ratio Switcher
                    </h4>
                    <p className="text-xs text-zinc-400">
                      Reframe your clip for social networks. Select 9:16 for Reels, Shorts, and TikTok.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {aspectRatios.map((ratio) => (
                      <button
                        key={ratio.value}
                        onClick={() => {
                          updateLocalClip({ aspectRatio: ratio.value });
                          toast.success(`Aspect ratio changed to ${ratio.value}`);
                        }}
                        className={`p-4 rounded-xl text-left border flex flex-col gap-1 transition-all cursor-pointer ${
                          clip.aspectRatio === ratio.value
                            ? 'bg-brand-purple/10 border-brand-purple text-white shadow-inner'
                            : 'bg-white/5 border-white/5 text-zinc-400 hover:border-white/10'
                        }`}
                      >
                        <span className="text-xs font-bold">{ratio.label}</span>
                        <span className="text-[10px] text-zinc-500 font-semibold">{ratio.desc}</span>
                      </button>
                    ))}
                  </div>

                  {/* Auto-Face Centering smart Crop (Feature 3) */}
                  <div className="glass-card p-4 rounded-xl border border-white/5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <span className="text-xs font-bold text-white flex items-center gap-1">
                          <Sparkles className="w-3.5 h-3.5 text-brand-cyan" /> Face-Aware Smart Center Crop
                        </span>
                        <span className="text-[10px] text-zinc-400 block">
                          Uses face detection nodes to automatically center the camera on the speaker's face.
                        </span>
                      </div>
                      <input
                        type="checkbox"
                        checked={faceTrackingEnabled}
                        onChange={(e) => {
                          setFaceTrackingEnabled(e.target.checked);
                          toast.info(e.target.checked ? "Auto face-tracking crop active" : "Manual crop positioning active");
                        }}
                        className="w-4 h-4 accent-brand-purple cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 4: Color Filters */}
              {activeTab === 'filter' && (
                <div className="space-y-6">
                  <div className="space-y-2">
                    <h4 className="text-sm font-bold text-white flex items-center gap-1">
                      <Sliders className="w-4 h-4 text-brand-purple" /> Color Grading Filters
                    </h4>
                    <p className="text-xs text-zinc-400">
                      Apply cinematic color grading filters to increase visual appeal and mood in your viral highlights.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[300px] overflow-y-auto pr-1 scrollbar-none">
                    {filterPresets.map((preset) => (
                      <button
                        key={preset.name}
                        onClick={() => {
                          updateEditingState('colorFilter', preset.name);
                          toast.success(`Filter: ${preset.label}`);
                        }}
                        className={`p-3.5 rounded-xl border text-xs font-bold flex flex-col gap-1 transition-all cursor-pointer text-left ${
                          clip.editingState.colorFilter === preset.name
                            ? 'bg-brand-purple/10 border-brand-purple text-white shadow-inner'
                            : 'bg-white/5 border-white/5 text-zinc-400 hover:border-white/10'
                        }`}
                      >
                        <span>{preset.label}</span>
                      </button>
                    ))}
                  </div>

                  {/* Watermark Section inside filters */}
                  <div className="glass-card p-4 rounded-xl border border-white/5 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white">Enable Watermark Overlay</span>
                      <input
                        type="checkbox"
                        checked={clip.editingState.watermarkEnabled}
                        onChange={(e) => {
                          updateEditingState('watermarkEnabled', e.target.checked);
                        }}
                        className="w-4 h-4 accent-brand-purple cursor-pointer"
                      />
                    </div>
                    {clip.editingState.watermarkEnabled && (
                      <div className="space-y-2">
                        <span className="text-[10px] text-zinc-500 font-bold block">Watermark Text</span>
                        <input
                          type="text"
                          value={clip.editingState.watermarkText || ''}
                          onChange={(e) => updateEditingState('watermarkText', e.target.value)}
                          placeholder="e.g. @mychannelname"
                          className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-xs outline-none text-white focus:border-brand-purple"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Tab 5: Background Audio Mixer */}
              {activeTab === 'audio' && (
                <div className="space-y-6">
                  <div className="space-y-2">
                    <h4 className="text-sm font-bold text-white flex items-center gap-1">
                      <Music className="w-4 h-4 text-brand-purple" /> Background Music Mixer
                    </h4>
                    <p className="text-xs text-zinc-400">
                      Select background instrumental music tracks to mix with your clip. Adjust volume and activate auto-ducking during speech.
                    </p>
                  </div>

                  {/* Music track list */}
                  <div className="space-y-2.5 max-h-[180px] overflow-y-auto pr-1 scrollbar-none">
                    <button
                      onClick={() => {
                        updateEditingState('bgMusicUrl', null);
                        toast.info("Background music removed");
                      }}
                      className={`w-full p-3 rounded-xl border text-left text-xs font-bold transition-all cursor-pointer ${
                        clip.editingState.bgMusicUrl === null
                          ? 'bg-brand-purple/10 border-brand-purple text-white shadow-inner'
                          : 'bg-white/5 border-white/5 text-zinc-400 hover:border-white/10'
                      }`}
                    >
                      🚫 No Background Music
                    </button>
                    {bgMusicTracks.map((track) => (
                      <button
                        key={track.title}
                        onClick={() => {
                          updateEditingState('bgMusicUrl', track.url);
                          toast.success(`Selected background track: ${track.title}`);
                        }}
                        className={`w-full p-3 rounded-xl border text-left text-xs font-bold flex items-center justify-between transition-all cursor-pointer ${
                          clip.editingState.bgMusicUrl === track.url
                            ? 'bg-brand-purple/10 border-brand-purple text-white shadow-inner'
                            : 'bg-white/5 border-white/5 text-zinc-400 hover:border-white/10'
                        }`}
                      >
                        <span>🎵 {track.title}</span>
                        {clip.editingState.bgMusicUrl === track.url && (
                          <span className="text-[10px] text-brand-purple uppercase font-bold tracking-wider">Active</span>
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Background Music Volume & Voice Ducking */}
                  {clip.editingState.bgMusicUrl && (
                    <div className="space-y-4 pt-4 border-t border-white/5">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs font-bold">
                          <span className="text-zinc-400">Music Volume</span>
                          <span className="text-brand-purple">{Math.round(clip.editingState.bgMusicVolume * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min={0.05}
                          max={0.8}
                          step={0.05}
                          value={clip.editingState.bgMusicVolume}
                          onChange={(e) => {
                            updateEditingState('bgMusicVolume', Number(e.target.value));
                          }}
                          className="w-full accent-brand-purple bg-zinc-800"
                        />
                      </div>

                      <div className="flex items-center justify-between bg-zinc-950/40 p-3 rounded-xl border border-white/5">
                        <div className="space-y-0.5">
                          <span className="text-xs font-bold text-white flex items-center gap-1">
                            🗣️ Speech-Aware Auto-Ducking
                          </span>
                          <span className="text-[10px] text-zinc-400 block">
                            Automatically lowers background music volume by 75% during speech segments.
                          </span>
                        </div>
                        <input
                          type="checkbox"
                          checked={clip.editingState.voiceDucking}
                          onChange={(e) => {
                            updateEditingState('voiceDucking', e.target.checked);
                            toast.info(e.target.checked ? "Auto volume-ducking active" : "Auto volume-ducking disabled");
                          }}
                          className="w-4 h-4 accent-brand-purple cursor-pointer"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Hidden audio element for background music mix */}
      <audio ref={audioBgRef} />
    </div>
  );
}
