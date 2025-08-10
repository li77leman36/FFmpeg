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
const upload = multer({ dest: tmpdir() });

async function download(url, outPath) {
  const res = await axios.get(url, { responseType: "stream" });
  await new Promise((resolve, reject) =>
    res.data.pipe(createWriteStream(outPath)).on("finish", resolve).on("error", reject)
  );
}

app.post("/merge", upload.none(), async (req, res) => {
  const { videoUrl, audioUrl, startAt = "0" } = req.body;
  if (!videoUrl || !audioUrl) return res.status(400).send("Need videoUrl and audioUrl");

  const v = path.join(tmpdir(), `v_${Date.now()}.mp4`);
  const a = path.join(tmpdir(), `a_${Date.now()}.m4a`);
  const o = path.join(tmpdir(), `o_${Date.now()}.mp4`);

  try {
    await download(videoUrl, v);
    await download(audioUrl, a);

    const args = [
      "-y", "-i", v,
      "-itsoffset", String(startAt), "-i", a,
      "-map", "0:v:0", "-map", "1:a:0",
      "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
      "-shortest", "-movflags", "+faststart",
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
        [v, a, o].forEach(p => fs.unlink(p).catch(() => {}));
      }
    });
  } catch (e) {
    [v, a, o].forEach(p => fs.unlink(p).catch(() => {}));
    res.status(500).send(String(e));
  }
});

app.listen(process.env.PORT || 3000, () => console.log("Merge API up"));
