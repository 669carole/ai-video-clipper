# Use a lightweight Node image
FROM node:22-slim

# Install system dependencies, python3 (required by yt-dlp), and curl to fetch yt-dlp
RUN apt-get update && apt-get install -y \
    python3 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Download latest yt-dlp binary
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the production assets
RUN npm run build

# Expose port
EXPOSE 5173

# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD curl -f http://localhost:5173/ || exit 1

# Start the preview server (uses configurePreviewServer hook for API routes)
CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0"]
