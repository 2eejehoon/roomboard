#!/usr/bin/env bash
# T048: downloads the CC0 sources listed in public/assets/CREDITS.md and rebuilds public/assets/ from them.
# Needs network access to drive.google.com, drive.usercontent.google.com and dl.polyhaven.org.
# Usage: bash scripts/fetch-assets.sh
set -euo pipefail
cd "$(dirname "$0")/.."
src=$(mktemp -d)
trap 'rm -rf "$src"' EXIT
gt() { npx -y @gltf-transform/cli@4.5.1 "$@" >/dev/null; }
drive() { curl -fsSL -o "$2" "https://drive.usercontent.google.com/download?id=$1&export=download&confirm=t"; }

# Quaternius Ultimate Animated Character Pack, glTF folder. Keeps only the four clips the protocol has (anim idle/walk/run/jump).
mkdir -p public/assets/characters
while read -r out id; do
  drive "$id" "$src/$out.gltf"
  node -e '
    const fs = require("fs"), g = JSON.parse(fs.readFileSync(process.argv[1]));
    g.animations = g.animations.filter((a) => ["Idle", "Walk", "Run", "Jump"].includes(a.name));
    fs.writeFileSync(process.argv[1], JSON.stringify(g));' "$src/$out.gltf"
  gt prune "$src/$out.gltf" "$src/$out.glb"
  gt resample "$src/$out.glb" "$src/$out.glb"
  gt meshopt "$src/$out.glb" "public/assets/characters/$out.glb"
done <<'EOF'
char-01 1rrj82IYNaSWj5ySxR6fW9oojyHFiW7_r
char-02 1E79ks2jbMt5iIrI8Ag9lRgA0VRnfU4pk
char-03 1L2h3GVVJxa-_8sHnqOL-g4n7fQlD-Fdm
char-04 1ou-CadwWpR_ita6L96e169IrVUFCqWBN
char-05 1lu0NtOCZ8KAM3R9HU1spzWzqdK-_Fn-H
char-06 1fjKYtYFGqBsfgCwRxRc3Zp4blfxXFSRu
char-07 1zTy8YXT3Ioy5xZfo79eBxTaoDKSbJMuX
char-08 1f0AZRaRmoxdn64Khz6of_6wLHBzMc8AE
EOF

# Quaternius Sushi Restaurant Kit, glTF folders. File names are the assetId values in src/core/themes.ts.
mkdir -p public/assets/models
while read -r out id; do
  drive "$id" "$src/$out.gltf"
  gt meshopt "$src/$out.gltf" "public/assets/models/$out.glb"
done <<'EOF'
counter 1pkzmq6iDRUb3jREwAGxzNhavyEdB_7Sv
table-round 1JKqfGCnkDtSz2km2cpYdiE0y56WCWDqP
chair 1ajoiCzO9RNifVwT_gHJSwCdgOxiOnXVV
plant 1h3pLNvN9CuOjWTPNbPThoMLOv0phZHhv
EOF

# Poly Haven "Comfy Café" HDRI, 1k.
mkdir -p public/assets/hdri
curl -fsSL -o public/assets/hdri/cafe.hdr https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/comfy_cafe_1k.hdr
