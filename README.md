# Merge API (ffmpeg)

Deploy anywhere (Railway/Render/Fly).

## Run locally
```bash
npm install
npm start
# listens on PORT env or 3000
```

## POST /merge
Form-Data:
- videoUrl: https URL to MP4
- audioUrl: https URL to MP3/M4A
- startAt (optional): seconds (e.g. 0.5)

Returns: merged MP4.
