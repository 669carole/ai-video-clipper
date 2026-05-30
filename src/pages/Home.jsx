import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { 
  Play, Sparkles, CheckCircle, Eye, 
  Calendar, Clock, Film, Edit3, Trash2, ArrowRight
} from 'lucide-react';

const YoutubeIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M23.498 6.163a3.003 3.003 0 0 0-2.11-2.11C19.517 3.545 12 3.545 12 3.545s-7.517 0-9.388.508a3.003 3.003 0 0 0-2.11 2.11C0 8.033 0 12 0 12s0 3.967.502 5.837a3.003 3.003 0 0 0 2.11 2.11c1.871.508 9.388.508 9.388.508s7.517 0 9.388-.508a3.003 3.003 0 0 0 2.11-2.11C24 15.967 24 12 24 12s0-3.967-.502-5.837zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
  </svg>
);

import { useVideoStore } from '../stores/videoStore';
import { useClipStore } from '../stores/clipStore';
import { useSettingsStore } from '../stores/settingsStore';
import { getYoutubeId, fetchVideoDetails, formatDuration, formatViews } from '../utils/youtube';
import { detectViralMoments } from '../utils/ai';
import { saveProject, saveClip, getClips, deleteClipFromDb, db } from '../utils/indexeddb';

export default function Home() {
  const navigate = useNavigate();
  const { 
    currentVideo, 
    isLoading, 
    error, 
    setCurrentVideo, 
    setFormats, 
    setCaptions, 
    setIsLoading, 
    setError, 
    resetVideo 
  } = useVideoStore();

  const { 
    clips, 
    addClip, 
    deleteClip,
    detectedMoments, 
    momentDetectionProgress, 
    isDetectingMoments, 
    setDetectedMoments, 
    setMomentDetectionProgress, 
    setIsDetectingMoments,
    setClips
  } = useClipStore();

  const [inputUrl, setInputUrl] = useState('');
  const [recentClips, setRecentClips] = useState([]);

  // Examples URLs for testing
  const examples = [
    { label: 'Never Gonna Give You Up', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
    { label: 'Me at the zoo', url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw' },
  ];

  useEffect(() => {
    loadRecentClips();
  }, []);

  async function loadRecentClips() {
    try {
      const allClips = await getClips();
      setRecentClips(allClips);
    } catch (err) {
      console.error("Failed to load recent clips:", err);
    }
  }

  async function handleFetch() {
    const videoId = getYoutubeId(inputUrl);
    if (!videoId) {
      toast.error('Invalid YouTube URL! Please enter a valid link.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setDetectedMoments([]);
    
    toast.info('Fetching video metadata and transcripts...', { duration: 3000 });

    try {
      const data = await fetchVideoDetails(inputUrl);
      
      setCurrentVideo({
        id: data.id,
        title: data.title,
        description: data.description,
        duration: data.duration,
        thumbnail: data.thumbnail,
        channel: data.channel,
        viewCount: data.viewCount,
        uploadDate: data.uploadDate
      });
      setFormats(data.formats);
      setCaptions(data.captions);
      
      // Save project metadata to IndexedDB
      await saveProject({
        id: data.id,
        videoId: data.id,
        title: data.title,
        duration: data.duration,
        thumbnail: data.thumbnail,
        channel: data.channel
      });

      toast.success('Video loaded successfully!');
      
      // Automatically trigger moment detection
      triggerAiAnalysis(data.captions, data.duration, data.title, data.id);
    } catch (err) {
      console.error("Fetch error:", err);
      setError(err.message || 'Failed to load video info');
      toast.error(`Error loading video: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  }

  async function triggerAiAnalysis(captionsList, durationSeconds, videoTitle, videoId) {
    setIsDetectingMoments(true);
    setMomentDetectionProgress(0);
    toast.info('AI is analyzing transcripts for viral hooks...');

    try {
      const moments = await detectViralMoments(captionsList, durationSeconds, (progress) => {
        setMomentDetectionProgress(progress);
      });

      setDetectedMoments(moments);
      toast.success(`Detected ${moments.length} viral moment suggestions!`);
    } catch (err) {
      console.error("AI moment detection error:", err);
      toast.error('AI Analysis failed. Generating fallback segments...');
    } finally {
      setIsDetectingMoments(false);
    }
  }

  function handleSelectMoment(moment) {
    const clipId = `clip-${Date.now()}`;
    const newClip = {
      id: clipId,
      videoId: currentVideo.id,
      title: `${currentVideo.title.substring(0, 30)} - Hook #${moment.id.split('-')[1]}`,
      start: moment.start,
      end: moment.end,
      viralityScore: moment.score,
      reason: moment.reason.join(', '),
      aspectRatio: '9:16', // vertical default
      editingState: {
        captionStyle: {
          preset: 'yellow-bounce',
          fontSize: 24,
          color: '#facc15',
          strokeColor: '#000000',
          position: 'middle' // top, middle, bottom
        },
        colorFilter: 'vibrant',
        watermarkEnabled: false,
        bgMusicUrl: null,
        bgMusicVolume: 0.3,
        voiceDucking: true,
        emojiOverlays: []
      }
    };

    // Save clip to Zustand store and DB
    addClip(newClip);
    saveClip(newClip);
    
    toast.success('Clip created! Redirecting to Editor...');
    navigate(`/editor/${clipId}`);
  }

  async function handleDeleteRecentClip(e, id) {
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this clip?")) {
      await deleteClipFromDb(id);
      deleteClip(id);
      loadRecentClips();
      toast.success('Clip deleted successfully.');
    }
  }

  function handleQuickExample(url) {
    setInputUrl(url);
    toast.info("Example URL loaded! Click 'Fetch & Analyze' to start.");
  }

  return (
    <div className="space-y-10">
      {/* Intro Hero Section */}
      <section className="text-center py-6 max-w-3xl mx-auto space-y-4">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center gap-2 px-3 py-1 bg-brand-purple/10 border border-brand-purple/20 rounded-full text-brand-purple text-xs font-semibold tracking-wider uppercase mb-2"
        >
          <Sparkles className="w-3.5 h-3.5" /> AI Viral Moment Highlighter
        </motion.div>
        <motion.h2 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-4xl sm:text-5xl font-extrabold tracking-tight font-display text-white leading-tight"
        >
          Convert Long Videos Into <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-purple via-brand-pink to-brand-cyan">Viral Clips</span> In Seconds
        </motion.h2>
        <p className="text-zinc-400 text-base max-w-xl mx-auto">
          AI Video Clipper automatically transcribes YouTube videos, identifies emotional peaks, keyword triggers, and audio dynamics to deliver high-scoring Reels, Shorts, and TikToks.
        </p>
      </section>

      {/* Input Section */}
      <section className="max-w-2xl mx-auto">
        <div className="glass-panel p-6 rounded-3xl shadow-xl space-y-4">
          <div className="relative">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500">
              <YoutubeIcon className="w-6 h-6 text-red-500" />
            </div>
            <input
              type="text"
              placeholder="Paste YouTube Video URL (e.g. Shorts, long form, podcast)"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              className="w-full pl-14 pr-36 py-4 glass-input text-sm"
            />
            <button
              onClick={handleFetch}
              disabled={isLoading || !inputUrl}
              className="absolute right-2 top-1/2 -translate-y-1/2 px-5 py-2 bg-gradient-to-r from-brand-purple to-brand-pink rounded-xl text-white text-xs font-bold shadow-md hover:shadow-brand-purple/20 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02]"
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Fetching...
                </span>
              ) : 'Fetch & Analyze'}
            </button>
          </div>
          
          <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400">
            <span className="font-semibold text-zinc-500 uppercase tracking-wider text-[10px]">Try Quick Examples:</span>
            {examples.map((ex, index) => (
              <button
                key={index}
                onClick={() => handleQuickExample(ex.url)}
                className="px-3 py-1 bg-white/5 border border-white/5 rounded-lg hover:bg-white/10 hover:border-white/10 hover:text-white transition-all duration-200"
              >
                {ex.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Video Details & AI Analysis Output */}
      <AnimatePresence mode="wait">
        {currentVideo && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-8"
          >
            {/* Left side: Video Card */}
            <div className="lg:col-span-1 space-y-6">
              <h3 className="text-lg font-bold font-display text-white flex items-center gap-2">
                <Film className="w-4 h-4 text-brand-purple" /> Video Details
              </h3>
              <div className="glass-card rounded-2xl overflow-hidden shadow-lg border border-white/5">
                <div className="relative aspect-video group cursor-pointer">
                  <img
                    src={currentVideo.thumbnail}
                    alt={currentVideo.title}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <span className="w-12 h-12 rounded-full bg-brand-purple flex items-center justify-center text-white shadow-xl shadow-brand-purple/35 transform scale-90 group-hover:scale-100 transition-all duration-300">
                      <Play className="w-5 h-5 fill-current ml-1" />
                    </span>
                  </div>
                  <div className="absolute bottom-3 right-3 px-2 py-1 bg-black/75 rounded text-[10px] font-bold text-white flex items-center gap-1">
                    <Clock className="w-3 h-3 text-zinc-300" /> {formatDuration(currentVideo.duration)}
                  </div>
                </div>
                <div className="p-5 space-y-4">
                  <div>
                    <h4 className="font-bold text-white leading-snug line-clamp-2 hover:line-clamp-none transition-all duration-300 cursor-pointer">
                      {currentVideo.title}
                    </h4>
                    <p className="text-xs text-brand-cyan font-semibold mt-1 flex items-center gap-1">
                      {currentVideo.channel} <CheckCircle className="w-3 h-3 fill-current" />
                    </p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 text-xs text-zinc-400 border-t border-white/5 pt-4">
                    <div className="flex items-center gap-1.5">
                      <Eye className="w-4 h-4 text-zinc-500" />
                      <span>{formatViews(currentVideo.viewCount)} views</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-zinc-500" />
                      <span>{currentVideo.uploadDate ? new Date(currentVideo.uploadDate.substring(0,4), currentVideo.uploadDate.substring(4,6)-1, currentVideo.uploadDate.substring(6,8)).toLocaleDateString(undefined, {month: 'short', year: 'numeric'}) : 'N/A'}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right side: AI Virality Moments */}
            <div className="lg:col-span-2 space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold font-display text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-brand-pink" /> AI Viral Highlight Suggestions
                </h3>
                {detectedMoments.length > 0 && (
                  <button 
                    onClick={() => {
                      // Select all high impact moments (>70)
                      const highImpact = detectedMoments.filter(m => m.score >= 70);
                      if (highImpact.length === 0) {
                        toast.info("No moments with score >= 70%. Selecting top 3.");
                        detectedMoments.slice(0, 3).forEach(handleSelectMoment);
                      } else {
                        highImpact.forEach(handleSelectMoment);
                        toast.success(`Selected and added ${highImpact.length} clips to your editor!`);
                      }
                    }}
                    className="text-xs font-semibold text-brand-cyan hover:underline cursor-pointer flex items-center gap-1"
                  >
                    Select All High-Impact <ArrowRight className="w-3 h-3" />
                  </button>
                )}
              </div>

              {isDetectingMoments ? (
                <div className="glass-panel p-8 rounded-2xl text-center space-y-4">
                  <div className="w-16 h-16 bg-brand-purple/10 border border-brand-purple/20 rounded-full flex items-center justify-center mx-auto text-brand-purple animate-bounce">
                    <Sparkles className="w-7 h-7" />
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-bold text-white text-md">AI Model Scoring Sentiment & Keywords</h4>
                    <p className="text-xs text-zinc-400 max-w-sm mx-auto">
                      Downloading model Xenova/distilbert-base-uncased-finetuned-sst-2-english and segmenting transcript streams...
                    </p>
                  </div>
                  <div className="w-full max-w-md mx-auto bg-white/5 rounded-full h-2 overflow-hidden border border-white/5">
                    <div 
                      className="bg-gradient-to-r from-brand-purple to-brand-pink h-full transition-all duration-300"
                      style={{ width: `${momentDetectionProgress}%` }}
                    />
                  </div>
                  <span className="text-xs text-zinc-400 font-bold">{momentDetectionProgress}% Complete</span>
                </div>
              ) : detectedMoments.length > 0 ? (
                <div className="space-y-4 max-h-[550px] overflow-y-auto pr-2 scrollbar-none">
                  {detectedMoments.map((moment, idx) => (
                    <motion.div
                      key={moment.id}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="glass-card glass-card-hover p-4 rounded-xl border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="space-y-2 max-w-md">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-zinc-300">Moment #{idx + 1}</span>
                          <span className="text-[10px] bg-white/5 border border-white/10 text-zinc-400 px-2 py-0.5 rounded-full font-mono font-semibold">
                            {formatDuration(moment.start)} - {formatDuration(moment.end)} ({moment.duration}s)
                          </span>
                          {moment.reason.map((tag) => (
                            <span 
                              key={tag} 
                              className="text-[9px] bg-brand-purple/10 border border-brand-purple/20 text-brand-purple px-2 py-0.5 rounded-full font-bold uppercase tracking-wider"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                        <p className="text-sm font-semibold text-white line-clamp-1 italic">
                          "{moment.text || 'Loud speech segment detected.'}"
                        </p>
                      </div>
                      
                      <div className="flex items-center gap-4 justify-between sm:justify-end">
                        {/* Virality score badge */}
                        <div className="text-right">
                          <span className="text-[10px] uppercase font-bold text-zinc-500 block">Viral Potential</span>
                          <span className={`text-xl font-black font-display ${
                            moment.score >= 80 ? 'text-red-500' : moment.score >= 60 ? 'text-orange-400' : 'text-yellow-400'
                          }`}>
                            {moment.score}%
                          </span>
                        </div>
                        <button
                          onClick={() => handleSelectMoment(moment)}
                          className="px-4 py-2 bg-brand-purple hover:bg-brand-purple/80 text-white rounded-lg text-xs font-bold shadow-md hover:shadow-brand-purple/20 transition-all duration-300 flex items-center gap-1.5 cursor-pointer hover:scale-[1.02]"
                        >
                          <Edit3 className="w-3.5 h-3.5" /> Edit Clip
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="glass-panel p-8 rounded-2xl text-center text-zinc-500 text-sm">
                  Enter a YouTube URL above and click "Fetch & Analyze" to discover viral segments.
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Recent Clips Gallery (Feature 5) */}
      <section className="space-y-6 pt-6 border-t border-white/5">
        <h3 className="text-xl font-bold font-display text-white flex items-center gap-2">
          <Film className="w-5 h-5 text-brand-purple" /> Recent Clips Gallery
        </h3>
        
        {recentClips.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {recentClips.map((clip) => (
              <motion.div
                key={clip.id}
                layout
                whileHover={{ y: -3 }}
                onClick={() => navigate(`/editor/${clip.id}`)}
                className="glass-card glass-card-hover rounded-xl overflow-hidden cursor-pointer shadow-md group relative"
              >
                <div className="relative aspect-video">
                  <img
                    src={`https://img.youtube.com/vi/${clip.videoId}/maxresdefault.jpg`}
                    alt={clip.title}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.target.src = `https://img.youtube.com/vi/${clip.videoId}/hqdefault.jpg`;
                    }}
                  />
                  <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <span className="w-10 h-10 rounded-full bg-brand-purple flex items-center justify-center text-white shadow-lg">
                      <Edit3 className="w-4.5 h-4.5" />
                    </span>
                  </div>
                  <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/70 rounded text-[9px] font-mono text-zinc-300">
                    {formatDuration(clip.start)} - {formatDuration(clip.end)}
                  </div>
                  <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-brand-pink rounded-md text-[9px] font-bold text-white flex items-center gap-0.5">
                    🔥 {clip.viralityScore}%
                  </div>
                </div>
                <div className="p-4 space-y-2 relative">
                  <h4 className="font-bold text-sm text-white line-clamp-1 pr-6">{clip.title}</h4>
                  <p className="text-[10px] text-zinc-500 font-mono">
                    Aspect Ratio: {clip.aspectRatio} | Tag: {clip.reason || 'Manual'}
                  </p>
                  
                  {/* Delete button */}
                  <button
                    onClick={(e) => handleDeleteRecentClip(e, clip.id)}
                    className="absolute right-3 top-3.5 p-1.5 text-zinc-500 hover:text-red-500 rounded-lg hover:bg-white/5 transition-all duration-200 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="glass-panel p-10 rounded-2xl text-center text-zinc-500 text-sm">
            No recent clips found. Start by entering a YouTube URL above and extracting clips!
          </div>
        )}
      </section>
    </div>
  );
}
