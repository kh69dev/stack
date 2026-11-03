// kh3don starter: Lenis + GSAP ScrollTrigger + Three.js GLB stage.
// Swap MODEL_URL for your optimized GLB (scripts/optimize-model.sh). With no model, a gold procedural knot stands in.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

const MODEL_URL = "models/hero.glb";
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const isMobile = matchMedia("(max-width: 700px)").matches;
const finePointer = matchMedia("(pointer: fine)").matches;

gsap.registerPlugin(ScrollTrigger);
ScrollTrigger.config({ ignoreMobileResize: true });

/* ---------- 1. Smooth scroll: one loop, driven by GSAP's ticker ---------- */
const lenis = new Lenis({ lerp: reduce ? 1 : 0.09, smoothWheel: !reduce });
lenis.on("scroll", ScrollTrigger.update);
gsap.ticker.add((t) => lenis.raf(t * 1000));
gsap.ticker.lagSmoothing(0);
lenis.stop(); // paused until the preloader finishes

document.querySelectorAll('a[href^="#"]').forEach((a) =>
  a.addEventListener("click", (e) => {
    const target = document.querySelector(a.getAttribute("href"));
    if (!target) return;
    e.preventDefault();
    lenis.scrollTo(target, { duration: 1.6 });
  })
);

/* ---------- 2. Stage: renderer, environment, rig ---------- */
const stageEl = document.getElementById("stage");
const canvas = document.getElementById("gl");
const rig = { modelX: isMobile ? 0 : 0.28, modelY: isMobile ? 0.24 : 0, rotY: 0, rotX: 0, scale: 1, camDist: 1, key: 2.4, exposure: 1.15 };
let renderer, scene, camera, pivot, key, baseDist = 10, needsRender = true, visible = true;
const requestRender = () => (needsRender = true);

try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
} catch (e) { renderer = null; } // poster stays as fallback

if (renderer) {
  renderer.setPixelRatio(Math.min(devicePixelRatio, isMobile ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(renderer), 0.04).texture;
  key = new THREE.DirectionalLight(0xffe2a8, rig.key); key.position.set(4, 6, 8); scene.add(key);
  const rim = new THREE.DirectionalLight(0xffc46b, 1.6); rim.position.set(-6, 3, -4); scene.add(rim);
  camera = new THREE.PerspectiveCamera(28, 1, 0.1, 500);
  pivot = new THREE.Group(); scene.add(pivot);

  new ResizeObserver(() => {
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    camera.aspect = canvas.clientWidth / canvas.clientHeight;
    camera.updateProjectionMatrix();
    applyRig();
  }).observe(canvas);
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; requestRender(); }).observe(stageEl);
  document.addEventListener("visibilitychange", () => { visible = !document.hidden; requestRender(); });
}

function applyRig() {
  if (!renderer) return;
  const halfW = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * baseDist * rig.camDist * camera.aspect;
  pivot.position.set(rig.modelX * 2 * halfW, rig.modelY * baseDist * 0.5, 0);
  pivot.rotation.set(rig.rotX + pointer.y * 0.12, rig.rotY + pointer.x * 0.2, 0);
  pivot.scale.setScalar(rig.scale);
  camera.position.set(0, 0, baseDist * rig.camDist);
  camera.lookAt(0, 0, 0);
  key.intensity = rig.key;
  renderer.toneMappingExposure = rig.exposure;
  requestRender();
}

/* Pointer parallax (desktop only), eased for weight */
const pointer = { x: 0, y: 0 }, pointerTarget = { x: 0, y: 0 };
if (finePointer && !reduce) addEventListener("pointermove", (e) => {
  pointerTarget.x = e.clientX / innerWidth * 2 - 1;
  pointerTarget.y = e.clientY / innerHeight * 2 - 1;
});

/* Single render loop, on demand */
let idleT = 0;
gsap.ticker.add((_t, dt) => {
  if (!renderer || !visible) return;
  if (!reduce) {
    idleT += dt / 1000;
    pointer.x += (pointerTarget.x - pointer.x) * 0.06;
    pointer.y += (pointerTarget.y - pointer.y) * 0.06;
    pivot.rotation.y = rig.rotY + pointer.x * 0.2 + Math.sin(idleT / 2.6) * 0.18;
    pivot.rotation.x = rig.rotX + pointer.y * 0.12;
    needsRender = true;
  }
  if (needsRender) { needsRender = false; renderer.render(scene, camera); }
});

/* ---------- 3. Model: load, center, frame ---------- */
function frame(obj) {
  const box = new THREE.Box3().setFromObject(obj), size = box.getSize(new THREE.Vector3());
  obj.position.sub(box.getCenter(new THREE.Vector3()));
  const fill = isMobile ? 0.44 : 0.72;
  baseDist = (size.y / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / fill + size.z / 2;
  pivot.add(obj);
  applyRig();
}

function proceduralHero() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffb040, metalness: 1, roughness: 0.22 });
  return new THREE.Mesh(new THREE.TorusKnotGeometry(1, 0.32, 300, 48), mat);
}

