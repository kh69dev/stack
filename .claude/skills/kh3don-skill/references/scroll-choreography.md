# Scroll choreography patterns

Copy-paste patterns for each act type. All assume the Lenis + ScrollTrigger wiring from `stack-and-setup.md` and the `rig` / `applyRig` pattern from `3d-scene.md`.

## Contents
1. Reveal on enter (the workhorse)
2. Headline split and mask reveal
3. Pinned 3D act (camera move tied to scroll)
4. Sequenced statements inside a pin
5. Image-sequence scrub (Apple-style)
6. Horizontal track
7. Stacked cards
8. Parallax layers
9. Counters and marquees
10. Hero entrance timeline
11. Page transitions
12. Reduced-motion versions
13. Timing cheat sheet

## 1. Reveal on enter

```js
gsap.utils.toArray("[data-reveal]").forEach((el) => {
  gsap.from(el, {
    y: 40, opacity: 0, duration: 1, ease: "power2.out",
    scrollTrigger: { trigger: el, start: "top 85%", once: true },
  });
});

// Staggered groups
ScrollTrigger.batch("[data-stagger] > *", {
  start: "top 85%", once: true,
  onEnter: (els) => gsap.from(els, { y: 30, opacity: 0, stagger: 0.08, duration: 0.9, ease: "power2.out" }),
});
```

Use `once: true` for reveals so content does not disappear when scrolling back up, which feels broken.

## 2. Headline split and mask reveal

SplitText is free from GSAP 3.13.

```js
import { SplitText } from "gsap/SplitText";
gsap.registerPlugin(SplitText);

document.fonts.ready.then(() => {
  document.querySelectorAll("[data-split]").forEach((h) => {
    const split = SplitText.create(h, { type: "lines", mask: "lines", linesClass: "line" });
    gsap.from(split.lines, {
      yPercent: 110, duration: 1.1, ease: "expo.out", stagger: 0.09,
      scrollTrigger: { trigger: h, start: "top 80%", once: true },
    });
  });
});
```

Split after fonts load, or line breaks will be wrong. Screen readers still read the original text because SplitText adds `aria-label` by default. Keep that on.

## 3. Pinned 3D act

```html
<section id="reveal" class="act act--pinned">
  <div class="act__copy">
    <p class="statement">Reach.</p>
    <p class="statement">Story.</p>
    <p class="statement">Care.</p>
  </div>
</section>
```

The 3D canvas is `position: fixed` behind the page, or inside the pinned section. The pinned section holds the copy.

```js
const tl = gsap.timeline({
  scrollTrigger: { trigger: "#reveal", start: "top top", end: "+=250%", pin: true, scrub: 1 },
  onUpdate: applyRig,
  defaults: { ease: "none" },
});
tl.to(rig, { camAngle: 0.6, camRadius: 12 })                  // beat 1: orbit in
  .to(rig, { camAngle: -0.4, camHeight: 2, modelRotY: 0.8 })  // beat 2: swing across
  .to(rig, { camAngle: 0, camRadius: 16, camHeight: 0, modelRotY: 0 }); // beat 3: settle
```

Use labels (`tl.addLabel("story")`) when copy must sync with specific camera beats.

## 4. Sequenced statements inside a pin

```js
const statements = gsap.utils.toArray("#reveal .statement");
statements.forEach((s, i) => {
  tl.fromTo(s, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.3 }, i)        // in at beat i
    .to(s, { opacity: 0, y: -30, duration: 0.3 }, i + 0.7);                            // out before next
});
```

Place statement tweens on the same timeline as the camera so the words and the 3D land together.

## 5. Image-sequence scrub (Apple-style)

Use this for pre-rendered product spins or camera flights that real-time 3D cannot match.

1. Render 90–180 frames from Blender, or extract them from video: `ffmpeg -i flight.mp4 -vf "fps=30,scale=1600:-1" frames/%04d.webp`.
2. Draw them on a canvas:

```js
const frameCount = 150, images = [], seq = { frame: 0 };
for (let i = 1; i <= frameCount; i++) {
  const img = new Image();
  img.src = `/frames/${String(i).padStart(4, "0")}.webp`;
  images.push(img);
}
const ctx = canvas.getContext("2d");
const draw = () => {
  const img = images[Math.round(seq.frame)];
  if (img?.complete) ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
};
images[0].onload = draw;
gsap.to(seq, {
  frame: frameCount - 1, snap: "frame", ease: "none", onUpdate: draw,
  scrollTrigger: { trigger: "#flight", start: "top top", end: "+=300%", pin: true, scrub: 0.5 },
});
```

