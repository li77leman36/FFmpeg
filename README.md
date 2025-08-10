# Merge API (ffmpeg)

A tiny API that takes a `videoUrl` and `audioUrl`, runs ffmpeg to merge them, and returns an MP4.

## Deploy on Railway
1. Create a new GitHub repo and upload these files.
2. Go to [Railway](https://railway.app/), create a new project, and link your repo.
3. Click "Deploy".
4. Your API will be live at `https://<your-app>.up.railway.app/merge`.

## Example cURL
```bash
curl -X POST https://<your-app>.up.railway.app/merge   -F "videoUrl=https://example.com/video.mp4"   -F "audioUrl=https://example.com/audio.mp3"   --output merged.mp4
```
