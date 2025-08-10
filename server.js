import express from "express";
import multer from "multer";
import fs from "fs/promises";
import { createWriteStream } from "fs";
import { tmpdir } from "os";
import path from "path";
import axios from "axios";
import { spawn } from "child_process";
import ffmpegPath from "ffmpeg-static";

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.get("/", (_req, res) => res.send("OK"));

const upload = multer({ dest: tmpdir() });

async function download(url, outPath) {
  const res = await axios.get(url, { responseType: "stream", maxRedirects: 5 });
  await new Promise((resolve, reject) =>
    res.data.pipe(createWriteStream(outPath)).on("finish", resolve).on("error", reject)
  );
  return outPath;
}

// Merge endpoint: combines a video + audio (by URL or upload)
app.post("/merge", upload.fields([{ name: "video" }, { name: "audio" }]), async (req, res) => {
  const startAt = String(req.body.startAt || "0");

  const v = path.join(tmpdir(), `v_${Date.now()}.mp4`);
  const a = path.join(tmpdir(), `a_${Date.now()}.m4a`);
  const o = path.join(tmpdir(), `o_${Date.now()}.mp4`);

  try {
    if (req.body.videoUrl && req.body.audioUrl) {
      await download(req.body.videoUrl, v);
      await download(req.body.audioUrl, a);
    } else if (req.files?.video?.[0] && req.files?.audio?.[0]) {
      await fs.copyFile(req.files.video[0].path, v);
      await fs.copyFile(req.files.audio[0].path, a);
    } else {
      return res.status(400).send("Provide videoUrl & audioUrl OR upload video & audio files.");
    }

    const args = [
      "-y","-i", v,
      "-itsoffset", startAt, "-i", a,
      "-map","0:v:0","-map","1:a:0",
      "-c:v","copy","-c:a","aac","-b:a","192k",
      "-shortest","-movflags","+faststart",
      o
    ];

    const proc = spawn(ffmpegPath, args);
    let err = "";
    proc.stderr.on("data", d => (err += d.toString()));
    proc.on("close", async code => {
      try {
        if (code !== 0) return res.status(500).send(err || "ffmpeg failed");
        const buf = await fs.readFile(o);
        res.setHeader("Content-Type", "video/mp4");
        res.setHeader("Content-Disposition", "inline; filename=merged.mp4");
        res.send(buf);
      } finally {
        [v, a, o, req.files?.video?.[0]?.path, req.files?.audio?.[0]?.path].forEach(p => p && fs.unlink(p).catch(()=>{}));
      }
    });
  } catch (e) {
    [v, a, o, req.files?.video?.[0]?.path, req.files?.audio?.[0]?.path].forEach(p => p && fs.unlink(p).catch(()=>{}));
    res.status(500).send(String(e));
  }
});

// Concat endpoint: combines multiple mp4 files into one
app.post("/concat", upload.array("files"), async (req, res) => {
  try {
    const urls = Array.isArray(req.body.fileUrl) ? req.body.fileUrl : (req.body.fileUrl ? [req.body.fileUrl] : []);
    if (!urls.length && !req.files?.length) return res.status(400).send("Provide fileUrl[] or upload files.");

    const tmpFiles = [];
    // download or copy to temp
    for (const u of urls) {
      const p = path.join(tmpdir(), `p_${Date.now()}_${Math.random().toString(36).slice(2)}.mp4`);
      await download(u, p); tmpFiles.push(p);
    }
    for (const f of (req.files || [])) {
      const p = path.join(tmpdir(), `p_${Date.now()}_${Math.random().toString(36).slice(2)}.mp4`);
      await fs.copyFile(f.path, p); tmpFiles.push(p);
    }

    // build concat list file
    const listPath = path.join(tmpdir(), `list_${Date.now()}.txt`);
    await fs.writeFile(listPath, tmpFiles.map(p => `file '${p.replace(/'/g,"'\\''")}'`).join("\n"));

    const out = path.join(tmpdir(), `final_${Date.now()}.mp4`);
    const args = ["-f","concat","-safe","0","-i",listPath,"-c","copy","-movflags","+faststart",out];

    const proc = spawn(ffmpegPath, args);
    let err = ""; proc.stderr.on("data", d => err += d.toString());
    proc.on("close", async code => {
      try {
        if (code !== 0) return res.status(500).send(err || "ffmpeg concat failed");
        const buf = await fs.readFile(out);
        res.setHeader("Content-Type","video/mp4");
        res.setHeader("Content-Disposition","inline; filename=final.mp4");
        res.send(buf);
      } finally {
        [listPath, out, ...tmpFiles, ...(req.files||[]).map(f=>f.path)].forEach(p => p && fs.unlink(p).catch(()=>{}));
      }
    });
  } catch (e) {
    res.status(500).send(String(e));
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Merge+Concat API up on port", port));
