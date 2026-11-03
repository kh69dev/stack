---
name: kh3don-skill
description: Step-by-step method for designing, building, analyzing and upgrading premium, cinematic 3D websites with smooth scrolling, scroll-driven animation and an unforgettable experience (Three.js / React Three Fiber, GSAP ScrollTrigger, Lenis, GLB models, WebGL, page transitions). Includes tools that audit an existing site (speed, weight, images, SEO, accessibility, animation/3D stack, content inventory), optimize its images and 3D models, and write an upgrade blueprint for its best next version. Use this skill whenever the user wants a landing page, hero, portfolio, launch or brand site that feels "premium", "cinematic", "immersive", "Awwwards-level" or "like Apple / Lusion / Igloo"; mentions 3D models, a GLB/STL logo, WebGL, smooth scroll, parallax, scroll storytelling or pinned sections; or shares a current website (URL, folder, zip or repo) and asks to analyze, audit, speed up, optimize, modernize, redesign or upgrade it, even without saying "3D" or naming a library.
---

# kh3don: cinematic 3D landing pages

This skill turns a brand and a goal into a landing page people remember. A page like that has three things: one signature 3D moment, scroll choreography that tells a story in acts, and craft details that hold up on a phone. The method below makes those decisions in the right order. Story comes first, then the 3D, then the motion, then polish and performance. Most failed "premium" sites skip the story and stack effects, which reads as noise.

There are two ways in:
- **New build:** work through Phases 0–6 in order. Each phase ends with something concrete (a file, a storyboard, a running page), so the user can redirect early.
- **Upgrade an existing website:** start with "Mode: analyze and upgrade" below. Measure the current site, optimize its assets, write an upgrade blueprint, then use Phases 1–6 to build the recommended version.

## Mode: analyze and upgrade an existing website

When the user provides a current website (URL, build folder, zip or repo), recommend its best upgraded, optimized version before building anything. Read `references/analyze-and-upgrade.md` for the full procedure. In short:

1. **Measure:** `node scripts/analyze-site.cjs <url|folder|zip> --out audit/before`. This gives scores, prioritized findings, the detected stack, screenshots and a content inventory (sections, headings, CTAs, colors, fonts).
2. **Look:** open the screenshots and note what the script cannot judge: broken typography, off-brand styling, weak hero, inconsistent brand name.
3. **Optimize:** `node scripts/optimize-assets.cjs <source> --out audit/site-optimized --report audit/before/report.json --webp`, then re-run the analyzer with `--baseline audit/before/report.json` to get a before/after table.
4. **Recommend:** write `upgrade-blueprint.md` from the template: what to keep, what to fix first, fix-in-place versus re-skin versus rebuild, the signature moment, a storyboard mapping current sections to cinematic acts, targets and a roadmap.
5. **Build and verify:** follow the roadmap using Phases 1–6, then re-run the analyzer against the original baseline.

Setup for the scripts: `npm i -D playwright sharp && npx playwright install chromium`.

## Phase 0: Gather the brand inputs

Collect these before designing anything. Ask only for what is missing.

1. **Brand system.** Colors as hex, typefaces, logo files, tone of voice, any guideline PDF. If there is a guideline, follow it exactly: its palette, type scale and rules (for example "flat gold for UI, metallic gradients only in digital visuals") override your own taste.
2. **3D assets.** GLB/GLTF is ideal. STL has no materials, so convert it or use the GLB. FBX/OBJ can be converted in Blender. With no model, plan a procedural or shader hero (see `references/3d-scene.md`).
3. **Goal and audience.** Name the one action the page should drive: book a call, buy, sign up or watch.
4. **Content.** Real headlines, sections, proof (clients, numbers, testimonials) and imagery. Never ship lorem ipsum.
5. **References.** Sites the user admires. Name the specific technique you are borrowing from each, such as "Igloo: camera flies through the object on scroll". "Make it like X" is not a technique.
6. **Constraints.** Hosting, framework (plain HTML, React/Next, Webflow), languages (RTL Arabic needs real RTL layout), deadline and device mix.

## Phase 1: Write the story before the code

A cinematic page is a short film the visitor controls with the scroll wheel. Write a storyboard as a table with one row per act. A typical arc:

