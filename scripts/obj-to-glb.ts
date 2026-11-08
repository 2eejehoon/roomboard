#!/usr/bin/env node
// T067: Quaternius OBJ + MTL (flat colors, no textures) to a GLB, Node built-ins only. scripts/fetch-assets.sh runs it, then
// gltf-transform welds and compresses the result. Usage: node scripts/obj-to-glb.ts <in.obj> <in.mtl> <out.glb>
// Reads v, vn, f (polygons fanned into triangles), usemtl, and each material's Kd; one primitive per material.
import { readFileSync, writeFileSync } from 'node:fs';

export function objToGlb(obj: string, mtl: string): Buffer {
  const colors: Record<string, number[]> = {};
  let name = '';
  for (const [k, ...a] of mtl.split('\n').map((l) => l.trim().split(/\s+/))) {
    if (k === 'newmtl') name = a.join(' ');
    if (k === 'Kd') colors[name] = a.slice(0, 3).map(Number);
  }
  const v: number[][] = [], vn: number[][] = [], groups = new Map<string, { p: number[]; n: number[] }>();
  let mat = '';
  for (const [k, ...a] of obj.split('\n').map((l) => l.trim().split(/\s+/))) {
    if (k === 'v') v.push(a.slice(0, 3).map(Number));
    else if (k === 'vn') vn.push(a.slice(0, 3).map(Number));
    else if (k === 'usemtl') mat = a.join(' ');
    else if (k === 'f') {
      const corners = a.map((c) => c.split('/').map((n) => Number(n) - 1)); // [v, vt, vn]; OBJ indices start at 1
      if (!groups.has(mat)) groups.set(mat, { p: [], n: [] });
      const g = groups.get(mat)!;
      for (let i = 1; i + 1 < corners.length; i++)
        for (const c of [corners[0]!, corners[i]!, corners[i + 1]!]) {
          g.p.push(...v[c[0]!]!);
          g.n.push(...(vn[c[2]!] ?? [0, 1, 0]));
        }
    }
  }
  const list = () => [] as object[];
  const json = { asset: { version: '2.0', generator: 'roomboard obj-to-glb' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: list() }], materials: list(), accessors: list(), bufferViews: list(), buffers: list() };
  const chunks: Buffer[] = [];
  let offset = 0;
  const add = (values: number[], min?: number[], max?: number[]) => {
    const bytes = Buffer.from(new Float32Array(values).buffer);
    json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length, target: 34962 });
    json.accessors.push({ bufferView: json.bufferViews.length - 1, componentType: 5126, count: values.length / 3, type: 'VEC3', min, max });
    chunks.push(bytes);
    offset += bytes.length;
    return json.accessors.length - 1;
  };
  for (const [m, { p, n }] of groups) {
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]; // glTF requires POSITION bounds
    p.forEach((x, j) => ((min[j % 3] = Math.min(min[j % 3]!, x)), (max[j % 3] = Math.max(max[j % 3]!, x))));
    json.materials.push({ name: m, pbrMetallicRoughness: { baseColorFactor: [...(colors[m] ?? [0.8, 0.8, 0.8]), 1], metallicFactor: 0, roughnessFactor: 0.8 } });
    json.meshes[0].primitives.push({ attributes: { POSITION: add(p, min, max), NORMAL: add(n) }, material: json.materials.length - 1 });
  }
  const bin = Buffer.concat(chunks);
  json.buffers.push({ byteLength: bin.length });
  const pad = (b: Buffer, fill: number) => Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4, fill)]);
  const j = pad(Buffer.from(JSON.stringify(json)), 0x20), b = pad(bin, 0);
  const head = (len: number, type: number) => { const h = Buffer.alloc(8); h.writeUInt32LE(len, 0); h.writeUInt32LE(type, 4); return h; };
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); // "glTF"
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + j.length + 8 + b.length, 8);
  return Buffer.concat([header, head(j.length, 0x4e4f534a), j, head(b.length, 0x004e4942), b]);
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const [objPath, mtlPath, out] = process.argv.slice(2);
  writeFileSync(out, objToGlb(readFileSync(objPath, 'utf8'), readFileSync(mtlPath, 'utf8')));
}
