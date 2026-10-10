// Exporte zaynspace-promo.html en MP4 vertical 1080×1920 (H.264 30 i/s + musique AAC, -14 LUFS)
// pour TikTok, Instagram Reels, YouTube Shorts et LinkedIn.
//
//   node marketing/motion/render.mjs [--fps 30] [--mute] [sortie.mp4]
//
// Nécessite Playwright (Chromium), ffmpeg et python3 avec numpy (musique : music.py).
import { chromium } from "playwright";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opts = { fps: 30, mute: false, out: path.join(here, "zaynspace-promo.mp4") };
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--mute") opts.mute = true;
  else if (args[i] === "--fps") opts.fps = Number(args[++i]);
  else opts.out = path.resolve(args[i]);
}

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(path.join(here, "zaynspace-promo.html")).href + "?record=1", { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__ready === true);
await page.evaluate(() => Promise.all(["700 40px Lexend", "600 40px Outfit"].map((f) => document.fonts.load(f))));

const duration = await page.evaluate(() => window.__duration);
const work = mkdtempSync(path.join(tmpdir(), "zaynspace-"));
const audio = [];
if (!opts.mute) {
  // bande-son calée sur les repères de l'animation
  const cues = path.join(work, "cues.json"), wav = path.join(work, "music.wav");
  writeFileSync(cues, JSON.stringify(await page.evaluate(() => window.__cues)));
  execFileSync("python3", ["-I", path.join(here, "music.py"), cues, wav], { stdio: "inherit" });
  audio.push("-i", wav, "-map", "0:v", "-map", "1:a", "-c:a", "aac", "-b:a", "192k",
    "-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-ar", "44100", "-shortest");
}

const frames = Math.round(duration * opts.fps);
const ffmpeg = spawn("ffmpeg", [
  "-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(opts.fps), "-i", "-",
  ...audio,
  "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p",
  "-movflags", "+faststart", opts.out,
], { stdio: ["pipe", "inherit", "inherit"] });

for (let i = 0; i < frames; i++) {
  await page.evaluate((t) => window.__seek(t), i / opts.fps);
  const png = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: 1080, height: 1920 } });
  if (!ffmpeg.stdin.write(png)) await new Promise((r) => ffmpeg.stdin.once("drain", r));
  if (i % (opts.fps * 5) === 0) process.stdout.write(`\r${Math.round((i / frames) * 100)} %`);
}
ffmpeg.stdin.end();
await new Promise((r) => ffmpeg.on("close", r));
await browser.close();
rmSync(work, { recursive: true, force: true });
console.log(`\n→ ${opts.out}`);
