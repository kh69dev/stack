#!/usr/bin/env bash
# kh3don one-command audit pipeline.
# Usage: analyze-and-upgrade.sh <url | build-folder | site.zip> [out-dir]
#   URL     -> analyzer report (scores, findings, screenshots, content inventory)
#   folder  -> analyzer + optimized asset copy + before/after re-audit
#   zip     -> same as folder
# Output: <out-dir>/before/report.md, and for local builds <out-dir>/site-optimized, <out-dir>/after-assets/report.md
set -uo pipefail
target="${1:?Usage: analyze-and-upgrade.sh <url|folder|zip> [out-dir]}"
here="$(cd "$(dirname "$0")" && pwd)"
slug=$(printf '%s' "$target" | sed -E 's#https?://##; s#[^A-Za-z0-9]+#-#g; s#^-|-$##g' | cut -c1-40)
out="${2:-audit/${slug:-site}}"
mkdir -p "$out"

need() { node -e "require('$1')" >/dev/null 2>&1; }
if ! need playwright; then
  echo "Installing Playwright (one time)…"; npm i -D playwright >/dev/null 2>&1 && npx playwright install chromium >/dev/null 2>&1
fi

echo "1/3 Analyzing $target"
node "$here/analyze-site.cjs" "$target" --out "$out/before" --max-pages 6 || { echo "Analyzer failed"; exit 1; }

if [[ ! "$target" =~ ^https?:// ]]; then
  if ! need sharp; then echo "Installing sharp (one time)…"; npm i -D sharp >/dev/null 2>&1; fi
  echo "2/3 Optimizing assets"
  node "$here/optimize-assets.cjs" "$target" --out "$out/site-optimized" --report "$out/before/report.json" --webp
  echo "3/3 Re-auditing the optimized copy"
  node "$here/analyze-site.cjs" "$out/site-optimized" --out "$out/after-assets" --baseline "$out/before/report.json"
else
  echo "2/3 Live URL: asset optimization needs the build folder or a zip of the site; skipped."
  echo "3/3 Done."
fi

echo
echo "Reports:"
echo "  $out/before/report.md"
[ -f "$out/after-assets/report.md" ] && echo "  $out/after-assets/report.md (before/after)"
echo "  screenshots in $out/before/screenshots/"
echo "Next: write upgrade-blueprint.md with the kh3don template (references/analyze-and-upgrade.md)."
