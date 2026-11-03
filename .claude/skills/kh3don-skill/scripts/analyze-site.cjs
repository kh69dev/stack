#!/usr/bin/env node
/*
 * kh3don site analyzer: audits an existing website and writes a scored report plus the
 * raw facts needed to write an upgrade blueprint.
 *
 * Usage:
 *   node analyze-site.cjs <url | folder | site.zip> [--out ./kh3don-report] [--max-pages 5] [--baseline old/report.json]
 *
 *   url      https://example.com  (live site)
 *   folder   ./dist               (static build; served locally)
 *   zip      ./site.zip           (extracted to a temp folder, then served)
 *
 * Needs: Playwright (`npm i -D playwright && npx playwright install chromium`).
 * Writes: report.md, report.json, screenshots/*.png in --out.
 * Headless timings run on a software GPU, so treat fps and timings as relative (before vs after),
 * not as absolute field data. Use Lighthouse / PageSpeed Insights for field numbers on a live URL.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

/* ---------- args ---------- */
const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith("--"));
const opt = (name, def) => { const i = args.indexOf("--" + name); return i >= 0 ? args[i + 1] : def; };
if (!target) { console.error("Usage: node analyze-site.cjs <url|folder|zip> [--out dir] [--max-pages 5] [--baseline report.json]"); process.exit(1); }
const OUT = path.resolve(opt("out", "kh3don-report"));
const MAX_PAGES = +opt("max-pages", 5);
const BASELINE = opt("baseline", null);
fs.mkdirSync(path.join(OUT, "screenshots"), { recursive: true });

let chromium;
try { ({ chromium } = require("playwright")); }
catch { console.error("Playwright not found. Run: npm i -D playwright && npx playwright install chromium"); process.exit(1); }

/* ---------- local serving for folders / zips ---------- */
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".avif": "image/avif", ".svg": "image/svg+xml",
  ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".otf": "font/otf", ".mp4": "video/mp4", ".webm": "video/webm",
  ".mp3": "audio/mpeg", ".glb": "model/gltf-binary", ".gltf": "model/gltf+json", ".bin": "application/octet-stream", ".wasm": "application/wasm", ".txt": "text/plain", ".xml": "application/xml" };

function serve(root) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
      let f = path.join(root, p);
      if (!f.startsWith(root)) { res.writeHead(403).end(); return; }
      if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, "index.html");
      if (!fs.existsSync(f)) { // SPA fallback for extension-less routes
        if (!path.extname(p) && fs.existsSync(path.join(root, "index.html"))) f = path.join(root, "index.html");
        else { res.writeHead(404).end("not found"); return; }
      }
      res.writeHead(200, { "content-type": MIME[path.extname(f).toLowerCase()] || "application/octet-stream" });
      fs.createReadStream(f).pipe(res);
    });
    srv.listen(0, "127.0.0.1", () => resolve({ srv, url: `http://127.0.0.1:${srv.address().port}/` }));
  });
}

function findSiteRoot(dir) { // the folder that holds index.html, searching a couple of levels down
  if (fs.existsSync(path.join(dir, "index.html"))) return dir;
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    if (d.isDirectory() && !d.name.startsWith(".") && d.name !== "node_modules") {
      const r = findSiteRoot(path.join(dir, d.name)); if (r) return r;
    }
  }
  return null;
}

function walk(dir, out = []) {
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) { if (!d.name.startsWith(".") && d.name !== "node_modules") walk(p, out); } else out.push(p);
  }
  return out;
}

/* ---------- helpers ---------- */
const kb = (b) => (b / 1024).toFixed(0) + " KB";
const mb = (b) => (b / 1048576).toFixed(2) + " MB";
const size = (b) => (b >= 1048576 ? mb(b) : kb(b));
const typeOf = (url, ct = "") => {
  const ext = path.extname(new URL(url).pathname).toLowerCase();
  if (/javascript|ecmascript/.test(ct) || [".js", ".mjs"].includes(ext)) return "script";
  if (/css/.test(ct) || ext === ".css") return "style";
  if (/^image\//.test(ct) || [".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".svg", ".ico"].includes(ext)) return "image";
  if (/font/.test(ct) || [".woff", ".woff2", ".ttf", ".otf"].includes(ext)) return "font";
  if (/gltf|model/.test(ct) || [".glb", ".gltf", ".bin", ".usdz", ".drc", ".ktx2", ".hdr"].includes(ext)) return "model";
  if (/^video|^audio/.test(ct) || [".mp4", ".webm", ".mov", ".mp3", ".ogg"].includes(ext)) return "media";
  if (/html/.test(ct)) return "document";
  if (/json/.test(ct)) return "data";
  return "other";
};

/* Library signatures searched in script bodies and globals */
const SIGNATURES = [
  ["Three.js", /WebGLRenderer|THREE\.REVISION|three\.module/],
  ["React Three Fiber", /@react-three|R3F/],
  ["GSAP", /gsap|GreenSock/],
  ["GSAP ScrollTrigger", /ScrollTrigger/],
  ["Lenis", /\blenis\b|lenis-smooth/],
  ["Locomotive Scroll", /locomotive-scroll|data-scroll-container/],
  ["Framer Motion / Motion", /framer-motion|motion\.div|useScroll\(/],
  ["Barba.js", /barba/],
  ["Swiper", /swiper/i],
  ["AOS", /\baos\b|data-aos/],
  ["Rive", /@rive-app|rive\.wasm/],
  ["Spline", /@splinetool|spline\.design/],
  ["Lottie", /lottie/i],
  ["React", /react-dom|__REACT|createRoot/],
  ["Next.js", /__NEXT_DATA__|_next\/static/],
  ["Vue", /__VUE__|createApp\(/],
  ["Tailwind CSS", /tailwindcss|--tw-/],
  ["jQuery", /jQuery|jquery/],
];

/* ---------- page instrumentation (runs before page scripts) ---------- */
const INIT = () => {
  window.__k = { lcp: 0, lcpEl: "", cls: 0, tbt: 0, longTasks: 0, gl: [] };
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) { window.__k.lcp = e.renderTime || e.loadTime || e.startTime; const el = e.element; window.__k.lcpEl = el ? (el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + (el.currentSrc || el.src ? " " + (el.currentSrc || el.src).split("/").pop() : "")) : ""; } }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__k.cls += e.value; }).observe({ type: "layout-shift", buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) { window.__k.longTasks++; window.__k.tbt += Math.max(0, e.duration - 50); } }).observe({ type: "longtask", buffered: true });
  } catch (e) {}
  const orig = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) { if (/webgl/.test(type)) window.__k.gl.push(type); return orig.call(this, type, ...rest); };
};

