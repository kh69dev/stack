# Stack and setup

## Contents
1. Choosing a setup
2. Vite + vanilla (recommended default)
3. No-build (CDN import map)
4. Lenis + GSAP ScrollTrigger wiring (the one correct loop)
5. Project structure
6. React / Next.js with React Three Fiber
7. Pinned versions

## 1. Choosing a setup

| Situation | Setup |
|---|---|
| New standalone landing page | Vite + vanilla JS + Three.js |
| Existing React / Next.js site | React Three Fiber + Drei + GSAP (`@gsap/react`) + Lenis (`lenis/react`) |
| Quick prototype, artifact, CMS embed | No-build import map (see `assets/starter/`) |
| Webflow / Framer | Their native interactions for DOM, plus a custom-code embed for the Three.js canvas |

Pin exact versions. Animation libraries change APIs between minors, and a premium site should not break on a CDN update.

## 2. Vite + vanilla

```bash
npm create vite@latest my-site -- --template vanilla
cd my-site
npm i three gsap lenis
npm i -D @gltf-transform/cli
```

Put models and posters in `public/` so they are served as-is.

## 3. No-build (import map)

```html
<script type="importmap">
{ "imports": {
  "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
  "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/",
  "gsap": "https://cdn.jsdelivr.net/npm/gsap@3.13.0/index.js",
  "gsap/ScrollTrigger": "https://cdn.jsdelivr.net/npm/gsap@3.13.0/ScrollTrigger.js",
  "lenis": "https://cdn.jsdelivr.net/npm/lenis@1.1.13/dist/lenis.mjs"
} }
</script>
<script type="module" src="./main.js"></script>
```

## 4. Lenis + GSAP ScrollTrigger wiring

Use one RAF loop: GSAP's ticker drives Lenis, and Lenis tells ScrollTrigger when the scroll moves. Two competing loops cause the familiar "jelly" jitter.

```js
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

gsap.registerPlugin(ScrollTrigger);

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const lenis = new Lenis({
  lerp: reduceMotion ? 1 : 0.09,   // 1 = no smoothing
  wheelMultiplier: 1,
  smoothWheel: !reduceMotion,
});

lenis.on("scroll", ScrollTrigger.update);
gsap.ticker.add((time) => lenis.raf(time * 1000));
gsap.ticker.lagSmoothing(0);

// Anchor links through Lenis so they glide instead of jumping
document.querySelectorAll('a[href^="#"]').forEach((a) =>
  a.addEventListener("click", (e) => {
    const target = document.querySelector(a.getAttribute("href"));
    if (!target) return;
    e.preventDefault();
    lenis.scrollTo(target, { offset: -80 });
  })
);

// Recalculate trigger positions once heavy assets change layout
window.addEventListener("load", () => ScrollTrigger.refresh());
document.fonts?.ready.then(() => ScrollTrigger.refresh());
```

Required Lenis CSS (or import `lenis/dist/lenis.css`):

```css
html.lenis, html.lenis body { height: auto; }
.lenis.lenis-smooth { scroll-behavior: auto !important; }
.lenis.lenis-smooth [data-lenis-prevent] { overscroll-behavior: contain; }
.lenis.lenis-stopped { overflow: hidden; }
```

Add `data-lenis-prevent` to inner scrollable elements such as modals and code blocks so they scroll natively.

To pause scrolling during a preloader or modal, call `lenis.stop()`, then `lenis.start()`.

## 5. Project structure

```
src/
  main.js            // boot: lenis, gsap, scene, sections
  scroll.js          // lenis + ScrollTrigger wiring
  scene/
    Stage.js         // renderer, camera, env, resize, render-on-demand
    loadModel.js     // GLTFLoader + MeshoptDecoder, framing
    rig.js           // named params the timelines animate (camRadius, modelRotY…)
  sections/
    hero.js          // one file per act, each exports init(scene, lenis)
    reveal.js
    proof.js
    services.js
    cta.js
  styles/
    tokens.css       // brand colors, type, spacing as custom properties
    base.css
public/
  models/hero.glb    // optimized
  posters/hero.webp  // still of the hero, same framing as the canvas
```

Keep brand values only in `tokens.css`. The palette, fonts and radius should change in one place.

## 6. React / Next.js with React Three Fiber

```bash
npm i three @react-three/fiber @react-three/drei gsap @gsap/react lenis
```

```jsx
// app/providers.jsx
"use client";
import { ReactLenis } from "lenis/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useEffect, useRef } from "react";
gsap.registerPlugin(ScrollTrigger);

export function SmoothScroll({ children }) {
  const lenisRef = useRef();
  useEffect(() => {
    const update = (t) => lenisRef.current?.lenis?.raf(t * 1000);
    gsap.ticker.add(update);
    gsap.ticker.lagSmoothing(0);
    return () => gsap.ticker.remove(update);
  }, []);
  return (
    <ReactLenis root ref={lenisRef} options={{ lerp: 0.09, autoRaf: false }}>
      {children}
    </ReactLenis>
  );
}
```

```jsx
// components/Hero3D.jsx
"use client";
import { Canvas } from "@react-three/fiber";
import { Environment, useGLTF } from "@react-three/drei";
import { Suspense } from "react";

function Emblem(props) {
  const { scene } = useGLTF("/models/hero.glb"); // drei sets up meshopt and draco decoders
  return <primitive object={scene} {...props} />;
}

export default function Hero3D() {
  return (
    <Canvas dpr={[1, 2]} camera={{ fov: 28, position: [0, 0, 18] }} frameloop="demand">
      <Suspense fallback={null}>
        <Environment preset="studio" />
        <Emblem />
      </Suspense>
    </Canvas>
  );
}
```

In Next.js, load the canvas component with `dynamic(() => import(...), { ssr: false })` and render the poster `<Image>` underneath as the server-rendered first paint. Use `useGSAP()` from `@gsap/react` for timelines so they are cleaned up on unmount.

## 7. Pinned versions known to work together

- three 0.160.0 (GLTFLoader supports `EXT_meshopt_compression` and `EXT_mesh_gpu_instancing`)
- gsap 3.13.0 (all plugins, including SplitText, are free from 3.13)
- lenis 1.1.13
- @gltf-transform/cli 4.x

Upgrade deliberately, one library at a time, and re-run the QA checklist.
