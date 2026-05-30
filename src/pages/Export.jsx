import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { 
  Download, Share2, Film, RefreshCw, Trash2, Sliders, CheckCircle, 
  AlertTriangle, Loader2, Play, Archive, HardDrive, Edit3, ArrowLeft, ExternalLink
} from 'lucide-react';
import JSZip from 'jszip';

import { useVideoStore } from '../stores/videoStore';
import { useClipStore } from '../stores/clipStore';
import { useExportStore } from '../stores/exportStore';
import { saveExport, getExports, db, getStorageUsage } from '../utils/indexeddb';
import { formatDuration } from '../utils/youtube';

export default function Export() {
  const { clipId } = useParams();
  const navigate = useNavigate();

  const { currentVideo, formats, captions } = useVideoStore();
  const { clips } = useClipStore();
  const { exportQueue, addToQueue, updateQueueItem, removeFromQueue } = useExportStore();

  const [gallery, setGallery] = useState([]);
  const [activeClip, setActiveClip] = useState(null);
  const [storageStats, setStorageStats] = useState({ used: '0', quota: '0', percentage: '0' });

  // Render Engine Configurations
  const [engine, setEngine] = useState('canvas'); // 'canvas' or 'ffmpeg-wasm'
  const [resolution, setResolution] = useState('720p');
  const [format, setFormat] = useState('webm');
  const [fps, setFps] = useState(30);

  // Hidden player element for rendering
  const renderVideoRef = useRef(null);
  const renderAudioRef = useRef(null);

  // Curated filters for canvas render
  const filterPresets = [
    { name: 'none', css: 'none' },
    { name: 'warm', css: 'sepia(0.3) saturate(1.2) contrast(1.1) hue-rotate(-5deg)' },
    { name: 'cool', css: 'saturate(0.9) contrast(1.15) hue-rotate(10deg) brightness(0.95)' },
    { name: 'vibrant', css: 'saturate(1.5) contrast(1.1)' },
    { name: 'vintage', css: 'sepia(0.4) saturate(0.85) contrast(0.95) brightness(1.05)' },
    { name: 'bw', css: 'grayscale(1) contrast(1.4) brightness(0.9)' },
    { name: 'fade', css: 'brightness(1.05) contrast(0.85) saturate(0.9)' }
  ];

  useEffect(() => {
    loadGallery();
    if (clipId && clipId !== 'gallery') {
      const matched = clips.find(c => c.id === clipId);
      if (matched) {
        setActiveClip(matched);
      }
    }
  }, [clipId, clips]);

  async function loadGallery() {
    try {
      const items = await getExports();
      setGallery(items);
      const stats = await getStorageUsage();
      setStorageStats(stats);
    } catch (err) {
      console.error("Failed to load export gallery:", err);
    }
  }

  // Active Real-Time Render Engine (Canvas MediaRecorder Engine)
  async function triggerExport() {
    if (!activeClip) return;
    
    const exportId = `export-${Date.now()}`;
    addToQueue({
      id: exportId,
      clipId: activeClip.id,
      title: activeClip.title,
      quality: resolution,
      format: format,
      fps: fps
    });

    toast.info("Clip added to render queue! Initializing render canvas...");

    try {
      // Prioritize lightweight progressive stream (format 18, 360p/480p combined) to avoid buffering lag during export
      const videoStream = formats.find(f => f.id === '18') ||
                          formats.find(f => f.resolution === '360p' && f.vcodec !== 'none' && f.acodec !== 'none') ||
                          formats.find(f => f.resolution === '480p' && f.vcodec !== 'none' && f.acodec !== 'none') ||
                          formats.find(f => f.vcodec !== 'none' && f.acodec !== 'none') || 
                          formats[0];
      if (!videoStream) throw new Error("No video streaming formats resolved");

      // Setup rendering elements
      const video = renderVideoRef.current;
      video.src = videoStream.url;
      video.crossOrigin = 'anonymous';
      video.muted = true; // render muted to avoid speakers blast

      // Setup background music if active
      let bgAudio = null;
      if (activeClip.editingState.bgMusicUrl) {
        bgAudio = renderAudioRef.current;
        const proxiedMusicUrl = activeClip.editingState.bgMusicUrl.startsWith('http')
          ? `/api/proxy?url=${encodeURIComponent(activeClip.editingState.bgMusicUrl)}`
          : activeClip.editingState.bgMusicUrl;
        bgAudio.src = proxiedMusicUrl;
        bgAudio.crossOrigin = 'anonymous';
        bgAudio.volume = activeClip.editingState.bgMusicVolume;
        bgAudio.loop = true;
      }

      updateQueueItem(exportId, { status: 'processing', progress: 5 });

      // Wait for metadata to load
      await new Promise((resolve) => {
        video.onloadedmetadata = () => resolve();
      });

      // Seek to clip start
      video.currentTime = activeClip.start;
      await new Promise((resolve) => {
        video.onseeked = () => resolve();
      });

      updateQueueItem(exportId, { progress: 15 });

      // Setup hidden canvas
      const canvas = document.createElement('canvas');
      // Set resolution
      let canvasW = 1280;
      let canvasH = 720;
      if (activeClip.aspectRatio === '9:16') {
        canvasW = 720;
        canvasH = 1280;
      } else if (activeClip.aspectRatio === '1:1') {
        canvasW = 720;
        canvasH = 720;
      }
      
      canvas.width = canvasW;
      canvas.height = canvasH;
      const ctx = canvas.getContext('2d');

      // Setup Web Audio nodes for mixing
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioContextClass();
      const dest = audioCtx.createMediaStreamDestination();

      const videoSource = audioCtx.createMediaElementSource(video);
      const videoGain = audioCtx.createGain();
      videoGain.gain.value = 1.0;
      videoSource.connect(videoGain);
      videoGain.connect(dest);

      let bgSource = null;
      let bgGain = null;
      if (bgAudio) {
        bgSource = audioCtx.createMediaElementSource(bgAudio);
        bgGain = audioCtx.createGain();
        bgGain.gain.value = activeClip.editingState.bgMusicVolume;
        bgSource.connect(bgGain);
        bgGain.connect(dest);
      }

      // Mix canvas stream and audio stream
      const canvasStream = canvas.captureStream(fps);
      const mixedStream = new MediaStream();
      canvasStream.getVideoTracks().forEach(track => mixedStream.addTrack(track));
      dest.stream.getAudioTracks().forEach(track => mixedStream.addTrack(track));

      // Setup MediaRecorder
      const options = { mimeType: `video/${format};codecs=vp9,opus` };
      let recorder;
      try {
        recorder = new MediaRecorder(mixedStream, options);
      } catch (e) {
        // Fallback codec if VP9 is not supported
        recorder = new MediaRecorder(mixedStream, { mimeType: `video/${format}` });
      }

      const chunks = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      const clipDuration = activeClip.end - activeClip.start;

      recorder.onstop = async () => {
        updateQueueItem(exportId, { progress: 95 });
        const videoBlob = new Blob(chunks, { type: `video/${format}` });
        const outputBlobUrl = URL.createObjectURL(videoBlob);
        
        // Generate thumbnail frame from canvas
        const thumbnailDataUrl = canvas.toDataURL('image/jpeg', 0.6);

        // Save to IndexedDB
        await saveExport({
          id: exportId,
          clipId: activeClip.id,
          videoId: activeClip.videoId,
          title: activeClip.title,
          blob: videoBlob,
          thumbnail: thumbnailDataUrl
        });

        // Clean up audio nodes
        videoGain.disconnect();
        if (bgGain) bgGain.disconnect();
        audioCtx.close();

        updateQueueItem(exportId, { 
          status: 'completed', 
          progress: 100, 
          outputBlobUrl 
        });
        
        toast.success(`Successfully rendered: ${activeClip.title}`);
        loadGallery();
      };

      // Start recording
      recorder.start();
      video.play();
      if (bgAudio) bgAudio.play();

      // Rendering frame loop
      const drawInterval = setInterval(() => {
        if (video.paused || video.ended || video.currentTime >= activeClip.end) {
          clearInterval(drawInterval);
          video.pause();
          if (bgAudio) bgAudio.pause();
          recorder.stop();
          return;
        }

        // 1. Calculate rendering progress
        const currentElapsed = video.currentTime - activeClip.start;
        const progressPct = Math.round(15 + (currentElapsed / clipDuration) * 75);
        updateQueueItem(exportId, { progress: Math.min(92, progressPct) });

        // 2. Draw video frame centered
        ctx.clearRect(0, 0, canvasW, canvasH);
        
        // Apply CSS grading filter on canvas
        const activeFilter = filterPresets.find(p => p.name === activeClip.editingState.colorFilter);
        ctx.filter = activeFilter ? activeFilter.css : 'none';

        // Aspect cropping calculations
        let drawW = canvasW;
        let drawH = canvasH;
        let drawX = 0;
        let drawY = 0;
        
        const videoRatio = video.videoWidth / video.videoHeight;
        const canvasRatio = canvasW / canvasH;

        if (videoRatio > canvasRatio) {
          drawW = canvasH * videoRatio;
          drawX = (canvasW - drawW) / 2;
        } else {
          drawH = canvasW / videoRatio;
          drawY = (canvasH - drawH) / 2;
        }

        // Apply simulated face tracking drift
        let faceOffsetShift = 0;
        if (activeClip.aspectRatio === '9:16' && videoRatio > canvasRatio) {
          // drift scale translation
          const wave = Math.sin(video.currentTime / 1.5) * 12 + Math.cos(video.currentTime / 4) * 8;
          faceOffsetShift = wave * (canvasW / 100);
        }

        ctx.drawImage(video, drawX + faceOffsetShift, drawY, drawW, drawH);
        ctx.filter = 'none'; // reset filter for overlays

        // 3. Draw Watermark Branding text
        if (activeClip.editingState.watermarkEnabled) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
          ctx.font = 'bold 20px "Plus Jakarta Sans", sans-serif';
          ctx.fillText(activeClip.editingState.watermarkText || 'AI Clipper', 30, 50);
        }

        // 4. Draw Karaoke captions burned-in
        const time = video.currentTime;
        const activeCaption = captions.find(c => time >= c.start && time < (c.start + c.duration));
        
        if (activeCaption) {
          const style = activeClip.editingState.captionStyle;
          const words = activeCaption.text.split(' ');
          const elapsed = time - activeCaption.start;
          const wordDuration = activeCaption.duration / words.length;
          const activeIdx = Math.floor(elapsed / wordDuration);

          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          
          let fontSize = 36;
          if (style.fontSize) fontSize = style.fontSize * 1.5; // upscale for canvas
          
          ctx.font = `800 ${fontSize}px "Outfit", sans-serif`;

          // Position alignment
          let captionY = canvasH / 2;
          if (style.position === 'top') {
            captionY = canvasH * 0.2;
          } else if (style.position === 'bottom') {
            captionY = canvasH * 0.85;
          }

          // Compute text spacing to draw word-by-word with karaoke highlighting
          const textHeight = fontSize * 1.2;
          
          // Simple multi-word line drawer with active highlight
          const totalWidth = ctx.measureText(activeCaption.text).width;
          
          if (totalWidth < canvasW * 0.9) {
            // Single line drawing
            let currentX = (canvasW - totalWidth) / 2;
            ctx.textAlign = 'left';

            words.forEach((word, idx) => {
              const wordW = ctx.measureText(word + ' ').width;
              const isActive = idx === activeIdx;

              // Shadow borders for readability
              ctx.lineWidth = 6;
              ctx.strokeStyle = '#000000';
              ctx.strokeText(word, currentX, captionY);

              // Fills color
              if (style.preset === 'yellow-bounce') {
                ctx.fillStyle = isActive ? '#facc15' : '#ffffff';
              } else if (style.preset === 'neon-glow') {
                ctx.fillStyle = isActive ? '#c084fc' : '#e4e4e7';
                ctx.shadowColor = '#a855f7';
                ctx.shadowBlur = isActive ? 15 : 0;
              } else if (style.preset === 'gradient-cyan') {
                ctx.fillStyle = isActive ? '#06b6d4' : '#f4f4f5';
              } else {
                ctx.fillStyle = isActive ? '#ffffff' : '#a1a1aa';
              }

              ctx.fillText(word, currentX, captionY);
              ctx.shadowBlur = 0; // reset shadow
              
              currentX += wordW;
            });
          } else {
            // Split into two lines
            const mid = Math.ceil(words.length / 2);
            const line1 = words.slice(0, mid);
            const line2 = words.slice(mid);

            const drawLine = (lineWords, lineY, startWordIdx) => {
              const lineText = lineWords.join(' ');
              const lineW = ctx.measureText(lineText).width;
              let currentX = (canvasW - lineW) / 2;
              ctx.textAlign = 'left';

              lineWords.forEach((word, idx) => {
                const wordW = ctx.measureText(word + ' ').width;
                const absoluteIdx = startWordIdx + idx;
                const isActive = absoluteIdx === activeIdx;

                ctx.lineWidth = 6;
                ctx.strokeStyle = '#000000';
                ctx.strokeText(word, currentX, lineY);

                if (style.preset === 'yellow-bounce') {
                  ctx.fillStyle = isActive ? '#facc15' : '#ffffff';
                } else if (style.preset === 'neon-glow') {
                  ctx.fillStyle = isActive ? '#c084fc' : '#e4e4e7';
                  ctx.shadowColor = '#a855f7';
                  ctx.shadowBlur = isActive ? 15 : 0;
                } else {
                  ctx.fillStyle = isActive ? '#ffffff' : '#a1a1aa';
                }

                ctx.fillText(word, currentX, lineY);
                ctx.shadowBlur = 0;
                currentX += wordW;
              });
            };

            drawLine(line1, captionY - textHeight / 2, 0);
            drawLine(line2, captionY + textHeight / 2, mid);
          }
        }

        // Speech-aware audio ducking mix node controls
        if (activeClip.editingState.voiceDucking && bgGain) {
          const isSpeaking = captions.some(c => video.currentTime >= c.start && video.currentTime < (c.start + c.duration));
          bgGain.gain.value = isSpeaking ? activeClip.editingState.bgMusicVolume * 0.25 : activeClip.editingState.bgMusicVolume;
        }

      }, 1000 / fps);

    } catch (err) {
      console.error("Rendering failed:", err);
      updateQueueItem(exportId, { status: 'failed', error: err.message || 'Export error' });
      toast.error(`Rendering failed: ${err.message}`);
    }
  }

  async function handleDeleteExport(id) {
    if (confirm("Are you sure you want to delete this rendered clip from your library?")) {
      await db.exports.delete(id);
      loadGallery();
      toast.success("Clip deleted from gallery.");
    }
  }

  async function handleBatchZipDownload() {
    if (gallery.length === 0) {
      toast.error("No rendered clips in gallery to compile!");
      return;
    }

    toast.info("Compiling ZIP archive of all clips...", { duration: 3000 });
    const zip = new JSZip();

    try {
      for (const item of gallery) {
        // Filename formatting
        const cleanTitle = item.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const filename = `clip_${item.videoId}_${cleanTitle}.webm`;
        zip.file(filename, item.blob);
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const zipUrl = URL.createObjectURL(zipBlob);
      
      const link = document.createElement('a');
      link.href = zipUrl;
      link.download = `ai_clipped_bundle_${currentVideo ? currentVideo.id : 'exports'}.zip`;
      link.click();
      
      toast.success("ZIP archive downloaded successfully!");
    } catch (err) {
      console.error("ZIP creation error:", err);
      toast.error("Failed to compile ZIP archive.");
    }
  }

  function handleSocialShare(e, item, platform) {
    e.stopPropagation();
    const downloadFilename = `AI_Clipped_${item.title.replace(/\s+/g, '_')}.webm`;
    
    // Create direct download links for socials triggers
    let shareUrl = '';
    if (platform === 'instagram') {
      shareUrl = 'https://www.instagram.com/';
      toast.info("Instagram opened! Select and upload your downloaded clip.");
    } else if (platform === 'youtube') {
      shareUrl = 'https://studio.youtube.com/';
      toast.info("YouTube Studio opened! Select your downloaded clip for Shorts upload.");
    } else if (platform === 'tiktok') {
      shareUrl = 'https://www.tiktok.com/upload';
      toast.info("TikTok opened! Upload your downloaded clip.");
    }
    
    // Trigger download
    const link = document.createElement('a');
    link.href = URL.createObjectURL(item.blob);
    link.download = downloadFilename;
    link.click();
    
    setTimeout(() => {
      window.open(shareUrl, '_blank');
    }, 1200);
  }

  return (
    <div className="space-y-10">
      
      {/* Upper Grid: Active Export Settings & Progress queue */}
      {activeClip && (
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Left 5 Cols: Export Settings Panel */}
          <div className="lg:col-span-5 space-y-4">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
              <Sliders className="w-4 h-4 text-brand-purple" /> Export Configuration
            </span>
            <div className="glass-panel p-6 rounded-3xl shadow-xl space-y-5">
              <div className="space-y-1.5">
                <span className="text-xs font-bold text-zinc-400 block">Render Engine</span>
                <div className="flex items-center gap-1.5 bg-black/40 p-1 rounded-xl border border-white/5">
                  <button 
                    onClick={() => setEngine('canvas')}
                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      engine === 'canvas' ? 'bg-brand-purple text-white' : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Canvas Recorder (Fast)
                  </button>
                  <button 
                    onClick={() => {
                      setEngine('ffmpeg');
                      toast.info("FFmpeg.wasm requires SharedArrayBuffer headers. Using canvas recorder is recommended.");
                    }}
                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      engine === 'ffmpeg' ? 'bg-brand-purple text-white' : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    FFmpeg WebAssembly
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <span className="text-xs font-bold text-zinc-400 block">Output Format</span>
                  <select 
                    value={format}
                    onChange={(e) => setFormat(e.target.value)}
                    className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white outline-none focus:border-brand-purple"
                  >
                    <option value="webm">WebM (Fast codec)</option>
                    <option value="mp4">MP4 (Standard H.264)</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <span className="text-xs font-bold text-zinc-400 block">Frame Rate (FPS)</span>
                  <select 
                    value={fps}
                    onChange={(e) => setFps(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white outline-none focus:border-brand-purple"
                  >
                    <option value={24}>24 FPS (Cinematic)</option>
                    <option value={30}>30 FPS (Standard)</option>
                    <option value={60}>60 FPS (Smooth)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="text-xs font-bold text-zinc-400 block">Export Resolution</span>
                <select 
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                  className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white outline-none focus:border-brand-purple"
                >
                  <option value="720p">720p HD ({activeClip.aspectRatio === '9:16' ? '720x1280' : activeClip.aspectRatio === '1:1' ? '720x720' : '1280x720'})</option>
                  <option value="1080p">1080p Full HD ({activeClip.aspectRatio === '9:16' ? '1080x1920' : activeClip.aspectRatio === '1:1' ? '1080x1080' : '1920x1080'})</option>
                </select>
              </div>

              <button
                onClick={triggerExport}
                className="w-full py-3.5 bg-gradient-to-r from-brand-purple via-brand-pink to-brand-cyan rounded-xl text-white text-xs font-bold shadow-lg hover:shadow-brand-purple/20 transition-all duration-300 hover:scale-[1.02] cursor-pointer flex items-center justify-center gap-1.5"
              >
                ⚡ Start Video Render
              </button>
            </div>
          </div>

          {/* Right 7 Cols: Active Export Queue */}
          <div className="lg:col-span-7 space-y-4">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
              <Loader2 className="w-4 h-4 text-brand-pink animate-spin" /> Render & Processing Queue
            </span>
            
            <div className="glass-panel p-6 rounded-3xl shadow-xl min-h-[295px] flex flex-col justify-between gap-6">
              {exportQueue.length > 0 ? (
                <div className="space-y-4 flex-1 overflow-y-auto max-h-[220px] scrollbar-none">
                  {exportQueue.map((item) => (
                    <div key={item.id} className="glass-card p-4 rounded-xl border border-white/5 space-y-3 relative">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5 max-w-sm">
                          <h4 className="text-sm font-bold text-white line-clamp-1">{item.title}</h4>
                          <p className="text-[10px] text-zinc-500 font-mono">
                            Resolution: {item.quality} | Format: {item.format} | FPS: {item.fps}
                          </p>
                        </div>
                        <span className={`text-[10px] uppercase font-extrabold tracking-wider px-2.5 py-0.5 rounded-full border ${
                          item.status === 'completed'
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                            : item.status === 'failed'
                            ? 'bg-red-500/10 border-red-500/30 text-red-400'
                            : 'bg-brand-purple/10 border-brand-purple/30 text-brand-purple animate-pulse'
                        }`}>
                          {item.status}
                        </span>
                      </div>
                      
                      {/* Progress bar */}
                      <div className="space-y-1">
                        <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden border border-white/5">
                          <div 
                            className={`h-full transition-all duration-300 ${
                              item.status === 'completed'
                                ? 'bg-emerald-500'
                                : item.status === 'failed'
                                ? 'bg-red-500'
                                : 'bg-gradient-to-r from-brand-purple to-brand-pink'
                            }`}
                            style={{ width: `${item.progress}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-zinc-400">
                          <span>Progress: {item.progress}%</span>
                          {item.status === 'completed' && item.outputBlobUrl && (
                            <a 
                              href={item.outputBlobUrl}
                              download={`clipped_${item.id}.webm`}
                              className="text-brand-cyan hover:underline font-bold flex items-center gap-0.5 cursor-pointer"
                            >
                              Download directly <Download className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      </div>

                      {/* Cancel render */}
                      {item.status !== 'completed' && item.status !== 'failed' && (
                        <button
                          onClick={() => removeFromQueue(item.id)}
                          className="absolute right-3 top-3 text-[10px] font-bold text-zinc-500 hover:text-red-500 transition cursor-pointer"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center text-zinc-500 text-sm gap-2">
                  <AlertTriangle className="w-8 h-8 text-zinc-600" />
                  <span>No active renders in progress. Start a render from the configuration panel.</span>
                </div>
              )}

              {/* Back to Editor shortcut */}
              <button
                onClick={() => navigate(`/editor/${activeClip.id}`)}
                className="w-full py-2 border border-white/5 rounded-xl text-zinc-400 hover:text-white text-xs font-bold hover:bg-white/5 transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" /> Back to Editor
              </button>
            </div>
          </div>

        </section>
      )}

      {/* Curated/Saved Clip Library Gallery (Feature 5) */}
      <section className="space-y-6 pt-6 border-t border-white/5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-xl font-bold font-display text-white flex items-center gap-2">
              <Film className="w-5 h-5 text-brand-purple" /> Export Library & Gallery
            </h3>
            <p className="text-xs text-zinc-400">
              Browser IndexedDB gallery grid. Save, share, or download multiple clips as a ZIP archive.
            </p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3.5">
            {/* Storage estimate metrics */}
            <div className="flex items-center gap-1.5 text-zinc-500 text-xs font-semibold bg-white/5 px-3 py-1.5 rounded-xl border border-white/5">
              <HardDrive className="w-3.5 h-3.5" />
              <span>Storage Used: {storageStats.used}MB ({storageStats.percentage}%)</span>
            </div>

            {gallery.length > 0 && (
              <button
                onClick={handleBatchZipDownload}
                className="flex items-center gap-1.5 px-4 py-2 bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/15 text-white rounded-xl text-xs font-bold transition-all duration-300 hover:scale-[1.02] cursor-pointer"
              >
                <Archive className="w-4 h-4 text-brand-cyan" /> Batch Download (ZIP)
              </button>
            )}
          </div>
        </div>

        {gallery.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {gallery.map((item) => {
              const downloadFilename = `AI_Clipped_${item.title.replace(/\s+/g, '_')}.webm`;
              const blobUrl = URL.createObjectURL(item.blob);
              
              return (
                <div
                  key={item.id}
                  className="glass-card rounded-xl overflow-hidden shadow-md group relative border border-white/5"
                >
                  <div className="relative aspect-video bg-zinc-950">
                    <img
                      src={item.thumbnail}
                      alt={item.title}
                      className="w-full h-full object-cover"
                    />
                    
                    {/* Share overlay triggers */}
                    <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 gap-3 px-4 text-center">
                      <span className="text-[10px] font-bold text-zinc-300 uppercase tracking-widest">Share to Socials</span>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={(e) => handleSocialShare(e, item, 'instagram')}
                          className="p-2 bg-gradient-to-tr from-yellow-500 via-pink-500 to-purple-500 hover:scale-115 rounded-lg text-white text-xs font-bold transition duration-200 cursor-pointer"
                          title="Instagram Reels"
                        >
                          Reels
                        </button>
                        <button 
                          onClick={(e) => handleSocialShare(e, item, 'youtube')}
                          className="p-2 bg-red-600 hover:scale-115 rounded-lg text-white text-xs font-bold transition duration-200 cursor-pointer"
                          title="YouTube Shorts"
                        >
                          Shorts
                        </button>
                        <button 
                          onClick={(e) => handleSocialShare(e, item, 'tiktok')}
                          className="p-2 bg-zinc-900 border border-white/10 hover:scale-115 rounded-lg text-white text-xs font-bold transition duration-200 cursor-pointer"
                          title="TikTok"
                        >
                          TikTok
                        </button>
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-4 space-y-3 relative">
                    <h4 className="font-bold text-sm text-white line-clamp-1 pr-6">{item.title}</h4>
                    <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 font-mono">
                      <span>YouTube ID: {item.videoId}</span>
                      <span>•</span>
                      <span>{(item.blob.size / (1024 * 1024)).toFixed(1)} MB</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/5">
                      <a
                        href={blobUrl}
                        download={downloadFilename}
                        className="py-2 bg-white/5 border border-white/5 hover:bg-white/10 text-white rounded-lg text-xs font-bold transition text-center flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" /> Download
                      </a>
                      <button
                        onClick={() => navigate(`/editor/${item.clipId}`)}
                        className="py-2 border border-white/5 hover:bg-white/5 text-zinc-300 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" /> Re-Edit
                      </button>
                    </div>

                    {/* Delete button */}
                    <button
                      onClick={() => handleDeleteExport(item.id)}
                      className="absolute right-3 top-3 text-zinc-500 hover:text-red-500 p-1 rounded hover:bg-white/5 transition cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="glass-panel p-10 rounded-2xl text-center text-zinc-500 text-sm">
            No exported clips found in gallery. Configure and render a clip above to save it to your library!
          </div>
        )}
      </section>

      {/* Hidden HTML5 Video and Audio nodes for background rendering */}
      <video ref={renderVideoRef} style={{ display: 'none' }} />
      <audio ref={renderAudioRef} style={{ display: 'none' }} />

    </div>
  );
}
