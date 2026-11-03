# Polish, accessibility, performance and QA

## Contents
1. Preloader that tells the story
2. Custom cursor and magnetic buttons
3. Hover media and micro-interactions
4. Sound (opt-in)
5. Accessibility rules for cinematic sites
6. Mobile strategy
7. Performance budget and techniques
8. QA checklist
9. Automated screenshots with Playwright

## 1. Preloader

A preloader is the first scene. Make it brand-specific (the logo outline drawing, a gold keyline filling, an orbit ring closing) and honest:

```js
const loading = { p: 0 };
const bar = document.querySelector(".loader__bar");
THREE.DefaultLoadingManager.onProgress = (_url, loaded, total) =>
  gsap.to(loading, { p: loaded / total, duration: 0.4, onUpdate: () => (bar.style.transform = `scaleX(${loading.p})`) });

Promise.all([modelPromise, document.fonts.ready, minDelay(1200)]).then(() => {
  gsap.timeline()
    .to(".loader", { clipPath: "inset(0 0 100% 0)", duration: 0.9, ease: "expo.inOut" })
    .add(heroEntrance(), "-=0.3");
  lenis.start();
});
```

- Cap it: if assets take more than about 4 s, reveal the page with the poster and let 3D fade in later.
- Show the loader only on first visit per session (`sessionStorage`).
- Render real HTML content underneath so search engines and no-JS visitors still get the page.

## 2. Custom cursor and magnetic buttons

Desktop with a fine pointer only (`matchMedia("(pointer: fine)")`). Never hide the system cursor without replacing it, and keep text cursors in inputs.

```js
const dot = document.querySelector(".cursor");
const xTo = gsap.quickTo(dot, "x", { duration: 0.35, ease: "power3" });
const yTo = gsap.quickTo(dot, "y", { duration: 0.35, ease: "power3" });
addEventListener("pointermove", (e) => { xTo(e.clientX); yTo(e.clientY); });

document.querySelectorAll("[data-magnetic]").forEach((el) => {
  const mx = gsap.quickTo(el, "x", { duration: 0.4, ease: "power3" });
  const my = gsap.quickTo(el, "y", { duration: 0.4, ease: "power3" });
  el.addEventListener("pointermove", (e) => {
    const r = el.getBoundingClientRect();
    mx((e.clientX - r.left - r.width / 2) * 0.3);
    my((e.clientY - r.top - r.height / 2) * 0.3);
  });
  el.addEventListener("pointerleave", () => { mx(0); my(0); });
});
```

Grow the cursor and change its label ("View", "Drag", "Play") over different targets. Scale it with a transform, never width.

## 3. Hover media and micro-interactions

- Work list rows show a floating preview video or image that follows the cursor (quickTo again), with muted autoplay `playsinline` video under about 1.5 MB.
- Buttons: fill wipe on hover (`::before` scaleX 0 to 1, `transform-origin: left`), arrow nudges 3–4 px, 0.25 s.
- Links: underline drawn with `background-size` transition.
- Every state needs focus-visible parity with hover.

## 4. Sound

Only as opt-in. Show a small "Sound on" toggle and start audio after the click. Use soft ambient loops (−24 LUFS) and subtle UI ticks. Persist the choice in `localStorage`. Never autoplay with sound.

## 5. Accessibility rules

- The DOM is the content: real headings, paragraphs and links. The canvas is decoration plus `aria-label`. Use `role="img"` when the canvas carries meaning.
- `prefers-reduced-motion`: no smooth-scroll inertia, no pins or scrubs, no idle 3D motion, and instant or fade reveals (see `scroll-choreography.md` section 12).
- Contrast: body text at least 4.5:1. Gold on black usually passes (#D4AF37 on #0A0A0B is about 9:1), but champagne on ivory does not.
- Keyboard: Tab through the whole page with Lenis active. Focused elements must scroll into view, so test `lenis.scrollTo` on focus if needed.
- Don't trap scroll. Pinned sections must end, and the page must remain scrollable without a mouse wheel (keyboard, touch, scrollbar).
- RTL languages: set `dir="rtl"` on the element, mirror layout with logical properties (`margin-inline-start`), and don't mirror logos or 3D.

## 6. Mobile strategy

- Phones get the same story with fewer effects, not a broken desktop.
- Lower DPR (1.5), simpler model or LOD, no shadows or post-processing, shorter pins (about 60% of desktop length), and no horizontal pinned tracks.
- Use `ScrollTrigger.config({ ignoreMobileResize: true })` to avoid refreshes when the address bar collapses.
- Use `svh`/`dvh` units for full-height sections instead of `vh`.
- Test touch: drag-to-rotate stages need `touch-action: pan-y`, or the page won't scroll.

## 7. Performance budget and techniques

| Metric | Target |
|---|---|
| LCP | < 2.5 s (poster image is LCP, preload it) |
| CLS | < 0.1 (reserve sizes for canvas, images, fonts with `size-adjust`) |
| INP | < 200 ms |
| JS (gzipped, excl. model) | < 300 KB |
| Hero model | < 2 MB |
| Frame rate | 60 fps desktop, ≥ 30 fps mid-range phone |

Techniques:
- `<link rel="preload" as="image" href="/posters/hero.webp">` and `fetchpriority="high"` on the poster.
- Load the 3D module with a dynamic `import()` after first paint.
- Render on demand, pause offscreen, and cap DPR.
- Merge static meshes, use `InstancedMesh` for repeats, and keep draw calls under about 150.
- Self-host fonts as WOFF2, subset them, and use `font-display: swap`.
- Videos: H.264 MP4 plus WebM, `preload="metadata"`, poster frames.
- Profile with Chrome DevTools Performance and the `stats.js` overlay during development.

## 8. QA checklist

Run before calling the work done.

**Story and brand**
- [ ] Storyboard acts all present; the signature moment lands.
- [ ] Brand palette, fonts and logo rules followed (no stretched, tilted or recolored logo).
- [ ] Copy is real, final and free of placeholders.

**Motion**
- [ ] No jitter while scrolling over the 3D area (single RAF loop).
- [ ] Pins release cleanly and resizing doesn't break positions.
- [ ] Reveals don't re-hide content on scroll-up.
- [ ] Reduced-motion version reviewed with DevTools emulation.

**Devices**
- [ ] Chrome, Safari, Firefox desktop; iOS Safari; Android Chrome.
- [ ] Widths 1440, 1024, 768, 390. No horizontal page scroll.
- [ ] WebGL disabled: poster shows, page still complete.
- [ ] Slow 4G throttle: preloader caps, poster first, 3D fades in.

**Quality**
- [ ] Lighthouse mobile: Performance ≥ 80, Accessibility ≥ 95, Best Practices ≥ 95, SEO ≥ 95.
- [ ] Keyboard-only pass: all links and buttons reachable and visible.
- [ ] `og:image`, title and description set; favicon uses a simplified mark.
- [ ] Console free of errors and warnings.

## 9. Automated screenshots with Playwright

```js
// qa/shots.mjs  →  node qa/shots.mjs http://localhost:5173
import { chromium } from "playwright";
const url = process.argv[2];
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
for (const [name, width] of [["desktop", 1440], ["tablet", 1024], ["phone", 390]]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(4000);                         // let the model load and the entrance finish
  await page.screenshot({ path: `qa/${name}-hero.png` });
  await page.screenshot({ path: `qa/${name}-full.png`, fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  console.log(name, { overflow, errors });
}
await browser.close();
```

Look at every screenshot. Automated checks catch overflow and errors, but only eyes catch "this doesn't feel premium yet".
