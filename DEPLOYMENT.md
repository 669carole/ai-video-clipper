# Deploying AI Video Clipper to a Free Cloud Server

Because this application relies on running the `yt-dlp` media extraction binary to fetch high-quality stream links from YouTube in the backend, it **cannot** be hosted on a static host (like GitHub Pages, Netlify, or Vercel static). It requires a Node server environment that supports custom binary execution.

This guide outlines how to host it permanently and for free on **Render.com** (web service) or **Hugging Face Spaces** (Docker SDK).

---

## Step 1: Push the Code to GitHub

I have already initialized Git and made the initial commit locally. To upload it to your GitHub account:

1. Open your terminal.
2. Go to the project directory:
   ```bash
   cd "/home/gc/Downloads/anti 2"
   ```
3. Create a new, blank repository on [GitHub](https://github.com/new) (e.g. named `ai-video-clipper`). Do **not** initialize it with a README or gitignore.
4. Rename your branch and push the code:
   ```bash
   git branch -M main
   git remote add origin https://github.com/YOUR_GITHUB_USERNAME/ai-video-clipper.git
   git push -u origin main
   ```

---

## Step 2: Deploy to Render.com (Recommended Free Tier)

Render provides a completely free tier for Node/Docker web services.

1. Create a free account on [Render.com](https://render.com/).
2. Click **New +** in the top right and select **Web Service**.
3. Connect your GitHub account and select your `ai-video-clipper` repository.
4. Configure the Web Service settings:
   - **Name**: `ai-video-clipper`
   - **Environment**: **Docker** (Render will automatically detect our `Dockerfile` in the root)
   - **Region**: Select the region closest to you.
   - **Instance Type**: **Free**
5. Click **Deploy Web Service**.
6. Render will automatically build the Docker image (which installs Node, Python, and `yt-dlp`) and host it. Once the build log says "Live", it will provide you with a permanent public URL (e.g., `https://ai-video-clipper.onrender.com`).

---

## Step 3: Deploy to Hugging Face Spaces (Alternative Free Tier)

Hugging Face Spaces offers a highly reliable, 24/7 free tier that runs Docker containers.

1. Sign up on [Hugging Face](https://huggingface.co/).
2. Click on your profile and select **New Space**.
3. Configure the Space settings:
   - **Space Name**: `ai-video-clipper`
   - **License**: `mit`
   - **SDK**: **Docker**
   - **Docker Template**: **Blank** (or just select Docker SDK)
   - **Space Hardware**: **CPU Basic (Free)**
   - **Visibility**: **Public**
4. Click **Create Space**.
5. Hugging Face will show you git command instructions. Add Hugging Face as a remote and push your code:
   ```bash
   git remote add hf https://huggingface.co/spaces/YOUR_HF_USERNAME/ai-video-clipper
   git push -f hf main
   ```
6. Hugging Face will build the Docker container and serve the app on a persistent `https://*.hf.space` URL!

---

## Local Verification & Cloud Portability
The project has been refactored so that:
*   **Locally (Antigravity)**: It dynamically checks and runs your custom Node v22 and `yt-dlp` executables.
*   **Cloud (Docker/Render)**: It falls back to the system's global `node` and `yt-dlp` paths setup in the `Dockerfile`.
