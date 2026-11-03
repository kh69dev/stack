# kh3don starter

A no-build cinematic landing page: Lenis smooth scroll, GSAP ScrollTrigger acts, and a Three.js GLB stage with a poster fallback, a preloader, magnetic buttons and reduced-motion support.

## Run

```bash
npx serve .            # or: python3 -m http.server
```

Open the printed URL. Module scripts need a server, so opening `index.html` as a file will not work.

## Make it yours

1. **Brand:** edit the tokens at the top of `styles.css` (colors, fonts, radius). Update the Google Fonts link in `index.html` if you change fonts.
2. **Model:** optimize it with `../../scripts/optimize-model.sh source.glb models/hero.glb`. With no model, a gold torus knot stands in.
3. **Poster:** save a still of the hero as `posters/hero.webp`, using the same framing as the canvas. It is the first paint, the no-WebGL fallback and the social image.
4. **Copy:** replace every placeholder in `index.html` with real headlines, numbers and contact details.
5. **Acts:** the camera and model poses for each act live in `main.js` under "5. Acts", as tweens on the `rig` object (`modelX`, `modelY`, `rotY`, `scale`, `camDist`, `key`, `exposure`). Adjust the values, not the Three.js code.

## Structure

- `index.html`: semantic content in five acts (hook, reveal, proof, depth, CTA)
- `styles.css`: tokens, Lenis CSS, layout, buttons, reduced-motion rules
- `main.js`: scroll loop, stage, model loading and framing, preloader, act timelines, magnetic buttons