Keep frames under about 60 KB each (WebP, quality 70) and load the first 20 eagerly and the rest after first paint. On mobile, use half the frames at a smaller size.

## 6. Horizontal track

```js
const track = document.querySelector(".h-track");
gsap.to(track, {
  x: () => -(track.scrollWidth - innerWidth),
  ease: "none",
  scrollTrigger: { trigger: ".h-wrap", start: "top top", end: () => "+=" + (track.scrollWidth - innerWidth), pin: true, scrub: 1, invalidateOnRefresh: true },
});
```

On phones, consider replacing the track with a native vertical stack (`ScrollTrigger.matchMedia` or `gsap.matchMedia`).

## 7. Stacked cards

```js
const cards = gsap.utils.toArray(".stack .card");
cards.forEach((card, i) => {
  if (i === cards.length - 1) return;
  gsap.to(card, {
    scale: 0.92, opacity: 0.4, ease: "none",
    scrollTrigger: { trigger: cards[i + 1], start: "top bottom", end: "top top", scrub: true },
  });
});
```

CSS: `.card { position: sticky; top: 12vh; }`. Sticky does the pinning, so it is cheaper than ScrollTrigger pins.

## 8. Parallax layers

```js
gsap.utils.toArray("[data-speed]").forEach((el) => {
  gsap.to(el, {
    yPercent: () => (1 - parseFloat(el.dataset.speed)) * 30, ease: "none",
    scrollTrigger: { trigger: el.closest("section"), start: "top bottom", end: "bottom top", scrub: true },
  });
});
```

Keep parallax offsets small (under 30%). Big offsets break layout and nauseate.

## 9. Counters and marquees

```js
gsap.utils.toArray("[data-count]").forEach((el) => {
  const end = +el.dataset.count, obj = { v: 0 };
  gsap.to(obj, { v: end, duration: 1.6, ease: "power2.out",
    onUpdate: () => (el.textContent = Math.round(obj.v).toLocaleString()),
    scrollTrigger: { trigger: el, start: "top 85%", once: true } });
});
```

Marquee (client logos): duplicate the row and animate `xPercent: -50` with `repeat: -1` and `ease: "none"`. Speed it up slightly with scroll velocity (`ScrollTrigger.getVelocity`) for a tactile feel, and pause it on hover.

## 10. Hero entrance timeline

Run once after the preloader finishes:

```js
gsap.timeline({ defaults: { ease: "expo.out" } })
  .from(rig, { modelScale: 0.6, modelRotY: -1.2, duration: 2, onUpdate: applyRig })
  .from(".hero h1 .line", { yPercent: 110, stagger: 0.1, duration: 1.2 }, 0.3)
  .from(".hero .lede, .hero .cta", { opacity: 0, y: 20, stagger: 0.1, duration: 1 }, 0.8)
  .from(".nav", { opacity: 0, y: -20, duration: 0.8 }, 1);
```

Total length should be 2–2.5 s, and the page must be usable before the timeline ends.

## 11. Page transitions

- For a single-page site, use section-to-section anchors with `lenis.scrollTo(target, { duration: 1.6, easing: (t) => 1 - Math.pow(1 - t, 4) })`.
- For a multi-page static site, use the **View Transitions API**. In CSS, `@view-transition { navigation: auto; }`, then shared elements with `view-transition-name: hero-title;`. This works across documents in Chromium, and other browsers fall back to a normal navigation.
- For a SPA or complex flows, use **Barba.js**. Run a leave animation (a gold keyline wipe or curtain), destroy old ScrollTriggers (`ScrollTrigger.getAll().forEach(t => t.kill())`), run the enter animation, and re-init sections.
- Keep the WebGL canvas persistent across pages and animate the rig to a new pose instead of reloading the scene.

## 12. Reduced-motion versions

```js
const mm = gsap.matchMedia();
mm.add({ full: "(prefers-reduced-motion: no-preference)", reduced: "(prefers-reduced-motion: reduce)" }, (ctx) => {
  if (ctx.conditions.full) { /* pins, scrubs, parallax */ }
  else { /* simple opacity fades, no pins; set rig to final poses */ }
});
```

## 13. Timing cheat sheet

| Element | Duration | Ease |
|---|---|---|
| Button hover | 0.2–0.3 s | power2.out |
| Text and line reveal | 0.9–1.2 s, stagger 0.08 | expo.out / power3.out |
| Card reveal | 0.8–1 s, stagger 0.06 | power2.out |
| Hero entrance | 2–2.5 s total | expo.out |
| Page transition | 0.6–0.9 s each way | expo.inOut |
| Scrubbed sequences | scroll-defined | none (scrub 0.5–1) |
| Pinned act | 150–300% of the viewport | none |
