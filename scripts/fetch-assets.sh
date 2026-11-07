#!/usr/bin/env bash
# T048: downloads the CC0 sources listed in public/assets/CREDITS.md and rebuilds public/assets/ from them.
# Needs network access to drive.google.com, drive.usercontent.google.com and dl.polyhaven.org.
# Usage: bash scripts/fetch-assets.sh
# Builds into a temp folder, checks it against scripts/assets.sha256, and only then copies into public/assets/,
# so a changed or broken download cannot slip in silently.
# After an intended asset change, regenerate it: (cd public/assets && sha256sum characters/* models/* hdri/*) > scripts/assets.sha256
set -euo pipefail
cd "$(dirname "$0")/.."
src=$(mktemp -d)
trap 'rm -rf "$src"' EXIT
out="$src/out" # built and checked here; public/assets/ changes only if every file matches
mkdir -p "$out/characters" "$out/models" "$out/hdri"
gt() { npx -y @gltf-transform/cli@4.5.1 "$@" >/dev/null; }
drive() { curl -fsSL -o "$2" "https://drive.usercontent.google.com/download?id=$1&export=download&confirm=t"; }

# Quaternius Ultimate Animated Character Pack, glTF folder. Keeps only the four clips the protocol has (anim idle/walk/run/jump).
while read -r name id; do
  drive "$id" "$src/$name.gltf"
  node -e '
    const fs = require("fs"), g = JSON.parse(fs.readFileSync(process.argv[1]));
    g.animations = g.animations.filter((a) => ["Idle", "Walk", "Run", "Jump"].includes(a.name));
    fs.writeFileSync(process.argv[1], JSON.stringify(g));' "$src/$name.gltf"
  gt prune "$src/$name.gltf" "$src/$name.glb"
  gt resample "$src/$name.glb" "$src/$name.glb"
  gt meshopt "$src/$name.glb" "$out/characters/$name.glb"
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
while read -r name id; do
  drive "$id" "$src/$name.gltf"
  gt meshopt "$src/$name.gltf" "$out/models/$name.glb"
done <<'EOF'
counter 1pkzmq6iDRUb3jREwAGxzNhavyEdB_7Sv
table-round 1JKqfGCnkDtSz2km2cpYdiE0y56WCWDqP
chair 1ajoiCzO9RNifVwT_gHJSwCdgOxiOnXVV
plant 1h3pLNvN9CuOjWTPNbPThoMLOv0phZHhv
EOF

# Poly Haven "Comfy Café" HDRI, 1k.
curl -fsSL -o "$out/hdri/cafe.hdr" https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/comfy_cafe_1k.hdr

(cd "$out" && sha256sum --check --quiet "$OLDPWD/scripts/assets.sha256")
cp -R "$out/." public/assets/
