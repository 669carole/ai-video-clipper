import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { 
  Settings as SettingsIcon, Shield, Sliders, HardDrive, 
  Trash2, RefreshCw, Sparkles, Check, HelpCircle
} from 'lucide-react';

import { useSettingsStore } from '../stores/settingsStore';
import { getStorageUsage, db } from '../utils/indexeddb';

export default function Settings() {
  const {
    cloudflareApiToken,
    cloudflareAccountId,
    concurrentExports,
    exportQuality,
    exportFormat,
    exportFps,
    watermarkText,
    watermarkEnabled,
    useLocalAIOnly,
    youtubeCookies,
    setCloudflareApiToken,
    setCloudflareAccountId,
    setConcurrentExports,
    setExportQuality,
    setExportFormat,
    setExportFps,
    setWatermarkText,
    setWatermarkEnabled,
    setUseLocalAIOnly,
    setYoutubeCookies
  } = useSettingsStore();

  const [storageStats, setStorageStats] = useState({ used: '0', quota: '0', percentage: '0' });

  useEffect(() => {
    loadStorageStats();
  }, []);

  async function loadStorageStats() {
    try {
      const stats = await getStorageUsage();
      setStorageStats(stats);
    } catch (err) {
      console.error("Failed to load storage stats:", err);
    }
  }

  async function handleClearDatabase() {
    if (confirm("🚨 WARNING: This will permanently delete all saved projects, clips, and rendered videos from your browser storage. This cannot be undone! Are you sure?")) {
      try {
        await Promise.all([
          db.projects.clear(),
          db.clips.clear(),
          db.exports.clear()
        ]);
        toast.success("All local databases and galleries wiped successfully!");
        loadStorageStats();
      } catch (err) {
        console.error("Wiping error:", err);
        toast.error("Failed to wipe local storage cache.");
      }
    }
  }

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div className="flex items-center gap-2 border-b border-white/5 pb-4">
        <SettingsIcon className="w-6 h-6 text-brand-purple" />
        <h2 className="text-2xl font-bold font-display text-white">Application Settings</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Left Col: Menu Navigation info */}
        <div className="md:col-span-1 space-y-4">
          <div className="glass-panel p-5 rounded-2xl border border-white/5 space-y-3">
            <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Browser Storage</h4>
            <div className="flex items-center gap-2.5">
              <HardDrive className="w-5 h-5 text-brand-cyan" />
              <div className="space-y-0.5">
                <span className="text-sm font-bold text-white">{storageStats.used} MB Used</span>
                <span className="text-[10px] text-zinc-500 font-bold block">Quota Limit: {storageStats.quota} GB</span>
              </div>
            </div>
            <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden border border-white/5 mt-2">
              <div 
                className="bg-brand-cyan h-full transition-all duration-300"
                style={{ width: `${storageStats.percentage}%` }}
              />
            </div>
            <span className="text-[10px] text-zinc-500 font-bold">{storageStats.percentage}% of browser quota utilized</span>
          </div>

          <div className="glass-panel p-5 rounded-2xl border border-white/5 space-y-2 text-xs text-zinc-400 leading-relaxed">
            <h4 className="text-xs font-bold text-white flex items-center gap-1">
              <HelpCircle className="w-3.5 h-3.5 text-brand-purple" /> How does it work?
            </h4>
            <p>
              AI Video Clipper runs entirely client-side inside your web browser. Transcriptions, sentiment indexing, visual cropping, and audio mixing are executed locally.
            </p>
            <p>
              Videos are rendered dynamically inside a hidden canvas and recorded directly into a local video Blob.
            </p>
          </div>
        </div>

        {/* Right 2 Cols: Form Sections */}
        <div className="md:col-span-2 space-y-6">
          
          {/* Section 1: AI Analysis Configuration */}
          <div className="glass-panel p-6 rounded-3xl shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5 border-b border-white/5 pb-2.5">
              <Sparkles className="w-4 h-4 text-brand-purple" /> AI Models & API Integrations
            </h3>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-white block">In-Browser Local AI (Hugging Face)</span>
                <span className="text-[10px] text-zinc-500 block">
                  Execute DistilBERT sentiment scoring entirely locally in your browser. Bypasses APIs.
                </span>
              </div>
              <input
                type="checkbox"
                checked={useLocalAIOnly}
                onChange={(e) => setUseLocalAIOnly(e.target.checked)}
                className="w-4 h-4 accent-brand-purple cursor-pointer"
              />
            </div>

            {!useLocalAIOnly && (
              <div className="space-y-4 pt-3 border-t border-white/5">
                <div className="space-y-1.5">
                  <span className="text-[10px] uppercase font-bold text-zinc-400 block">Cloudflare Workers AI Account ID</span>
                  <input
                    type="text"
                    value={cloudflareAccountId}
                    onChange={(e) => setCloudflareAccountId(e.target.value)}
                    placeholder="Enter Cloudflare Account ID"
                    className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs outline-none text-white focus:border-brand-purple"
                  />
                </div>
                <div className="space-y-1.5">
                  <span className="text-[10px] uppercase font-bold text-zinc-400 block">Cloudflare API Token</span>
                  <input
                    type="password"
                    value={cloudflareApiToken}
                    onChange={(e) => setCloudflareApiToken(e.target.value)}
                    placeholder="Enter Cloudflare API Token"
                    className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs outline-none text-white focus:border-brand-purple"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Section 1.5: YouTube Authentication Cookies */}
          <div className="glass-panel p-6 rounded-3xl shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5 border-b border-white/5 pb-2.5">
              <Shield className="w-4 h-4 text-brand-purple" /> YouTube Authentication (Cloud Hosting Bypass)
            </h3>

            <div className="space-y-2">
              <span className="text-xs font-bold text-white block">YouTube Cookies (.txt / Netscape format)</span>
              <span className="text-[10px] text-zinc-500 block leading-relaxed">
                If your hosted application (e.g., on Hugging Face Spaces / Render) gets blocked by YouTube with "Sign in to confirm you're not a bot", export your YouTube session cookies in Netscape format (e.g., using "Get cookies.txt LOCALLY" extension in Chrome/Firefox) and paste them here.
              </span>
              <textarea
                value={youtubeCookies}
                onChange={(e) => setYoutubeCookies(e.target.value)}
                placeholder="# Netscape HTTP Cookie File&#10;.youtube.com&#10;..."
                rows={5}
                className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs outline-none text-white focus:border-brand-purple font-mono"
              />
              {youtubeCookies && (
                <button
                  onClick={() => { setYoutubeCookies(''); toast.success("Cookies cleared!"); }}
                  className="text-[10px] text-red-400 hover:text-red-300 font-bold underline block cursor-pointer"
                >
                  Clear Cookies
                </button>
              )}
            </div>
          </div>

          {/* Section 2: Default Export Parameters */}
          <div className="glass-panel p-6 rounded-3xl shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5 border-b border-white/5 pb-2.5">
              <Sliders className="w-4 h-4 text-brand-pink" /> Default Rendering Presets
            </h3>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <span className="text-[10px] uppercase font-bold text-zinc-400 block">Export Format</span>
                <select
                  value={exportFormat}
                  onChange={(e) => setExportFormat(e.target.value)}
                  className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white outline-none focus:border-brand-purple"
                >
                  <option value="webm">WebM (Fast render)</option>
                  <option value="mp4">MP4 (H.264 standard)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <span className="text-[10px] uppercase font-bold text-zinc-400 block">Frame Rate (FPS)</span>
                <select
                  value={exportFps}
                  onChange={(e) => setExportFps(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white outline-none focus:border-brand-purple"
                >
                  <option value={24}>24 FPS</option>
                  <option value={30}>30 FPS</option>
                  <option value={60}>60 FPS</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <span className="text-[10px] uppercase font-bold text-zinc-400 block">Export Quality</span>
                <select
                  value={exportQuality}
                  onChange={(e) => setExportQuality(e.target.value)}
                  className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white outline-none focus:border-brand-purple"
                >
                  <option value="low">Low (Fast)</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <span className="text-[10px] uppercase font-bold text-zinc-400 block">Concurrent Renders</span>
                <input
                  type="number"
                  min={1}
                  max={4}
                  value={concurrentExports}
                  onChange={(e) => setConcurrentExports(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs outline-none text-white focus:border-brand-purple"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Watermark settings */}
          <div className="glass-panel p-6 rounded-3xl shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5 border-b border-white/5 pb-2.5">
              <Shield className="w-4 h-4 text-brand-cyan" /> Watermark & Branding
            </h3>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-white block">Default Branding Watermark</span>
                <span className="text-[10px] text-zinc-500 block">
                  Add a styled overlay at the corner of your exported clips.
                </span>
              </div>
              <input
                type="checkbox"
                checked={watermarkEnabled}
                onChange={(e) => setWatermarkEnabled(e.target.checked)}
                className="w-4 h-4 accent-brand-purple cursor-pointer"
              />
            </div>

            {watermarkEnabled && (
              <div className="space-y-1.5 pt-2 border-t border-white/5">
                <span className="text-[10px] uppercase font-bold text-zinc-400 block">Branding Text</span>
                <input
                  type="text"
                  value={watermarkText}
                  onChange={(e) => setWatermarkText(e.target.value)}
                  placeholder="e.g. @username"
                  className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs outline-none text-white focus:border-brand-purple"
                />
              </div>
            )}
          </div>

          {/* Section 4: System Reset Options */}
          <div className="glass-panel p-6 rounded-3xl shadow-xl border border-red-500/10 space-y-4">
            <h3 className="text-sm font-bold text-red-500 flex items-center gap-1.5 border-b border-red-500/10 pb-2.5">
              <Trash2 className="w-4 h-4" /> Danger Zone
            </h3>
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-0.5 max-w-md">
                <span className="text-xs font-bold text-white block">Clear Application Database Cache</span>
                <span className="text-[10px] text-zinc-500 block">
                  Removes all video projects, clips, and rendered gallery exports from browser IndexedDB to free disk space.
                </span>
              </div>
              <button
                onClick={handleClearDatabase}
                className="px-4 py-2 bg-red-600/15 border border-red-500/30 text-red-400 rounded-xl text-xs font-bold hover:bg-red-600/25 hover:text-red-300 transition cursor-pointer flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" /> Clear All Data
              </button>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
