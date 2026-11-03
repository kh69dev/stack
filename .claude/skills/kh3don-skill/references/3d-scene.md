# 3D scene: models, light, framing, scroll-driven camera

## Contents
1. Model pipeline (GLB, STL, others)
2. Loading with meshopt
3. Stage setup: renderer, tone mapping, render-on-demand
4. Lighting recipes (gold, chrome, glass, matte)
5. Framing by bounding box
6. The rig: named parameters for timelines
7. Idle motion and pointer interaction
8. No-model heroes: procedural and shader ideas
9. Poster and fallbacks
10. Common problems

## 1. Model pipeline

| You have | Do this |
|---|---|
| GLB/GLTF | `scripts/optimize-model.sh in.glb out.glb` |
| STL (geometry only, no materials) | Prefer the GLB if the client has it. Otherwise load with `STLLoader` and assign a `MeshPhysicalMaterial`, or import to Blender, add materials and export GLB |
| FBX / OBJ / Blend | Blender, then File > Export > glTF 2.0 (.glb), with Apply Modifiers on and +Y up, then optimize |
| Textured model > 5 MB | `gltf-transform optimize in.glb out.glb --compress meshopt --texture-compress webp` (or `ktx2` with the KTX2Loader) |

Inspect before and after: `npx @gltf-transform/cli inspect model.glb` shows bounds, vertex count, materials and required extensions. Check the bounding box to learn which axis is up, and note `extensionsRequired`, because the loader must support every one.

Targets: hero model under 2 MB transferred and under about 300k rendered vertices on desktop. Provide a lighter LOD for mobile if the scene stutters.

## 2. Loading with meshopt

```js
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

export function loadModel(url, onProgress) {
  return new Promise((resolve, reject) =>
    loader.load(url, (gltf) => resolve(gltf.scene), onProgress, reject)
  );
}
```

If the host refuses `.glb` MIME types, serve the file as base64 text, decode it to an `ArrayBuffer` and call `loader.parse(buffer, "", onLoad, onError)`.

## 3. Stage setup

```js
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, isMobile ? 1.5 : 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 200); // narrow FOV = cinematic, less distortion

// Resize from the canvas's CSS size, never from window size
new ResizeObserver(() => {
  const { clientWidth: w, clientHeight: h } = canvas;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  requestRender();
}).observe(canvas);

// Render on demand: only draw when something changed
let needsRender = true;
export const requestRender = () => (needsRender = true);
gsap.ticker.add(() => {
  if (!visible || !needsRender) return;
  needsRender = false;
  renderer.render(scene, camera);
});

// Stop drawing offscreen or in hidden tabs
let visible = true;
new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) requestRender(); }).observe(canvas);
document.addEventListener("visibilitychange", () => { visible = !document.hidden; });
```

Call `requestRender()` from every GSAP tween's `onUpdate` that touches the scene. For continuous idle motion, set `needsRender = true` every frame while the hero is visible.

## 4. Lighting recipes

Metals reflect their surroundings, so with no environment they look dark brown or black. Always give PBR metals an environment.

```js
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
```

**Gold / brass (luxury brands):** a warm key light `0xffe2a8` at intensity 2–3 from the upper front, and a warmer rim `0xffc46b` at 1.5 from behind-left. Exposure 1.1–1.3. Material `metalness 1`, `roughness 0.15–0.3`, base color around `#ffb040` in linear values (glTF gold often uses `[1, 0.69, 0.25]`). For "liquid" highlights, animate the key light position slowly so reflections travel across the surface.

**Chrome / silver:** use a higher-contrast HDRI (Poly Haven "studio_small_08" or similar, loaded with `RGBELoader`) and roughness 0.05. Add a dark floor plane with `MeshStandardMaterial({ color: 0x050505, roughness: 0.4 })` for grounding.

**Glass / crystal:** `MeshPhysicalMaterial({ transmission: 1, thickness: 0.5, roughness: 0.05, ior: 1.5 })`. It is expensive, so use it on one hero object only. Keep a colorful object or gradient behind it so the refraction reads.

**Matte / clay:** soft `HemisphereLight` plus one directional shadow-casting light, with `roughness 0.8`. Shadows need `renderer.shadowMap.enabled = true` and cost frame time, so bake them into a texture when possible.

Keep a background that matches the brand. For black-and-gold, use a transparent canvas over the page's black so the DOM and the canvas share one color.

## 5. Framing by bounding box