| Act | Purpose | Scroll length | 3D / motion | Copy |
|---|---|---|---|---|
| 1. Hook | First 2 seconds; prove quality instantly | 100vh, no pin | Hero model reveals, gentle idle motion, cursor parallax | Brand line, one sentence |
| 2. Reveal | Show what the brand/object *is* | pinned 150–250vh | Camera orbits or pushes in; model parts separate or light sweeps | 2–3 short statements fading in sequence |
| 3. Proof | Credibility | normal scroll | Lighter motion: staggered cards, counters, logo marquee | Clients, numbers, work |
| 4. Depth | Services/features | horizontal pinned track or stacked cards | Each item gets one consistent reveal | One line per item |
| 5. Climax + CTA | Emotional peak, then ask | 100–150vh | Model returns to hero pose, fully lit; CTA appears | The ask, plain and specific |

Rules that make it memorable:
- **One signature moment.** Choose the single interaction people will describe to friends: the logo assembling, a camera flying through the globe, liquid gold pouring. Spend most of the effort there and keep everything around it quiet.
- **Rhythm.** Alternate intense acts (pinned, 3D-heavy) with calm ones (plain scroll, lots of space). Constant intensity tires the eye and the GPU.
- **Scroll is time.** 100vh of scroll is about one "beat". A pinned act longer than about 300vh feels stuck.
- **Copy carries meaning; motion carries emotion.** Never hide essential information behind an animation.

Share the storyboard with the user before building. It is cheap to change now.

## Phase 2: Pick the stack

Default stack (read `references/stack-and-setup.md` for install and wiring code):

- **Lenis**: smooth scroll with native scroll semantics, so accessibility and anchors keep working.
- **GSAP + ScrollTrigger**: pinning, scrubbing and timelines. Drive ScrollTrigger from Lenis's scroll event, use GSAP's ticker for Lenis's RAF, and keep a single animation loop.
- **Three.js**: for plain HTML, Vite or Webflow embeds. Use **React Three Fiber + Drei** when the project is already React/Next.
- **Optional**: Rive for interactive 2D/vector, Spline for quick no-code 3D scenes, Theatre.js for keyframing camera paths visually, Barba.js or the View Transitions API for page transitions.

Choose the lightest option that achieves the storyboard. A hero with one model plus scroll-linked camera moves does not need a physics engine or post-processing stack.

The fastest way to start is the bundled starter in `assets/starter/`, a no-build page wired with Lenis, GSAP ScrollTrigger and a Three.js GLB stage, with poster fallback and reduced-motion handling. Copy it, swap in the brand tokens and model, then build the acts.

## Phase 3: Prepare and stage the 3D

Read `references/3d-scene.md` for the full procedure. The essentials:

1. **Optimise the model first.** Run `scripts/optimize-model.sh input.glb output.glb`. It uses glTF-Transform with meshopt compression, which typically cuts size by 70–90% (a 6.5 MB emblem became 850 KB). Load it with `GLTFLoader` and `MeshoptDecoder`. Target under 2 MB for the hero model and under 5 MB for the whole page's 3D.
2. **Light for the material.** Metals (gold, chrome) need an environment map to look real: `RoomEnvironment` through `PMREMGenerator`, or an HDRI. Use `ACESFilmicToneMapping` and `SRGBColorSpace`, with a warm key light and a rim light. Without an environment, metal renders flat brown.
3. **Frame by bounding box.** Compute `Box3`, center the model and set the camera distance from FOV and size. Tune by eye afterwards, because thin decorative parts can inflate the box.
4. **Poster first, 3D second.** Render a still image (PNG/WebP) of the hero in the same position as the canvas. It is the first paint, the no-WebGL fallback and the social preview. Cross-fade to the live canvas once the model is ready.
5. **Drive the scene from scroll.** Expose a few named parameters (camera position, model rotation, light intensity, material emissive) and animate those from GSAP timelines with `scrub`. Do not animate the camera directly from raw scroll numbers.
6. **Respect the brand mark.** If guidelines forbid stretching, tilting or recoloring the logo, keep rotation gentle (about ±25°) and never distort its proportions.

## Phase 4: Choreograph the scroll

