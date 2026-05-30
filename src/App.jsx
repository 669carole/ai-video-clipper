import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';

import Home from './pages/Home';
import Editor from './pages/Editor';
import Export from './pages/Export';
import Settings from './pages/Settings';
import Navigation from './components/Navigation';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false
    }
  }
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="min-h-screen w-screen bg-gradient-animated flex flex-col relative text-zinc-100 overflow-y-auto">
          {/* Subtle Ambient Light Gradients */}
          <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-brand-purple/10 rounded-full blur-[120px] pointer-events-none" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-brand-pink/10 rounded-full blur-[120px] pointer-events-none" />
          
          {/* Header */}
          <header className="sticky top-0 z-40 w-full px-6 py-4 glass-panel border-b border-white/5 flex items-center justify-between shadow-md">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-lg bg-gradient-to-tr from-brand-purple to-brand-pink flex items-center justify-center font-display font-extrabold text-sm text-white shadow-lg shadow-brand-purple/20">
                AI
              </span>
              <span className="text-xl font-extrabold tracking-tight font-display text-white">
                AI Video Clipper
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase font-bold tracking-widest text-brand-purple px-2 py-0.5 bg-brand-purple/15 border border-brand-purple/30 rounded-full">
                Beta v1.0
              </span>
            </div>
          </header>

          {/* Main App Content Area */}
          <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-28 relative">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/editor/:clipId" element={<Editor />} />
              <Route path="/export/:clipId" element={<Export />} />
              <Route path="/settings" element={<Settings />} />
              {/* Fallbacks */}
              <Route path="/editor" element={<Editor />} />
              <Route path="/export" element={<Export />} />
              <Route path="*" element={<Home />} />
            </Routes>
          </main>

          {/* Persistent Bottom Navigation */}
          <Navigation />
          
          {/* Global Toast Container */}
          <Toaster 
            theme="dark" 
            position="top-right" 
            closeButton 
            richColors 
            toastOptions={{
              style: {
                background: 'rgba(15, 15, 20, 0.9)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                backdropFilter: 'blur(16px)',
                color: '#f4f4f5'
              }
            }}
          />
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
