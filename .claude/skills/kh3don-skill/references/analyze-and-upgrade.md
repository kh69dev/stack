# Analyze and upgrade an existing website

Use this when the user hands over a current website (a live URL, a build folder, a zip, or a repo) and wants to know how to make it faster, better and more premium, or wants the upgraded version built.

The output is an **upgrade blueprint**: a recommendation for the best next version of *their* site that keeps what works (content, brand equity, assets) and replaces what doesn't. Measure first, recommend second, build third, then measure again.

## Contents
1. Run the analysis
2. Read the report
3. Look at it yourself
4. Optimize assets (quick win)
5. Decide: fix in place or rebuild
6. Write the upgrade blueprint (template)
7. Build and verify

## 1. Run the analysis

```bash
# one-time setup in any project folder
npm i -D playwright sharp && npx playwright install chromium

# a live site
node <skill>/scripts/analyze-site.cjs https://example.com --out audit/before --max-pages 6
# a build folder or the zip the client sent
node <skill>/scripts/analyze-site.cjs ./site.zip --out audit/before
```

It writes `report.md` (human-readable), `report.json` (machine-readable, used by the optimizer and for comparisons) and `screenshots/` (desktop and mobile, hero and full page).

What it measures:
- **Performance:** FCP, LCP (and which element), total blocking time, layout shift, desktop and 4×-throttled mobile, page weight by type, largest files, third-party weight, compression and cache headers.
- **Assets:** heavy PNG/JPEG, images far larger than displayed, duplicates, 3D model weight, and, for folders and zips, files in the build that no crawled page requests, plus server code in the web root.
- **SEO:** title, description, one H1, `lang`, canonical, Open Graph image, structured data, and duplicate titles across pages.
- **Accessibility:** alt text, unnamed buttons and links, unlabeled fields, horizontal overflow, and reduced-motion handling.
- **Experience:** detected stack (Three.js, R3F, GSAP and ScrollTrigger, Lenis, Locomotive, Motion, Spline, Rive and others), smooth scroll, scroll-driven animation, a 3D moment, poster fallback, headless scroll smoothness, console errors and failed requests.
- **Content inventory:** sections top to bottom with headings and media, all headings, navigation, calls to action, colors and fonts in use, image, video and form counts. This is the raw material for the blueprint.

Headless timings use a software GPU, so read fps and timings as relative. For absolute field data on a live URL, also run PageSpeed Insights (`https://pagespeed.web.dev/analysis?url=...`) and note the mobile Performance score.

## 2. Read the report

- **P1** breaks the experience or costs real visitors: multi-second loads, broken layout, missing title or description. Fix all of them in the upgrade, no exceptions.
- **P2** is clearly below premium standard. Fix most of them.
- **P3** is polish and hygiene. Batch them.

Look for the root cause behind clusters. Ten image findings usually mean "no image pipeline". A slow LCP plus a high TBT usually means "the hero waits for a big JS bundle".

## 3. Look at it yourself

Open every screenshot. The script cannot judge taste, so check by eye for:
- broken typography (missing word spaces, clipped glyphs, orphans), off-brand colors or fonts, inconsistent brand name spelling
- sections that look templated, duplicate content, weak or missing CTAs
- a hero that does not say what the business does within 3 seconds
- content invisible in a full-page screenshot (reveal animations that never fire without scrolling)
- anything off on mobile: overlaps, cramped nav, tiny tap targets

Write these down as manual findings. They often matter more than the measured ones.

## 4. Optimize assets (quick win)

```bash
node <skill>/scripts/optimize-assets.cjs ./site.zip --out audit/site-optimized --report audit/before/report.json --webp
node <skill>/scripts/analyze-site.cjs audit/site-optimized --out audit/after-assets --baseline audit/before/report.json
```

The optimizer writes a drop-in copy with the same file names and formats:
- resizes each image to twice the largest size the page displays it at (from the report)
- recompresses JPEG with mozjpeg and PNG with palette quantization or lossless, whichever is smaller
- writes WebP siblings with `--webp`, for `<picture>` upgrades
- compresses GLB/GLTF with meshopt

Review a few images by eye, especially gradients and logos, before deploying. The second command prints a before/after table for the client.

## 5. Decide: fix in place or rebuild

| Signal | Recommendation |
|---|---|
| Good stack (React/Vite/Next, already uses GSAP or R3F), problems are assets, SEO, polish | **Fix in place.** Optimize assets, add meta, split bundles, add reduced motion, then layer the cinematic acts onto existing sections |
| Content is right but the design is off-brand or templated, stack is fine | **Re-skin + re-choreograph:** new tokens, typography and storyboard on the same codebase |
| Page builder / jQuery theme / heavy plugins, LCP > 4 s, the client wants an immersive experience | **Rebuild** with the kh3don stack (Phases 1–6 of the main skill), migrating content from the inventory |
| Brand guidelines changed since the site was built | Re-skin at minimum. Old tokens (colors, fonts, logo files) are usually the most visible problem |

State the choice and the reason in one or two sentences. Clients need to hear why, not only what.

## 6. Upgrade blueprint template

Write `upgrade-blueprint.md` with these sections. Keep it concrete: file names, numbers, section names from the inventory.

```markdown
# <Brand> website upgrade blueprint

## 1. Where it stands
Score X/100 (Performance A · Assets B · SEO C · Accessibility D · Experience E).
Three sentences: what works, what hurts most, what the upgrade achieves.

## 2. Keep
Content, assets and decisions that already work (with section names from the inventory).

## 3. Fix first (P1 + manual must-fixes)
| Problem | Evidence | Fix | Effort |

## 4. Recommended version
- Approach: fix in place / re-skin / rebuild, and why
- Stack: ...
- Brand system: tokens to apply (colors, fonts, logo version)
- Signature moment: the one 3D/motion idea people will remember

## 5. Storyboard: current sections → cinematic acts
| Act | Current section(s) | What changes | Motion / 3D | Copy |

## 6. Asset plan
Optimized images (before → after), 3D model and poster, new imagery needed.

## 7. Targets
| Metric | Now | Target |
(page weight, mobile LCP, TBT, CLS, overall score, Lighthouse mobile)

## 8. Roadmap
Day 1 quick wins · Week 1 structural · Week 2 cinematic layer · Launch QA.

## 9. How we will verify
Re-run analyze-site.cjs with --baseline and attach the before/after table, plus PageSpeed Insights mobile.
```

## 7. Build and verify

Build in the order of the roadmap, so each step is shippable on its own:
1. Asset swap and meta fixes, then deploy. Visitors feel this immediately.
2. Structural fixes: bundle splitting, lazy embeds, reduced motion, typography bugs.
3. The cinematic layer: storyboard acts, the signature 3D moment, transitions (main skill Phases 3–5).
4. QA (`polish-and-qa.md`), then re-run the analyzer with `--baseline` and share the before/after table with the client.