/* Collects everything about the rendered page */
const COLLECT = () => {
  const q = (s) => [...document.querySelectorAll(s)];
  const meta = (n) => document.querySelector(`meta[name="${n}"],meta[property="${n}"]`)?.content || "";
  const dpr = devicePixelRatio || 1;
  const vh = innerHeight;
  const imgs = q("img").map((i) => {
    const r = i.getBoundingClientRect();
    return { src: (i.currentSrc || i.src).split("?")[0], alt: i.hasAttribute("alt") ? i.alt : null, nw: i.naturalWidth, nh: i.naturalHeight,
      rw: Math.round(r.width), rh: Math.round(r.height), top: Math.round(r.top + scrollY), lazy: i.loading === "lazy",
      hasDims: i.hasAttribute("width") && i.hasAttribute("height"), inPicture: !!i.closest("picture") };
  });
  // colors and fonts actually used (weighted by element area)
  const colors = {}, bgs = {}, fonts = {};
  for (const el of q("body *")) {
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    const cs = getComputedStyle(el); const area = Math.min(r.width * r.height, 2e5);
    if (el.childNodes.length && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) {
      colors[cs.color] = (colors[cs.color] || 0) + area;
      const fam = cs.fontFamily.split(",")[0].replace(/["']/g, "").trim(); fonts[fam] = (fonts[fam] || 0) + area;
    }
    if (cs.backgroundColor && !/rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor)) bgs[cs.backgroundColor] = (bgs[cs.backgroundColor] || 0) + area;
  }
  const top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map((e) => e[0]);
  const bodyBg = getComputedStyle(document.body).backgroundColor;
  const sections = q("section, main > div, [class*=section], header, footer").filter((s) => s.getBoundingClientRect().height > 200).slice(0, 25).map((s) => ({
    tag: s.tagName.toLowerCase(), id: s.id || "", cls: (s.className && typeof s.className === "string" ? s.className.split(" ").slice(0, 2).join(" ") : ""),
    heading: ((s.querySelector("h1,h2,h3")?.innerText) || "").replace(/\s+/g, " ").trim().slice(0, 90), height: Math.round(s.getBoundingClientRect().height),
    images: s.querySelectorAll("img").length, hasVideo: !!s.querySelector("video"), hasCanvas: !!s.querySelector("canvas") }));
  const text = (s) => (s.innerText || s.textContent).replace(/\s+/g, " ").trim();
  const styleText = q("style").map((s) => s.textContent).join("\n");
  return {
    title: document.title, lang: document.documentElement.lang, description: meta("description"), viewport: meta("viewport"),
    canonical: document.querySelector('link[rel="canonical"]')?.href || "", robots: meta("robots"),
    og: { title: meta("og:title"), description: meta("og:description"), image: meta("og:image") },
    favicon: !!document.querySelector('link[rel~="icon"]'), structuredData: q('script[type="application/ld+json"]').length,
    h1: q("h1").map(text).slice(0, 5), headings: q("h1,h2,h3").map((h) => h.tagName + ": " + text(h)).filter((h) => h.length > 4).slice(0, 40),
    nav: q("nav a, header a").map((a) => ({ text: text(a).slice(0, 40), href: a.getAttribute("href") })).filter((a) => a.text).slice(0, 20),
    ctas: q("a, button").filter((b) => /btn|button|cta/i.test(typeof b.className === "string" ? b.className : "") || b.tagName === "BUTTON" || /\b(get|contact|book|start|discover|explore|view|call|whatsapp|quote|touch|enquire|inquire|reserve|buy|shop|join|learn)\b/i.test(b.innerText || "")).map(text).filter((t) => t && t.length < 50).slice(0, 15),
    forms: q("form").length, inputsNoLabel: q("input:not([type=hidden]),select,textarea").filter((i) => i.getAttribute("aria-hidden") !== "true" && i.tabIndex !== -1 && !i.labels?.length && !i.getAttribute("aria-label") && !i.getAttribute("placeholder")).length,
    buttonsNoName: q("button, a[href]").filter((b) => !text(b) && !b.getAttribute("aria-label") && !b.querySelector("img[alt]:not([alt=''])") && !b.title).length,
    images: imgs, videos: q("video").map((v) => ({ src: (v.currentSrc || v.src || v.querySelector("source")?.src || "").split("/").pop(), autoplay: v.autoplay, muted: v.muted, poster: !!v.poster })),
    iframes: q("iframe").map((f) => f.src).slice(0, 10), canvases: q("canvas").length, webgl: window.__k.gl.length,
    sections, colors: top(colors, 6), backgrounds: top(bgs, 6), bodyBg, fonts: top(fonts, 5),
    docHeight: document.documentElement.scrollHeight, viewportH: vh, overflowX: document.documentElement.scrollWidth > innerWidth + 1,
    reducedMotionInline: /prefers-reduced-motion/.test(styleText), smoothScrollClass: /lenis|locomotive|has-scroll-smooth/.test(document.documentElement.className),
    globals: { THREE: !!window.THREE, gsap: !!window.gsap, ScrollTrigger: !!(window.ScrollTrigger || window.gsap?.plugins?.ScrollTrigger), lenis: !!window.lenis || !!window.Lenis, jQuery: !!window.jQuery, React: !!document.querySelector("[data-reactroot]") || !!window.React || !!document.getElementById("root")?._reactRootContainer, next: !!window.__NEXT_DATA__ },
    vitals: { lcp: Math.round(window.__k.lcp), lcpEl: window.__k.lcpEl, cls: +window.__k.cls.toFixed(3), tbt: Math.round(window.__k.tbt), longTasks: window.__k.longTasks },
    nav_timing: (() => { const n = performance.getEntriesByType("navigation")[0]; return n ? { ttfb: Math.round(n.responseStart), dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd) } : {}; })(),
    fcp: Math.round(performance.getEntriesByName("first-contentful-paint")[0]?.startTime || 0),
    html: document.documentElement.outerHTML.slice(0, 300000),
    referenced: q("meta[content], link[href]").map((m) => m.getAttribute("content") || m.getAttribute("href")).filter((v) => /\.(jpe?g|png|webp|avif|svg|ico|json|webmanifest)(\?|$)/i.test(v || "")),
    links: q("a[href]").map((a) => a.href).filter((h) => h.startsWith(location.origin)).map((h) => h.split("#")[0]),
  };
};

