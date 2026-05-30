import { useClipStore } from '../stores/clipStore';

// Progressive model loading
let classifierInstance = null;
let isLoadingModel = false;

async function getClassifier() {
  if (classifierInstance) return classifierInstance;
  if (isLoadingModel) return null;
  
  isLoadingModel = true;
  try {
    const { pipeline } = await import('@xenova/transformers');
    // Load DistilBERT for English sentiment analysis
    classifierInstance = await pipeline('sentiment-analysis', 'Xenova/distilbert-base-uncased-finetuned-sst-2-english', {
      progress_callback: (data) => {
        if (data.status === 'progress') {
          useClipStore.getState().setMomentDetectionProgress(Math.round(data.progress || 0));
        }
      }
    });
    isLoadingModel = false;
    return classifierInstance;
  } catch (err) {
    console.warn("Transformers.js loading failed or bypassed, falling back to rule-based NLP:", err);
    isLoadingModel = false;
    return null;
  }
}

export async function detectViralMoments(captions, duration, onProgress) {
  // 1. Transcript Segmentation
  const windowSize = 45; // 45 seconds target duration
  const overlap = 15;    // 15 seconds overlap between segments
  const segments = [];
  
  if (!captions || captions.length === 0) {
    // Fallback: If no captions, split the video into uniform time blocks
    for (let start = 0; start < duration - 15; start += (windowSize - overlap)) {
      const end = Math.min(start + windowSize, duration);
      segments.push({
        start,
        end,
        text: `Video segment from ${Math.round(start)}s to ${Math.round(end)}s.`,
        events: []
      });
    }
  } else {
    // Segment using caption timestamps
    for (let start = 0; start < duration - 15; start += (windowSize - overlap)) {
      const end = Math.min(start + windowSize, duration);
      const eventsInWindow = captions.filter(c => c.start >= start && c.start < end);
      
      if (eventsInWindow.length === 0) continue;
      
      const text = eventsInWindow.map(e => e.text).join(' ');
      segments.push({
        start,
        end,
        text,
        events: eventsInWindow
      });
    }
  }
  
  const total = segments.length;
  const scoredMoments = [];
  
  // Try to load local AI model
  const classifier = await getClassifier();
  
  for (let i = 0; i < total; i++) {
    const seg = segments[i];
    onProgress(Math.round(((i + 1) / total) * 100));
    
    // Weight 1: Sentiment intensity (25%)
    let sentimentScore = 50; // baseline
    if (classifier) {
      try {
        const result = await classifier(seg.text.substring(0, 512)); // limit tokens length
        if (result && result[0]) {
          const score = result[0].score;
          // Emotion peak is characterized by extreme positivity or negativity
          sentimentScore = Math.round(score * 100);
        }
      } catch (err) {
        console.error("Classifier scoring error:", err);
      }
    } else {
      // Fallback: Heuristic sentiment
      const positiveWords = ['amazing', 'awesome', 'great', 'happy', 'excited', 'love', 'perfect', 'win', 'best', 'funny', 'laugh', 'ha', 'lol', 'good', 'beautiful', 'incredible', 'insane', 'genius'];
      const negativeWords = ['bad', 'sad', 'angry', 'hate', 'worst', 'fail', 'terrible', 'shock', 'shocking', 'scared', 'crazy', 'unbelievable', 'wtf', 'never', 'wrong', 'no', 'crying', 'fight', 'broken'];
      
      let posCount = 0;
      let negCount = 0;
      const lowerText = seg.text.toLowerCase();
      
      positiveWords.forEach(w => {
        const regex = new RegExp(`\\b${w}\\b`, 'gi');
        posCount += (seg.text.match(regex) || []).length;
      });
      negativeWords.forEach(w => {
        const regex = new RegExp(`\\b${w}\\b`, 'gi');
        negCount += (seg.text.match(regex) || []).length;
      });
      
      // Extreme emotion implies virality
      const totalEmotions = posCount + negCount;
      sentimentScore = Math.min(100, 30 + (totalEmotions * 18));
    }
    
    // Weight 2: Keyword density analysis (20%)
    const viralKeywords = [
      { word: 'wait for it', weight: 45 },
      { word: 'watch till the end', weight: 45 },
      { word: 'you won\'t believe', weight: 50 },
      { word: 'this changed everything', weight: 40 },
      { word: 'shocking', weight: 35 },
      { word: 'unbelievable', weight: 35 },
      { word: 'insane', weight: 30 },
      { word: 'mind-blowing', weight: 35 },
      { word: 'secret', weight: 30 },
      { word: 'how to', weight: 25 },
      { word: 'why you should', weight: 30 },
      { word: 'the truth about', weight: 35 },
      { word: 'viral', weight: 25 },
      { word: 'mindblowing', weight: 35 }
    ];
    
    let keywordScore = 0;
    const lowerText = seg.text.toLowerCase();
    viralKeywords.forEach(k => {
      if (lowerText.includes(k.word)) {
        keywordScore += k.weight;
      }
    });
    keywordScore = Math.min(100, keywordScore);
    
    // Weight 3: Audio Dynamics (20%)
    // Simulated from textual punctuation: capitals denote shouting, exclamations denote shock
    const shoutCount = (seg.text.match(/[A-Z]{3,}/g) || []).length;
    const exclamCount = (seg.text.match(/!/g) || []).length;
    const audioScore = Math.min(100, 40 + (shoutCount * 20) + (exclamCount * 15));
    
    // Weight 4: Visual cuts (15%)
    // Simulated by caption frequency density (fast speech often aligns with fast editing)
    const visualScore = Math.min(100, 45 + (seg.events.length * 3.5));
    
    // Weight 5: Position Hook potential (20%)
    // The first 60 seconds of a video contain the primary hook
    let positionScore = 30; // base
    if (seg.start < 60) {
      positionScore = 95; // Hook potential
    } else if (seg.start < 180) {
      positionScore = 75;
    } else if (seg.start > duration - 60) {
      positionScore = 80; // Call to action climax
    }
    
    // Weighted scoring
    const compositeScore = Math.round(
      (sentimentScore * 0.25) +
      (keywordScore * 0.20) +
      (audioScore * 0.20) +
      (visualScore * 0.15) +
      (positionScore * 0.20)
    );
    
    // Tags generation
    const reasonTags = [];
    if (positionScore > 85) reasonTags.push("Hook Potential");
    if (keywordScore > 35) reasonTags.push("Trigger Words");
    if (sentimentScore > 65) reasonTags.push("Emotional Climax");
    if (audioScore > 60) reasonTags.push("High Energy");
    if (seg.events.length > 15) reasonTags.push("Fast Paced");
    
    if (reasonTags.length === 0) {
      reasonTags.push("Key Highlight");
    }
    
    scoredMoments.push({
      id: `moment-${i}`,
      start: Math.round(seg.start),
      end: Math.round(seg.end),
      duration: Math.round(seg.end - seg.start),
      score: Math.min(99, Math.max(40, compositeScore)),
      reason: reasonTags.slice(0, 3),
      text: seg.text
    });
  }
  
  // Sort descending by composite score
  return scoredMoments.sort((a, b) => b.score - a.score);
}