Read `references/scroll-choreography.md` for patterns and code: pinned 3D acts, scrubbed timelines, text reveals, image-sequence "Apple" scrubs, horizontal tracks, parallax layers, counters and page transitions.

Craft rules:
- **Easing vocabulary.** Pick about three eases and reuse them: a soft `power2.out` for reveals, an expressive `expo.inOut` for big moves, and `none` for scrubbed timelines, because scroll is already the easing.
- **Durations.** Use 0.6–1.2 s for UI reveals and 1.2–2 s for hero entrances. Stagger at 0.05–0.12 s per item.
- **Scrub smoothing.** Use `scrub: 1` (a one-second catch-up) for cinematic weight, and `scrub: true` for precise, tied-to-finger motion.
- **Pin carefully.** Use `pinSpacing: true` unless overlapping on purpose, call `ScrollTrigger.refresh()` after fonts, images and the model load, and test resizing.
- **Animate only transform and opacity** in the DOM. Never animate layout properties such as width, top or margin on scroll.

## Phase 5: Craft details that make it unforgettable

Read `references/polish-and-qa.md`. Choose the details that fit the brand, because restraint is part of premium:

- A preloader that is part of the story: the logo draws itself while assets load, with real progress and a 2–4 s ceiling.
- A cursor treatment, such as a custom dot, magnetic CTA or hover video previews. Desktop only.
- Micro-interactions on every interactive element: hover, focus and press states.
- Typographic motion on headlines: split lines or words, mask reveals.
- Sound only as opt-in, starting from a visible button.
- Section transitions tied to the brand's visual language, such as a gold keyline wipe or an orbit ring expanding.

## Phase 6: Performance, accessibility and QA

These are not optional. A cinematic site that stutters or excludes people feels cheap.

- **Budgets.** LCP under 2.5 s on 4G, about 60 fps on a mid-range laptop and at least 30 fps on a mid-range phone, and JS under 300 KB gzipped excluding the model.
- **GPU.** Cap `devicePixelRatio` at 2 (1.5 on mobile), pause rendering when the canvas is offscreen (IntersectionObserver) or the tab is hidden, and render on demand when nothing moves.
- **Reduced motion.** When `prefers-reduced-motion: reduce` is set, disable Lenis smoothing, replace scrubbed and pinned sequences with simple fades or static states, and stop idle 3D motion.
- **Mobile.** Simplify the scene (lower-poly model, no post-processing), shorten pinned sections and test touch scrolling on a real device.
- **Accessibility.** Use semantic HTML underneath everything, keep text as real text rather than canvas, give the canvas an `aria-label` and the poster `alt` text, and keep focus states visible and keyboard navigation working while Lenis is active.
- **QA.** Run the checklist in `references/polish-and-qa.md`: Lighthouse, Playwright screenshots at 1440/1024/390 widths, Safari and iOS checks, slow-network checks and a no-WebGL check.

## Deliverables

At the end, hand the user:
1. The storyboard table (Phase 1).
2. The working page or components, with brand tokens in one place (CSS custom properties).
3. The optimized model files and the poster image.
4. A short README covering how to run it, where to change copy and colors, and how to swap the model.
5. QA results: Lighthouse scores and screenshots at three widths.

## Reference files

- `references/stack-and-setup.md`: install commands, Lenis plus GSAP wiring, project structure, React Three Fiber variant.
- `references/3d-scene.md`: model pipeline, loaders, lighting recipes for gold, chrome and glass, framing, scroll-driven camera, shaders, fallbacks.
- `references/scroll-choreography.md`: copy-paste patterns for every act type, plus page transitions.
- `references/polish-and-qa.md`: preloader, cursor, magnetic buttons, text splitting, reduced motion, performance budget and QA checklist.
- `references/analyze-and-upgrade.md`: auditing a current site, reading the report, fix-in-place versus rebuild, upgrade blueprint template, verification.
- `assets/starter/`: no-build starter (`index.html`, `styles.css`, `main.js`).
- `scripts/analyze-site.cjs`: site analyzer (URL, folder or zip) producing `report.md`, `report.json` and screenshots, with `--baseline` for before/after.
- `scripts/optimize-assets.cjs`: optimized drop-in copy of a site's images and models, sized from the analyzer report.
- `scripts/optimize-model.sh`: GLB compression with glTF-Transform and meshopt.