/* Scroll the page and sample frame times */
async function scrollFps(page) {
  return page.evaluate(async () => {
    const times = []; let last = performance.now(), run = true;
    const loop = (t) => { times.push(t - last); last = t; if (run) requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    const total = document.documentElement.scrollHeight - innerHeight, steps = 60;
    for (let i = 1; i <= steps; i++) { window.scrollTo(0, (total * i) / steps); await new Promise((r) => setTimeout(r, 50)); }
    await new Promise((r) => setTimeout(r, 400));
    window.scrollTo(0, 0); run = false;
    const ft = times.slice(2), avg = ft.reduce((a, b) => a + b, 0) / Math.max(ft.length, 1);
    return { avgFps: Math.round(1000 / avg), jankPct: Math.round((ft.filter((t) => t > 34).length / Math.max(ft.length, 1)) * 100), frames: ft.length };
  });
}

/* ---------- main ---------- */
(async () => {
  let base = target, srv = null, siteRoot = null, tmp = null;
  if (!/^https?:\/\//.test(target)) {
    let p = path.resolve(target);
    if (p.endsWith(".zip")) {
      tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kh3don-site-"));
      execFileSync("unzip", ["-q", "-o", p, "-d", tmp]);
      p = tmp;
    }
    siteRoot = findSiteRoot(p);
    if (!siteRoot) { console.error("No index.html found in " + p); process.exit(1); }
    ({ srv, url: base } = await serve(siteRoot));
  }
  console.log("Analyzing " + base + (siteRoot ? `  (local: ${siteRoot})` : ""));

  const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const resources = new Map(); // url -> {type, bytes, status, ct, encoding, cache, hash}
  const scriptBodies = [];
  const consoleErrors = new Set(), failed = new Set();
  const report = { target, analyzedAt: new Date().toISOString(), pages: [], devices: {} };

  async function visit(url, device, { shots = false, fps = false } = {}) {
    const ctx = await browser.newContext(device === "mobile"
      ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" }
      : { viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript(INIT);
    const page = await ctx.newPage();
    if (device === "mobile") { const cdp = await ctx.newCDPSession(page); await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 }); }
    page.on("console", (m) => { if (m.type() === "error") consoleErrors.add(m.text().slice(0, 200)); });
    page.on("pageerror", (e) => consoleErrors.add(String(e).slice(0, 200)));
    page.on("response", async (res) => {
      const u = res.url(); if (u.startsWith("data:")) return;
      const st = res.status(); if (st >= 400) failed.add(st + " " + u);
      if (resources.has(u)) return;
      const h = res.headers(); const ct = h["content-type"] || "";
      const entry = { type: typeOf(u, ct), status: st, ct, encoding: h["content-encoding"] || "", cache: h["cache-control"] || "", bytes: +h["content-length"] || 0, hash: "" };
      resources.set(u, entry);
      try { const body = await res.body(); entry.bytes = body.length; entry.hash = crypto.createHash("md5").update(body).digest("hex");
        if ((entry.type === "script" || entry.type === "style") && new URL(u).host === new URL(base).host) scriptBodies.push(body.toString("utf8")); } catch {}
    });
    const t0 = Date.now();
    await page.goto(url, { waitUntil: "load", timeout: 90000 }).catch((e) => consoleErrors.add("navigation: " + e.message.slice(0, 120)));
    await page.waitForTimeout(3500);
    const data = await page.evaluate(COLLECT).catch(() => null);
    if (data) data.wallLoadMs = Date.now() - t0;
    if (shots) {
      const slug = device;
      await page.screenshot({ path: path.join(OUT, "screenshots", `${slug}-hero.png`) }).catch(() => {});
      await page.screenshot({ path: path.join(OUT, "screenshots", `${slug}-full.png`), fullPage: true, timeout: 60000 }).catch(() => {});
    }
    if (data && fps) data.scroll = await scrollFps(page).catch(() => null);
    await ctx.close();
    return data;
  }

  // Home page on both devices, then crawl a few internal pages on desktop
  const home = await visit(base, "desktop", { shots: true, fps: true });
  const homeMobile = await visit(base, "mobile", { shots: true, fps: true });
  if (!home) { console.error("Could not load the page."); process.exit(1); }
  report.devices = { desktop: home, mobile: homeMobile };
  report.pages.push({ url: base, title: home.title, h1: home.h1, description: home.description });
  const seen = new Set([base.replace(/\/$/, "")]);
  const queue = [...new Set(home.links)].filter((l) => !/\.(pdf|zip|jpg|png|php)$/i.test(l));
  for (const l of queue) {
    if (report.pages.length >= MAX_PAGES) break;
    const key = l.replace(/\/$/, ""); if (seen.has(key)) continue; seen.add(key);
    const d = await visit(l, "desktop"); if (d) report.pages.push({ url: l, title: d.title, h1: d.h1, description: d.description, overflowX: d.overflowX });
  }
  await browser.close();
  if (srv) srv.close();

  /* ---------- resource analysis ---------- */
  const res = [...resources.entries()].map(([url, r]) => ({ url, ...r }));
  const byType = {};
  for (const r of res) { byType[r.type] = byType[r.type] || { count: 0, bytes: 0 }; byType[r.type].count++; byType[r.type].bytes += r.bytes; }
  const totalBytes = res.reduce((a, r) => a + r.bytes, 0);
  const largest = [...res].sort((a, b) => b.bytes - a.bytes).slice(0, 12);
  const dupMap = {}; for (const r of res) if (r.hash && r.bytes > 10240) (dupMap[r.hash] = dupMap[r.hash] || []).push(r.url);
  const duplicates = Object.values(dupMap).filter((a) => a.length > 1);
  const legacyImages = res.filter((r) => r.type === "image" && /\.(png|jpe?g)$/i.test(new URL(r.url).pathname) && r.bytes > 100 * 1024);
  const textNoCompression = /^https?:\/\/(127\.0\.0\.1|localhost)/.test(base) ? [] : res.filter((r) => ["script", "style", "document"].includes(r.type) && r.bytes > 20480 && !r.encoding);
  const noCache = /^https?:\/\/(127\.0\.0\.1|localhost)/.test(base) ? [] : res.filter((r) => ["script", "style", "image", "font", "model"].includes(r.type) && !/max-age=\d{5,}|immutable/.test(r.cache));
  const allCode = scriptBodies.join("\n");
  const htmlFlags = home.html || "";
  const stack = SIGNATURES.filter(([, re]) => re.test(allCode) || re.test(htmlFlags)).map(([n]) => n);
  for (const [g, n] of [["THREE", "Three.js"], ["gsap", "GSAP"], ["ScrollTrigger", "GSAP ScrollTrigger"], ["lenis", "Lenis"], ["jQuery", "jQuery"], ["next", "Next.js"]]) if (home.globals[g] && !stack.includes(n)) stack.push(n);
  delete home.html; if (homeMobile) delete homeMobile.html;
  const reducedMotion = /prefers-reduced-motion/.test(allCode) || home.reducedMotionInline;

  // Images: oversized for their rendered size, missing alt, missing dimensions, not lazy below fold
  const imgs = home.images.filter((i) => i.nw > 0);
  const oversized = imgs.filter((i) => i.rw > 0 && i.nw > i.rw * 2 * 1.5 && !/\.svg(\?|$)/i.test(i.src)).map((i) => ({ ...i, bytes: resources.get(new URL(i.src, base).href)?.bytes || 0 }));
  const missingAlt = home.images.filter((i) => i.alt === null);
  const noDims = home.images.filter((i) => !i.hasDims);
  const eagerBelowFold = home.images.filter((i) => i.top > home.viewportH * 1.5 && !i.lazy);

  // Files on disk never requested (folder / zip mode)
  let disk = null;
  if (siteRoot) {
    const requested = new Set(res.map((r) => decodeURIComponent(new URL(r.url).pathname)));
    const files = walk(siteRoot).map((f) => ({ f, rel: "/" + path.relative(siteRoot, f).split(path.sep).join("/"), bytes: fs.statSync(f).size }));
    const hashes = {}; for (const x of files) if (x.bytes > 10240) { const h = crypto.createHash("md5").update(fs.readFileSync(x.f)).digest("hex"); (hashes[h] = hashes[h] || []).push(x.rel); }
    disk = {
      root: siteRoot, files: files.length, bytes: files.reduce((a, x) => a + x.bytes, 0),
      unrequested: files.filter((x) => !requested.has(x.rel) && !/index\.html$/.test(x.rel) && !(home.referenced || []).some((r) => r.endsWith(x.rel))).sort((a, b) => b.bytes - a.bytes).map((x) => ({ path: x.rel, bytes: x.bytes })),
      duplicates: Object.values(hashes).filter((a) => a.length > 1),
      serverCode: files.filter((x) => /\.(php|py|rb|env)$/i.test(x.rel)).map((x) => x.rel),
    };
  }

  /* ---------- scoring ---------- */
  const m = homeMobile || home;
  const findings = [];
  const add = (cat, sev, title, detail, fix) => findings.push({ cat, sev, title, detail, fix });

  // Performance
  const mobileLcp = m.vitals.lcp || m.fcp;
  if (totalBytes > 8 * 1048576) add("Performance", "P1", `Page weight is ${mb(totalBytes)}`, `Images ${size(byType.image?.bytes || 0)}, scripts ${size(byType.script?.bytes || 0)}, models ${size(byType.model?.bytes || 0)}. On 4G (~9 Mbps) this alone takes about ${Math.round((totalBytes * 8) / 9e6)} s to download.`, "Recompress images (optimize-assets.cjs), lazy-load below-the-fold media, code-split heavy 3D modules, target under 3 MB for first load.");
  else if (totalBytes > 3 * 1048576) add("Performance", "P2", `Page weight is ${mb(totalBytes)}`, "Above the 3 MB first-load target.", "Recompress images and defer non-critical scripts.");
  if (mobileLcp > 4000) add("Performance", "P1", `Slow largest paint on mobile (${(mobileLcp / 1000).toFixed(1)} s, element: ${m.vitals.lcpEl || "n/a"})`, "Target is under 2.5 s.", "Preload the hero image/poster, serve it as WebP/AVIF at display size, avoid client-only rendering of the hero.");
  else if (mobileLcp > 2500) add("Performance", "P2", `Largest paint on mobile ${(mobileLcp / 1000).toFixed(1)} s`, "Target is under 2.5 s.", "Preload the hero image and shrink it.");
  if (m.vitals.tbt > 600) add("Performance", "P1", `Main thread blocked ${m.vitals.tbt} ms on mobile (${m.vitals.longTasks} long tasks)`, "Heavy JavaScript parse/execute delays interaction.", "Split bundles, lazy-import Three.js and animation code after first paint, remove unused libraries.");
  else if (m.vitals.tbt > 200) add("Performance", "P2", `Main thread blocked ${m.vitals.tbt} ms on mobile`, "Target under 200 ms.", "Defer non-critical scripts.");
  if (Math.max(home.vitals.cls, m.vitals.cls) > 0.1) add("Performance", "P1", `Layout shift ${Math.max(home.vitals.cls, m.vitals.cls)}`, "Content jumps while loading.", "Set width/height on images and media, reserve space for the 3D canvas, use font-display with size-adjust.");
  if ((byType.script?.bytes || 0) > 1.2 * 1048576) add("Performance", "P2", `JavaScript is ${size(byType.script.bytes)}`, "Target under 300 KB gzipped excluding 3D models.", "Audit bundle (vite-bundle-visualizer), import only used Three.js modules, lazy-load sections.");
  if (textNoCompression.length) add("Performance", "P2", `${textNoCompression.length} text files served without gzip/brotli`, textNoCompression.slice(0, 3).map((r) => r.url.split("/").pop()).join(", "), "Enable Brotli or gzip on the server/CDN.");
  if (noCache.length > 3) add("Performance", "P3", `${noCache.length} static files without long cache headers`, "Repeat visits re-download assets.", "Serve hashed assets with Cache-Control: public, max-age=31536000, immutable.");

  // Assets
  if (legacyImages.length) add("Assets", legacyImages.reduce((a, r) => a + r.bytes, 0) > 2 * 1048576 ? "P1" : "P2", `${legacyImages.length} heavy PNG/JPEG images (${size(legacyImages.reduce((a, r) => a + r.bytes, 0))})`, legacyImages.sort((a, b) => b.bytes - a.bytes).slice(0, 5).map((r) => `${decodeURIComponent(r.url.split("/").pop())} ${size(r.bytes)}`).join(", "), "Convert to WebP/AVIF and resize to at most 2x display size (optimize-assets.cjs).");
  if (oversized.length) add("Assets", "P2", `${oversized.length} images much larger than displayed`, oversized.slice(0, 4).map((i) => `${decodeURIComponent(i.src.split("/").pop())} ${i.nw}px shown at ${i.rw}px`).join(", "), "Resize, or use srcset/sizes.");
  if (duplicates.length) add("Assets", "P2", `${duplicates.length} duplicate files downloaded`, duplicates.map((d) => d.map((u) => u.split("/").pop()).join(" = ")).join("; "), "Remove duplicates; reference one copy.");
  if (disk?.unrequested.length) { const big = disk.unrequested.filter((x) => x.bytes > 50 * 1024); if (big.length) add("Assets", "P3", `${big.length} large files in the build never requested on the crawled pages (${size(big.reduce((a, x) => a + x.bytes, 0))})`, big.slice(0, 6).map((x) => `${x.path} ${size(x.bytes)}`).join(", "), "Confirm they are unused (other routes, lazy chunks) and delete them from the deploy."); }
  if (disk?.duplicates.length) add("Assets", "P3", `${disk.duplicates.length} duplicate files in the build`, disk.duplicates.map((d) => d.join(" = ")).join("; "), "Keep one copy; stale build outputs often cause this.");
  if (disk?.serverCode.length) add("Assets", "P2", "Server-side code inside the static build", disk.serverCode.join(", "), "Check it should be deployed publicly; keep secrets out of the web root.");
  if (eagerBelowFold.length > 2) add("Assets", "P3", `${eagerBelowFold.length} below-the-fold images load eagerly`, "", 'Add loading="lazy" decoding="async".');
  const models = res.filter((r) => r.type === "model");
  if (models.some((r) => r.bytes > 3 * 1048576)) add("Assets", "P1", "Heavy 3D model", models.map((r) => `${r.url.split("/").pop()} ${size(r.bytes)}`).join(", "), "Run optimize-model.sh (meshopt), target under 2 MB.");

  // SEO
  if (!home.title || home.title.length < 10) add("SEO", "P1", "Missing or weak page title", home.title || "(none)", "Write a 50–60 character title: brand + offer.");
  if (!home.description) add("SEO", "P1", "Missing meta description", "", "Add a 140–160 character description that states the client outcome.");
  if (!home.og.image) add("SEO", "P2", "No social preview image (og:image)", "", "Add og:title, og:description, og:image (1200×630, the hero poster works).");
  if (home.h1.length !== 1) add("SEO", "P2", `${home.h1.length} H1 headings on the home page`, home.h1.join(" | ") || "(none)", "Use exactly one H1 with the brand promise.");
  if (!home.lang) add("SEO", "P2", "Missing <html lang>", "", 'Set lang="en" (and dir="rtl" sections for Arabic).');
  if (!home.canonical) add("SEO", "P3", "No canonical URL", "", "Add <link rel=canonical>.");
  if (!home.structuredData) add("SEO", "P3", "No structured data", "", "Add Organization / LocalBusiness JSON-LD.");
  if (report.pages.length > 1 && new Set(report.pages.map((p) => p.title)).size === 1) add("SEO", "P2", "All crawled pages share one title", report.pages[0].title, "Give every route its own title and description.");

  // Accessibility
  if (missingAlt.length) add("Accessibility", "P2", `${missingAlt.length} images without alt`, missingAlt.slice(0, 4).map((i) => decodeURIComponent(i.src.split("/").pop())).join(", "), 'Describe meaningful images; use alt="" for decorative ones.');
  if (home.buttonsNoName) add("Accessibility", "P2", `${home.buttonsNoName} links/buttons without an accessible name`, "", "Add visible text or aria-label (icon buttons, social links).");
  if (home.inputsNoLabel) add("Accessibility", "P2", `${home.inputsNoLabel} form fields without labels`, "", "Add <label> or aria-label.");
  if (!reducedMotion && (stack.some((s) => /GSAP|Lenis|Locomotive|Motion|Three|AOS/.test(s)) || home.webgl)) add("Accessibility", "P2", "Animations ignore prefers-reduced-motion", "No reduced-motion handling found in CSS or JS.", "Add a reduced-motion branch: no smoothing, no pins/scrubs, fades only.");
  if (home.overflowX || homeMobile?.overflowX) add("Accessibility", "P1", "Horizontal scrolling on " + (homeMobile?.overflowX ? "mobile" : "desktop"), "Something is wider than the viewport.", "Find the overflowing element; use max-width:100% and min-width:0 in flex/grid children.");

  // Experience
  const hasSmooth = stack.includes("Lenis") || stack.includes("Locomotive Scroll") || home.smoothScrollClass;
  const hasScrollAnim = stack.includes("GSAP ScrollTrigger") || stack.includes("Framer Motion / Motion") || stack.includes("AOS");
  const has3D = home.webgl > 0 || stack.includes("Three.js") || stack.includes("Spline");
  if (!hasSmooth) add("Experience", "P2", "No smooth scrolling", "Native scroll only.", "Add Lenis wired to GSAP's ticker (references/stack-and-setup.md).");
  if (!hasScrollAnim) add("Experience", "P2", "No scroll-driven storytelling", "Content appears statically.", "Storyboard the page into acts and add ScrollTrigger reveals/pins (references/scroll-choreography.md).");
  if (!has3D) add("Experience", "P3", "No signature 3D / WebGL moment", "", "Add one hero 3D moment (brand emblem or product) with a poster fallback (references/3d-scene.md).");
  if (has3D && !home.images.some((i) => i.top < home.viewportH)) add("Experience", "P3", "3D hero without a poster image", "First paint is empty until WebGL loads.", "Render a still of the hero as the LCP image and cross-fade to the canvas.");
  if (home.scroll && home.scroll.jankPct > 25) add("Experience", "P3", `Scroll jank: ${home.scroll.jankPct}% of frames over 34 ms (headless)`, `~${home.scroll.avgFps} fps while scrolling in a software-GPU browser. Compare against the upgraded build rather than reading it as absolute.`, "Pause WebGL offscreen, cap DPR, single RAF loop, animate only transform/opacity.");
  const thirdParty = {}; for (const r of res) { const h = new URL(r.url).host; if (h !== new URL(base).host) thirdParty[h] = (thirdParty[h] || 0) + r.bytes; }
  const tpBytes = Object.values(thirdParty).reduce((a, b) => a + b, 0);
  if (tpBytes > 500 * 1024) add("Performance", "P2", `Third-party code and media: ${size(tpBytes)}`, Object.entries(thirdParty).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([h, b]) => `${h} ${size(b)}`).join(", "), "Load embeds (maps, video, chat widgets) on click or when scrolled into view; a static map image with a link costs a few KB.");
  report.thirdParty = thirdParty;
  if (consoleErrors.size) add("Experience", "P2", `${consoleErrors.size} console errors`, [...consoleErrors].slice(0, 3).join(" | "), "Fix runtime errors before launch.");
  if (failed.size) add("Experience", "P2", `${failed.size} failed requests`, [...failed].slice(0, 4).join(" | "), "Fix broken asset paths.");

  const penalty = { P1: 22, P2: 10, P3: 4 };
  const cats = ["Performance", "Assets", "SEO", "Accessibility", "Experience"];
  const scores = Object.fromEntries(cats.map((c) => [c, Math.max(0, 100 - findings.filter((f) => f.cat === c).reduce((a, f) => a + penalty[f.sev], 0))]));
  const overall = Math.round(cats.reduce((a, c) => a + scores[c], 0) / cats.length);
  findings.sort((a, b) => a.sev.localeCompare(b.sev));

  Object.assign(report, { overall, scores, findings, stack, reducedMotion, totalBytes, byType, largest: largest.map((r) => ({ url: r.url, type: r.type, bytes: r.bytes })),
    duplicates, disk, consoleErrors: [...consoleErrors], failed: [...failed],
    inventory: { title: home.title, h1: home.h1, headings: home.headings, nav: home.nav, ctas: [...new Set(home.ctas)], sections: home.sections, forms: home.forms,
      videos: home.videos, iframes: home.iframes, colors: home.colors, backgrounds: home.backgrounds, bodyBg: home.bodyBg, fonts: home.fonts,
      imageCount: home.images.length, docHeightScreens: +(home.docHeight / home.viewportH).toFixed(1) } });

  /* ---------- baseline comparison ---------- */
  let compare = "";
  if (BASELINE && fs.existsSync(BASELINE)) {
    const b = JSON.parse(fs.readFileSync(BASELINE, "utf8"));
    const row = (label, before, after, fmt = (x) => x, lowerBetter = true) => { const better = lowerBetter ? after < before : after > before; return `| ${label} | ${fmt(before)} | ${fmt(after)} | ${after === before ? "=" : better ? "better" : "worse"} |`; };
    const bm = b.devices.mobile || b.devices.desktop;
    compare = ["## Before / after", "", "| Metric | Before | After | |", "|---|---|---|---|",
      row("Overall score", b.overall, overall, (x) => x, false), row("Page weight", b.totalBytes, totalBytes, size),
      row("Mobile LCP (ms)", bm.vitals.lcp, m.vitals.lcp), row("Mobile TBT (ms)", bm.vitals.tbt, m.vitals.tbt), row("CLS", bm.vitals.cls, m.vitals.cls),
      row("Findings", b.findings.length, findings.length), ""].join("\n");
  }

  /* ---------- markdown ---------- */
  const L = [];
  L.push(`# Site analysis: ${home.title || target}`, "", `Analyzed ${report.analyzedAt} · ${target} · ${report.pages.length} page(s) crawled`, "");
  L.push(`## Scores`, "", `**Overall ${overall}/100**`, "", "| Category | Score |", "|---|---|", ...cats.map((c) => `| ${c} | ${scores[c]} |`), "");
  if (compare) L.push(compare);
  L.push("## Key numbers", "", "| | Desktop | Mobile (4x CPU throttle) |", "|---|---|---|",
    `| First contentful paint | ${home.fcp} ms | ${m.fcp} ms |`, `| Largest contentful paint | ${home.vitals.lcp} ms | ${m.vitals.lcp} ms |`,
    `| Total blocking time | ${home.vitals.tbt} ms | ${m.vitals.tbt} ms |`, `| Layout shift | ${home.vitals.cls} | ${m.vitals.cls} |`,
    `| Scroll (headless) | ${home.scroll ? home.scroll.avgFps + " fps, " + home.scroll.jankPct + "% jank" : "n/a"} | ${homeMobile?.scroll ? homeMobile.scroll.avgFps + " fps, " + homeMobile.scroll.jankPct + "% jank" : "n/a"} |`,
    `| Page length | ${(home.docHeight / home.viewportH).toFixed(1)} screens | ${homeMobile ? (homeMobile.docHeight / homeMobile.viewportH).toFixed(1) + " screens" : ""} |`, "",
    `Page weight **${mb(totalBytes)}**: ` + Object.entries(byType).sort((a, b) => b[1].bytes - a[1].bytes).map(([t, v]) => `${t} ${size(v.bytes)} (${v.count})`).join(" · "), "",
    "Timings come from a headless browser with a software GPU. Use them to compare before and after; confirm absolute numbers with PageSpeed Insights on the live URL.", "");
  L.push("## Findings and fixes", "", "| Priority | Area | Finding | Fix |", "|---|---|---|---|",
    ...findings.map((f) => `| ${f.sev} | ${f.cat} | **${f.title}**${f.detail ? "<br>" + f.detail.replace(/\|/g, "/") : ""} | ${f.fix} |`), "");
  L.push("## Largest files", "", "| File | Type | Size |", "|---|---|---|", ...largest.map((r) => `| ${decodeURIComponent(r.url.replace(base, "/"))} | ${r.type} | ${size(r.bytes)} |`), "");
  L.push("## Current stack", "", stack.length ? stack.map((s) => "- " + s).join("\n") : "- No animation/3D libraries detected", `- WebGL contexts on home: ${home.webgl}`, `- Reduced-motion handling: ${reducedMotion ? "yes" : "no"}`, "");
  L.push("## Content inventory (for the upgrade blueprint)", "",
    `- **Title:** ${home.title}`, `- **H1:** ${home.h1.join(" | ") || "none"}`, `- **Description:** ${home.description || "none"}`,
    `- **Navigation:** ${home.nav.map((n) => n.text).join(" · ") || "none"}`, `- **Calls to action:** ${[...new Set(home.ctas)].join(" · ") || "none"}`,
    `- **Colors (text):** ${home.colors.join(", ")}`, `- **Backgrounds:** ${home.backgrounds.join(", ")} (body ${home.bodyBg})`, `- **Fonts:** ${home.fonts.join(", ")}`,
    `- **Images on home:** ${home.images.length} · videos: ${home.videos.length} · forms: ${home.forms} · iframes: ${home.iframes.length}`, "",
    "### Sections (top to bottom)", "", "| # | Element | Heading | Height | Media |", "|---|---|---|---|---|",
    ...home.sections.map((s, i) => `| ${i + 1} | ${s.tag}${s.id ? "#" + s.id : ""}${s.cls ? " ." + s.cls.replace(/ /g, ".") : ""} | ${s.heading.replace(/\|/g, "/") || "-"} | ${s.height}px | ${s.images} img${s.hasVideo ? ", video" : ""}${s.hasCanvas ? ", canvas" : ""} |`), "",
    "### Headings", "", ...home.headings.map((h) => "- " + h), "");
  if (report.pages.length > 1) L.push("## Crawled pages", "", ...report.pages.map((p) => `- ${p.url} · "${p.title}" · H1: ${(p.h1 || []).join(" | ") || "none"}`), "");
  if (disk) L.push("## Build folder", "", `${disk.files} files, ${mb(disk.bytes)} on disk (${disk.root}).`, "", disk.unrequested.length ? "Not requested on crawled pages (largest first):\n\n" + disk.unrequested.slice(0, 15).map((x) => `- ${x.path} (${size(x.bytes)})`).join("\n") : "", "");
  L.push("## Screenshots", "", "screenshots/desktop-hero.png · desktop-full.png · mobile-hero.png · mobile-full.png", "");
  L.push("## Next step", "", "Write the upgrade blueprint with the kh3don skill (references/analyze-and-upgrade.md): keep the content inventory above, fix every P1, then map the sections onto the five-act cinematic structure.", "");

  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(OUT, "report.md"), L.join("\n"));
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`Overall ${overall}/100 · ` + cats.map((c) => `${c} ${scores[c]}`).join(" · "));
  console.log(`${findings.length} findings (${findings.filter((f) => f.sev === "P1").length} P1). Report: ${path.join(OUT, "report.md")}`);
})().catch((e) => { console.error(e); process.exit(1); });