const modelReady = !renderer ? Promise.resolve() : new Promise((resolve) => {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  loader.load(MODEL_URL, (g) => { frame(g.scene); resolve(); }, (p) => p.total && progress(p.loaded / p.total),
    () => { frame(proceduralHero()); resolve(); });
});

/* ---------- 4. Preloader ---------- */
const bar = document.querySelector(".loader__bar");
const shown = { p: 0 };
function progress(p) { gsap.to(shown, { p, duration: 0.4, onUpdate: () => (bar.style.transform = `scaleX(${shown.p})`) }); }
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

Promise.race([Promise.all([modelReady, document.fonts.ready, wait(reduce ? 0 : 900)]), wait(4000)]).then(() => {
  progress(1);
  ScrollTrigger.refresh();
  if (renderer) requestAnimationFrame(() => stageEl.classList.add("is-live"));
  gsap.timeline()
    .to(".loader", { clipPath: "inset(0 0 100% 0)", duration: reduce ? 0.01 : 0.9, ease: "expo.inOut", delay: 0.2 })
    .set(".loader", { display: "none" })
    .add(heroEntrance(), "-=0.35")
    .add(() => lenis.start());
});

/* ---------- 5. Acts ---------- */
function heroEntrance() {
  const tl = gsap.timeline({ defaults: { ease: "expo.out" } });
  if (reduce) return tl;
  tl.from(rig, { scale: 0.7, rotY: -1.1, duration: 2, onUpdate: applyRig })
    .from(".hero > *", { y: 40, opacity: 0, stagger: 0.1, duration: 1.2 }, 0.2)
    .from(".nav", { y: -20, opacity: 0, duration: 0.8 }, 0.8);
  return tl;
}

const mm = gsap.matchMedia();
mm.add({ full: "(prefers-reduced-motion: no-preference)", reduced: "(prefers-reduced-motion: reduce)" }, (ctx) => {
  if (ctx.conditions.reduced) return; // statements show statically via CSS; rig stays at hero pose

  // ACT 2: pinned reveal. Model slides to center, camera pushes in, statements play in sequence.
  const statements = gsap.utils.toArray(".statement");
  const tl = gsap.timeline({
    defaults: { ease: "none" },
    scrollTrigger: { trigger: "#reveal", start: "top top", end: "+=" + (isMobile ? 160 : 260) + "%", pin: true, scrub: 1 },
    onUpdate: applyRig,
  });
  tl.to(rig, { modelX: 0, modelY: isMobile ? 0.24 : 0, camDist: isMobile ? 0.96 : 0.82, rotY: 0.5, key: 3.6, exposure: 1.3, duration: statements.length });
  statements.forEach((s, i) => {
    tl.fromTo(s, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.3 }, i)
      .to(s, { opacity: i === statements.length - 1 ? 1 : 0, y: i === statements.length - 1 ? 0 : -30, duration: 0.3 }, i + 0.7);
  });

  // ACT 3–4: model recedes so content leads
  gsap.timeline({ defaults: { ease: "none" }, onUpdate: applyRig,
    scrollTrigger: { trigger: ".proof", start: "top bottom", end: "top top", scrub: 1 } })
    .to(rig, { modelX: isMobile ? 0 : 0.3, scale: 0.7, rotY: -0.4, key: 1.6, exposure: 0.9 });

  // ACT 5: climax. Model returns to center, fully lit.
  gsap.timeline({ defaults: { ease: "none" }, onUpdate: applyRig,
    scrollTrigger: { trigger: ".cta", start: "top bottom", end: "center center", scrub: 1 } })
    .to(rig, { modelX: isMobile ? 0 : 0.25, scale: 1, rotY: 0, camDist: 0.95, key: 3, exposure: 1.25 });

  // Reveals
  gsap.utils.toArray("[data-reveal], [data-split]").forEach((el) =>
    gsap.from(el, { y: 40, opacity: 0, duration: 1.1, ease: "power3.out", scrollTrigger: { trigger: el, start: "top 85%", once: true } }));
  ScrollTrigger.batch("[data-stagger] > *", { start: "top 88%", once: true,
    onEnter: (els) => gsap.from(els, { y: 30, opacity: 0, stagger: 0.08, duration: 0.9, ease: "power2.out" }) });
});

// Counters run in both modes (instant under reduced motion)
gsap.utils.toArray("[data-count]").forEach((el) => {
  const o = { v: 0 }, end = +el.dataset.count;
  gsap.to(o, { v: end, duration: reduce ? 0 : 1.6, ease: "power2.out", onUpdate: () => (el.textContent = Math.round(o.v)),
    scrollTrigger: { trigger: el, start: "top 90%", once: true } });
});

/* ---------- 6. Magnetic buttons (desktop) ---------- */
if (finePointer && !reduce) document.querySelectorAll("[data-magnetic]").forEach((el) => {
  const mx = gsap.quickTo(el, "x", { duration: 0.4, ease: "power3" }), my = gsap.quickTo(el, "y", { duration: 0.4, ease: "power3" });
  el.addEventListener("pointermove", (e) => {
    const r = el.getBoundingClientRect();
    mx((e.clientX - r.left - r.width / 2) * 0.25); my((e.clientY - r.top - r.height / 2) * 0.35);
  });
  el.addEventListener("pointerleave", () => { mx(0); my(0); });
});
