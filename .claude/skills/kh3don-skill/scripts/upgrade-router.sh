#!/usr/bin/env bash
# kh3don prompt router (Claude Code UserPromptSubmit hook).
# When a prompt asks to analyze/audit and upgrade a website, inject instructions that route the turn
# through kh3don-skill's analyze-and-upgrade mode and the other skills that strengthen the result.
# Prompts that don't match produce no output, so the hook is invisible for normal work.
#
# Settings entry (project .claude/settings.json or ~/.claude/settings.json):
#   "hooks": { "UserPromptSubmit": [ { "hooks": [ { "type": "command",
#     "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/skills/kh3don-skill/scripts/upgrade-router.sh" } ] } ] }

input=$(cat)
if command -v jq >/dev/null 2>&1; then
  prompt=$(printf '%s' "$input" | jq -r '.prompt // empty' 2>/dev/null)
else
  prompt=$(printf '%s' "$input" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("prompt",""))' 2>/dev/null)
fi
[ -z "$prompt" ] && exit 0

lc=$(printf '%s' "$prompt" | tr '[:upper:]' '[:lower:]')
# Trigger phrases: "analyze and upgrade", "analyse & upgrade", "audit and upgrade", "analyze ... and recommend upgrading",
# "upgrade this website", "/analyze-and-upgrade"
if ! printf '%s' "$lc" | grep -qE '(analy[sz]e|audit|review)[^.]{0,60}(and|&|\+|\|)[^.]{0,20}(upgrade|upgrading|optimi[sz]e|redesign|moderni[sz]e)|upgrade (this|my|the) (web)?site|/analyze-and-upgrade'; then
  exit 0
fi

# First URL, zip or folder-looking token in the prompt
target=$(printf '%s' "$prompt" | grep -oE 'https?://[^ )"'"'"'>]+' | head -1)
[ -z "$target" ] && target=$(printf '%s' "$prompt" | grep -oE '[^ ]+\.zip' | head -1)
[ -z "$target" ] && target=$(printf '%s' "$prompt" | grep -oE '(\./|/)[^ ]+' | head -1)
[ -z "$target" ] && target="(no URL found: ask the user for the website URL, build folder or zip)"

read -r -d '' ctx <<EOF
kh3don analyze-and-upgrade request detected. Target: ${target}

Run this as a full kh3don upgrade engagement:
1. Load the kh3don-skill skill and follow "Mode: analyze and upgrade" plus references/analyze-and-upgrade.md.
2. Measure: run .claude/skills/kh3don-skill/scripts/analyze-and-upgrade.sh "${target}" (it runs the analyzer, and for folders or zips also the asset optimizer and a before/after re-audit). If Playwright or sharp are missing, install them as the script says.
3. Look: open the desktop and mobile screenshots and record what the script cannot judge (typography bugs, hero readability, off-brand styling, brand-name consistency, weak CTAs, unproven claims).
4. Recommend: write upgrade-blueprint.md from the template: score, keep, fix first (every P1 plus manual must-fixes), recommended version (fix in place, re-skin or rebuild, and why), signature 3D/motion moment, current sections mapped to the five cinematic acts, asset plan, targets, roadmap, verification.
5. Use other skills when they add value, if they are available in this session:
   - SEO findings: seo-audit / technical-seo / schema skills for meta, structured data and crawlability.
   - Accessibility: an accessibility-review or a11y-audit skill for contrast, focus and labels.
   - Brand: if the user has brand guidelines, logos or 3D files, apply them exactly (brand-voice or design-system skills); check contrast of every brand color.
   - Design and preview: frontend-design / artifact-design for any page or preview you build.
   - Client deliverables: a working plan and a quotation in the client's brand style, exported to PDF (pdf skill or Playwright page.pdf), and a shareable Artifact page.
6. Deliver: report scores and the before/after table, give the blueprint, list exactly what is still needed from the user (brand files, hi-res images, testimonials, source code or hosting access), and offer to start the build (kh3don Phases 1-6) once they approve.
EOF

if command -v jq >/dev/null 2>&1; then
  jq -n --arg c "$ctx" '{hookSpecificOutput: {hookEventName: "UserPromptSubmit", additionalContext: $c}}'
else
  python3 -c 'import sys,json;print(json.dumps({"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":sys.argv[1]}}))' "$ctx"
fi
