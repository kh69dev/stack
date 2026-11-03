#!/usr/bin/env node
/*
 * kh3don asset optimizer: writes an optimized copy of a static site build. Originals are never modified.
 *
 * Usage:
 *   node optimize-assets.cjs <folder | site.zip> --out ./site-optimized [--report kh3don-report/report.json]
 *                            [--max-width 2400] [--quality 80] [--webp]
 *
 *   --report     analyzer report: each image is resized to the largest size the page displays it at (x2 for retina)
 *   --max-width  ceiling for images the report does not cover (default 2400 px)
 *   --quality    JPEG/WebP/palette-PNG quality (default 80)
 *   --webp       also write a .webp next to every raster image (for <picture> / image-set upgrades)
 *
 * File names and formats stay the same, so the optimized copy works without code changes.
 * Needs: sharp (`npm i -D sharp`). GLB/GLTF models are compressed with glTF-Transform (meshopt) via npx when available.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync, spawnSync } = require("child_process");

const args = process.argv.slice(2);
const src = args.find((a) => !a.startsWith("--") && !/^\d+$/.test(a) && args[args.indexOf(a) - 1] !== "--out" && args[args.indexOf(a) - 1] !== "--report");
const opt = (n, d) => { const i = args.indexOf("--" + n); return i >= 0 ? args[i + 1] : d; };
const OUT = opt("out", null), REPORT = opt("report", null);
const MAXW = +opt("max-width", 2400), Q = +opt("quality", 80), WEBP = args.includes("--webp");
if (!src || !OUT) { console.error("Usage: node optimize-assets.cjs <folder|zip> --out <dir> [--report report.json] [--max-width 2400] [--quality 80] [--webp]"); process.exit(1); }

let sharp;
try { sharp = require("sharp"); } catch { console.error("sharp not found. Run: npm i -D sharp"); process.exit(1); }

const size = (b) => (b >= 1048576 ? (b / 1048576).toFixed(2) + " MB" : (b / 1024).toFixed(0) + " KB");
function walk(dir, out = []) { for (const d of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, d.name); if (d.isDirectory()) { if (!d.name.startsWith(".") && d.name !== "node_modules") walk(p, out); } else out.push(p); } return out; }
function findRoot(dir) { if (fs.existsSync(path.join(dir, "index.html"))) return dir; for (const d of fs.readdirSync(dir, { withFileTypes: true })) if (d.isDirectory() && !d.name.startsWith(".")) { const r = findRoot(path.join(dir, d.name)); if (r) return r; } return null; }

(async () => {
  // 1. Copy the site to OUT
  let from = path.resolve(src), tmp = null;
  if (from.endsWith(".zip")) { tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kh3don-opt-")); execFileSync("unzip", ["-q", "-o", from, "-d", tmp]); from = tmp; }
  const root = findRoot(from) || from;
  const out = path.resolve(OUT);
  if (path.resolve(root) === out) { console.error("--out must differ from the source"); process.exit(1); }
  fs.rmSync(out, { recursive: true, force: true });
  fs.cpSync(root, out, { recursive: true });

  // 2. Display widths from the analyzer report (desktop + mobile), keyed by path
  const display = {};
  if (REPORT && fs.existsSync(REPORT)) {
    const r = JSON.parse(fs.readFileSync(REPORT, "utf8"));
    for (const dev of ["desktop", "mobile"]) for (const im of r.devices?.[dev]?.images || []) {
      try { const p = decodeURIComponent(new URL(im.src).pathname); display[p] = Math.max(display[p] || 0, im.rw, im.rh * (im.nw / Math.max(im.nh, 1))); } catch {}
    }
  }

  // 3. Images
  const rows = []; let before = 0, after = 0;
  const files = walk(out);
  for (const f of files) {
    const ext = path.extname(f).toLowerCase(), rel = "/" + path.relative(out, f).split(path.sep).join("/");
    if (![".png", ".jpg", ".jpeg", ".webp"].includes(ext)) continue;
    const orig = fs.readFileSync(f); if (orig.length < 30 * 1024) continue;
    const meta = await sharp(orig).metadata();
    const shown = display[rel];
    const target = Math.min(MAXW, shown ? Math.max(320, Math.ceil(shown * 2)) : MAXW);
    const resize = meta.width > target ? { width: target, withoutEnlargement: true } : null;
    const base = () => { let s = sharp(orig, { animated: false }).rotate(); if (resize) s = s.resize(resize); return s; };
    let best = orig, how = "kept";
    const tryOut = async (label, fn) => { try { const b = await fn(); if (b.length < best.length * 0.95) { best = b; how = label; } } catch {} };
    if (ext === ".png") {
      await tryOut(`palette PNG q${Q}`, () => base().png({ palette: true, quality: Q, effort: 10, compressionLevel: 9 }).toBuffer());
      await tryOut("lossless PNG", () => base().png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer());
    } else if (ext === ".webp") {
      await tryOut(`WebP q${Q}`, () => base().webp({ quality: Q, effort: 6 }).toBuffer());
    } else {
      await tryOut(`mozjpeg q${Q}`, () => base().jpeg({ quality: Q, mozjpeg: true, progressive: true }).toBuffer());
    }
    if (resize && how !== "kept") how += `, ${meta.width}→${target}px`;
    fs.writeFileSync(f, best);
    let webpNote = "";
    if (WEBP && ext !== ".webp") {
      const w = await base().webp({ quality: Q, effort: 6, alphaQuality: 90 }).toBuffer();
      fs.writeFileSync(f.replace(/\.(png|jpe?g)$/i, ".webp"), w); webpNote = size(w.length);
    }
    before += orig.length; after += best.length;
    rows.push({ file: rel, before: orig.length, after: best.length, how, webp: webpNote, shown: shown ? Math.round(shown) + "px" : "" });
  }

  // 4. 3D models
  for (const f of files.filter((x) => /\.(glb|gltf)$/i.test(x))) {
    const rel = "/" + path.relative(out, f).split(path.sep).join("/"), o = fs.statSync(f).size, tmpOut = f + ".opt.glb";
    const r = spawnSync("npx", ["--yes", "@gltf-transform/cli@4", "optimize", f, tmpOut, "--compress", "meshopt", "--texture-compress", "webp"], { stdio: "ignore" });
    if (r.status === 0 && fs.existsSync(tmpOut) && fs.statSync(tmpOut).size < o) {
      const n = fs.statSync(tmpOut).size; fs.renameSync(tmpOut, f); before += o; after += n;
      rows.push({ file: rel, before: o, after: n, how: "meshopt (load with MeshoptDecoder)", webp: "", shown: "" });
    } else { fs.rmSync(tmpOut, { force: true }); rows.push({ file: rel, before: o, after: o, how: "kept (glTF-Transform unavailable or no gain)", webp: "", shown: "" }); }
  }

  // 5. Summary
  rows.sort((a, b) => b.before - b.after - (a.before - a.after));
  const md = ["# Asset optimization", "", `Source: ${src} → ${out}`, "",
    `**${size(before)} → ${size(after)}** across ${rows.length} files (${before ? Math.round((1 - after / before) * 100) : 0}% smaller).`, "",
    "| File | Before | After | Saved | Shown at | How" + (WEBP ? " | WebP" : "") + " |", "|---|---|---|---|---|---" + (WEBP ? "|---" : "") + "|",
    ...rows.map((r) => `| ${r.file} | ${size(r.before)} | ${size(r.after)} | ${r.before ? Math.round((1 - r.after / r.before) * 100) : 0}% | ${r.shown} | ${r.how}${WEBP ? " | " + r.webp : ""} |`), "",
    "File names and formats are unchanged, so the optimized folder works as a drop-in replacement. Review a few images by eye before deploying.", ""].join("\n");
  fs.writeFileSync(path.join(out, "..", path.basename(out) + "-optimize-summary.md"), md);
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`${size(before)} → ${size(after)} (${before ? Math.round((1 - after / before) * 100) : 0}% smaller). Summary: ${path.join(path.dirname(out), path.basename(out) + "-optimize-summary.md")}`);
})().catch((e) => { console.error(e); process.exit(1); });
