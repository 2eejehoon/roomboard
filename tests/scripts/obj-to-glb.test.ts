import { describe, expect, it } from 'vitest';
import { objToGlb } from '../../scripts/obj-to-glb.mjs';

// T067: Quaternius OBJ + MTL to GLB (scripts/fetch-assets.sh).
const MTL = `newmtl Red\nKd 1.0 0.0 0.0\n\nnewmtl Blue\nKd 0.0 0.0 1.0\n`;
const OBJ = [
  'mtllib x.mtl',
  'v 0 0 0', 'v 1 0 0', 'v 1 0 1', 'v 0 0 1', 'v 0 2 0',
  'vn 0 1 0', 'vn 0 0 1',
  'usemtl Red',
  'f 1//1 2//1 3//1 4//1', // a quad: two triangles
  'usemtl Blue',
  'f 1/1/2 2/1/2 5/1/2',
].join('\n');

const parse = (glb: Buffer) => {
  const jsonLength = glb.readUInt32LE(12);
  return { json: JSON.parse(glb.subarray(20, 20 + jsonLength).toString()), bin: glb.subarray(20 + jsonLength + 8) };
};

describe('objToGlb', () => {
  const glb = objToGlb(OBJ, MTL);
  const { json, bin } = parse(glb);

  it('writes a GLB 2.0 header whose length is the file length', () => {
    expect(glb.readUInt32LE(0)).toBe(0x46546c67);
    expect(glb.readUInt32LE(4)).toBe(2);
    expect(glb.readUInt32LE(8)).toBe(glb.length);
  });

  it('one primitive per material, colored by Kd', () => {
    expect(json.meshes[0].primitives).toHaveLength(2);
    expect(json.materials.map((m: { pbrMetallicRoughness: { baseColorFactor: number[] } }) => m.pbrMetallicRoughness.baseColorFactor)).toEqual([
      [1, 0, 0, 1],
      [0, 0, 1, 1],
    ]);
  });

  it('fans the quad into 6 vertices with POSITION bounds; reads normals', () => {
    const [red, blue] = json.meshes[0].primitives;
    const pos = json.accessors[red.attributes.POSITION];
    expect(pos).toMatchObject({ count: 6, min: [0, 0, 0], max: [1, 0, 1] });
    expect(json.accessors[blue.attributes.POSITION].count).toBe(3);
    const view = json.bufferViews[json.accessors[blue.attributes.NORMAL].bufferView];
    expect([...new Float32Array(bin.buffer.slice(bin.byteOffset + view.byteOffset, bin.byteOffset + view.byteOffset + 12))]).toEqual([0, 0, 1]);
  });
});
