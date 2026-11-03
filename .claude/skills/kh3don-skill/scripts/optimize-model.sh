#!/usr/bin/env bash
# Compress a GLB/GLTF for the web with glTF-Transform + meshopt.
# Usage: optimize-model.sh input.glb output.glb [--webp]
#   --webp   also re-encode textures to WebP (for textured models)
# Load the result with GLTFLoader + MeshoptDecoder (three/addons/libs/meshopt_decoder.module.js).
set -euo pipefail

in="${1:?input .glb required}"
out="${2:?output .glb required}"
tex="--texture-compress false"
[[ "${3:-}" == "--webp" ]] && tex="--texture-compress webp"

if command -v gltf-transform >/dev/null 2>&1; then
  GT=(gltf-transform)
else
  GT=(npx --yes @gltf-transform/cli@4)
fi

echo "Optimizing $in -> $out"
"${GT[@]}" optimize "$in" "$out" --compress meshopt $tex --simplify false

before=$(wc -c < "$in"); after=$(wc -c < "$out")
awk -v b="$before" -v a="$after" 'BEGIN { printf "Size: %.2f MB -> %.2f MB (%.0f%% smaller)\n", b/1048576, a/1048576, (1-a/b)*100 }'
echo "Inspect bounds / extensions with: ${GT[*]} inspect $out"
