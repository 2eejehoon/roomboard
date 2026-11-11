#!/usr/bin/env bash
# T048: downloads the CC0 sources listed in public/assets/CREDITS.md and rebuilds public/assets/ from them.
# Needs network access to drive.google.com, drive.usercontent.google.com and dl.polyhaven.org, and Node (scripts/obj-to-glb.ts).
# Usage: bash scripts/fetch-assets.sh
# Builds into a temp folder, checks it against scripts/assets.sha256, and only then copies into public/assets/,
# so a changed or broken download cannot slip in silently.
# After an intended asset change, regenerate it: (cd public/assets && sha256sum characters/* models/*) > scripts/assets.sha256
set -euo pipefail
cd "$(dirname "$0")/.."
src=$(mktemp -d)
trap 'rm -rf "$src"' EXIT
out="$src/out" # built and checked here; public/assets/ changes only if every file matches
mkdir -p "$out/characters" "$out/models"
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

# Library and garden: Quaternius packs that ship only OBJ + MTL (flat colors). scripts/obj-to-glb.ts converts, then weld + meshopt.
# Columns: assetId (src/core/themes.ts), OBJ file ID, MTL file ID.
while read -r name obj mtl; do
  drive "$obj" "$src/$name.obj"
  drive "$mtl" "$src/$name.mtl"
  node scripts/obj-to-glb.ts "$src/$name.obj" "$src/$name.mtl" "$src/$name.raw.glb"
  gt weld "$src/$name.raw.glb" "$src/$name.glb"
  gt meshopt "$src/$name.glb" "$out/models/$name.glb"
done <<'EOF'
bookshelf 1hpa7I0QjHi_Hcg9_Dm-9TUN-Qb_a4WIN 1YEmYxrl6V9ORnZwHMSd64GWNxS-oPfTm
desk 1HPJNsymf8OgAvYF_3sN0RsSS-yGjHpSt 1ng5h-xn7FfSeDceeioo9lBz8b5qsfrsF
sofa 1Hju6oL6uFkl6VRzEMcYvlnGoRLFOT6Af 1Arw6gdvzN_DnvmWSeyIAOhdbJ5f_7Qje
lamp 1nD6mSl6ABJb2ZRadlY6asOyIqJnTG6Vj 1NN7uOj3cV9N6NdHGEnAToLGTtcQvJnwi
well 1WvIYKeSNeK5TuCdKdoHEjLpTWhy1Ccks 1gxjNIUoglw3TCXubV7svoNB9gbsvq5cM
bench 1L50vmvVhtQEMlqu2e95h1ZjjGUsj2zjo 1agcaElbWrwjtDfdU09Mqe1iIGwSobu_-
tree 1mZ9G3T_F76NU2ug3CmsMv-hLoomVrD6K 1duQHNFJxdzuLfpjYTR0-b3wFNiq4SOAu
flowers 1oOzfuZTnGm9sygsquH1jvCm1wMyny5Ux 1t0d4ukZJhA3InosrBnOOHUQSPM8MPP-T
EOF

(cd "$out" && sha256sum --check --quiet "$OLDPWD/scripts/assets.sha256")
cp -R "$out/." public/assets/