```js
function frame(model, camera, fill = 0.8) {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  model.position.sub(center);                      // center at origin
  const fitH = size.y / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const fitW = size.x / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / camera.aspect;
  camera.position.set(0, 0, Math.max(fitH, fitW) / fill + size.z / 2);
  camera.lookAt(0, 0, 0);
}
```

Thin decorative strokes, ground planes or invisible helpers inflate the box. If the hero looks small, check `inspect` output for outliers, then tune `fill` by eye and nudge `model.position.y` to optically center it, since logos usually look better slightly above center.

## 6. The rig: named parameters for timelines

Never let timelines poke at Three.js objects all over the codebase. Create one rig object and animate its fields:

```js
export const rig = {
  camRadius: 18, camAngle: 0, camHeight: 0,
  modelRotY: 0, modelRotX: 0, modelScale: 1,
  keyIntensity: 2.4, exposure: 1.15,
};

export function applyRig() {
  camera.position.set(Math.sin(rig.camAngle) * rig.camRadius, rig.camHeight, Math.cos(rig.camAngle) * rig.camRadius);
  camera.lookAt(0, 0, 0);
  pivot.rotation.set(rig.modelRotX, rig.modelRotY, 0);
  pivot.scale.setScalar(rig.modelScale);
  key.intensity = rig.keyIntensity;
  renderer.toneMappingExposure = rig.exposure;
  requestRender();
}

// In a section:
gsap.timeline({ scrollTrigger: { trigger: "#reveal", start: "top top", end: "+=200%", scrub: 1, pin: true }, onUpdate: applyRig })
  .to(rig, { camAngle: Math.PI * 0.35, camRadius: 11, ease: "none" })
  .to(rig, { keyIntensity: 4, exposure: 1.35, ease: "none" }, "<");
```

This keeps every act declarative and makes the camera path easy to tweak. For complex paths, author them in Theatre.js and read its values into the rig.

## 7. Idle motion and pointer interaction

- Use idle sway, not spin: `rotY = sin(t / 2.6) * 0.4`. A full 360° spin shows the unfinished back of most logo models and can violate brand rules.
- For pointer parallax, map the pointer -1..1 to ±0.15 rad and lerp toward it at 0.06 per frame for weight.
- For drag to turn, use pointer capture, clamp Y rotation to about ±1.1 rad and X to about ±0.35, and ease back to idle on release. Set `touch-action: pan-y` on the stage so vertical page scroll still works on phones.
- Turn idle motion off under reduced motion, but keep drag.

## 8. No-model heroes

When there is no 3D asset, one strong procedural idea beats a stock model:
- **Point-cloud globe:** a Fibonacci sphere of points in `THREE.Points` with size attenuation, rotating, with pointer-reactive density.
- **Liquid metal blob:** an `IcosahedronGeometry(1, 64)` with a vertex shader driven by simplex noise, a metal material and an environment map.
- **Gradient mesh:** a full-screen plane with a fragment shader mixing 3–4 brand colors through noise. Cheap and elegant.
- **Extruded logo:** convert the SVG logo with `SVGLoader` and extrude it with `ExtrudeGeometry` (bevel on) for an instant 3D wordmark.
- **No-code options:** Unicorn Studio or Spline exports.

## 9. Poster and fallbacks

1. Render a still of the hero at the exact canvas framing. Screenshot the canvas or export it from Blender, then save as WebP at 1–1.5× display size.
2. Place it as an `<img>` in the same box as the canvas. It is the LCP element.
3. When the model loads and the first frame renders, add a class that cross-fades the canvas in (0.8 s) and the image out.
4. If WebGL creation throws, or loading fails, keep the poster and hide any "drag to turn" hint.
5. Use the poster for `og:image` too.

## 10. Common problems

| Symptom | Cause / fix |
|---|---|
| Gold looks brown or black | No environment map, or exposure too low |
| Model invisible | Wrong scale (check bounds), camera inside the model, or a missing decoder for required extensions |
| Model lies flat | Exported Z-up. Rotate `x = -Math.PI / 2` or re-export with +Y up |
| Jagged edges | `antialias: true` and pixel ratio of at least 1.5. On mobile, accept 1.5 |
| Scroll stutters when the 3D is on screen | Too many draw calls (merge meshes or use instancing), shadows on, DPR too high, or two RAF loops |
| Colors washed out | Missing `outputColorSpace = SRGBColorSpace`, or textures not tagged sRGB |
