import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'sonner';
import { Component } from 'react';

import Home from './pages/Home';
import Editor from './pages/Editor';
import Export from './pages/Export';
import Settings from './pages/Settings';
import Navigation from './components/Navigation';

// Error Boundary to catch uncaught React errors and prevent white screen
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('React Error Boundary caught:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#09090b', color: '#f4f4f5', fontFamily: 'system-ui', padding: '2rem', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '8px' }}>Something went wrong</h1>
          <p style={{ color: '#a1a1aa', fontSize: '14px', maxWidth: '400px', marginBottom: '24px' }}>
            {this.state.error?.message || 'An unexpected error occurred. Please refresh the page.'}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{ padding: '10px 24px', background: '#8b5cf6', color: 'white', border: 'none', borderRadius: '12px', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}
          >
            Reload Application
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
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
    </ErrorBoundary>
  );
}
