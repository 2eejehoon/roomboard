// 004 T024: the arena island (FR-014, FR-016): blocks as one instanced mesh per kind with fixed colliders to walk on, the exit
// cell and the edge drawn in LOOKS.arena colours. The room's entrance cell is drawn by Entrance.
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { useLayoutEffect, useMemo, useRef } from 'react';
import { Matrix4, type InstancedMesh } from 'three';
import { buildGrid, cellKey, makeArena, worldOf, type Block, type BlockKind, type Cell } from '../../../core/brawl/arena.ts';
import { TUNING } from '../../../core/brawl/tuning.ts';
import type { Vec3 } from '../../../core/themes.ts';
import { LOOKS } from '../../brawl/looks.ts';
import type { BrawlState } from '../../brawl/store.ts';

export const ARENA = makeArena(TUNING);
const S = ARENA.cellSize;
const centre = (cell: Cell): Vec3 => worldOf(ARENA, cell).map((v) => v + S / 2) as Vec3;

function Blocks({ kind, blocks }: { kind: BlockKind; blocks: Block[] }) {
  const mesh = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = new Matrix4();
    blocks.forEach((b, i) => mesh.current?.setMatrixAt(i, m.makeTranslation(...centre(b.cell))));
    if (mesh.current) mesh.current.instanceMatrix.needsUpdate = true;
  }, [blocks]);
  return (
    <instancedMesh key={blocks.length} ref={mesh} args={[undefined, undefined, blocks.length]} receiveShadow castShadow>
      <boxGeometry args={[S, S, S]} />
      <meshStandardMaterial color={LOOKS.blocks[kind].color} />
    </instancedMesh>
  );
}

export function Arena({ diff }: { diff: BrawlState['blocks'] }) {
  const blocks = useMemo(
    () => [...buildGrid(ARENA, new Map(diff.map(([cell, kind, hp]) => [cellKey(cell), kind ? { cell, kind, hp } : null]))).values()],
    [diff],
  );
  const [x0, , z0] = ARENA.origin;
  const [w, , d] = ARENA.size.map((n) => n * S);
  const top = ARENA.origin[1] + S;
  const exit = centre(ARENA.exit);
  return (
    <group>
      <Blocks kind="stone" blocks={blocks.filter((b) => b.kind === 'stone')} />
      <Blocks kind="dirt" blocks={blocks.filter((b) => b.kind === 'dirt')} />
      <RigidBody type="fixed" colliders={false}>
        {blocks.map((b) => (
          <CuboidCollider key={cellKey(b.cell)} args={[S / 2, S / 2, S / 2]} position={centre(b.cell)} />
        ))}
      </RigidBody>
      <mesh rotation-x={-Math.PI / 2} position={[exit[0], exit[1] - S / 2 + 0.01, exit[2]]}>
        <planeGeometry args={[S, S]} />
        <meshStandardMaterial color={LOOKS.arena.exit} />
      </mesh>
      {/* The arena edge, where the peace zone's safety ends (FR-014). */}
      {(
        [
          [x0 + w / 2, z0, w, 0.1],
          [x0 + w / 2, z0 + d, w, 0.1],
          [x0, z0 + d / 2, 0.1, d],
          [x0 + w, z0 + d / 2, 0.1, d],
        ] as const
      ).map(([x, z, sx, sz]) => (
        <mesh key={`${x},${z}`} position={[x, top + 0.02, z]}>
          <boxGeometry args={[sx, 0.04, sz]} />
          <meshStandardMaterial color={LOOKS.arena.boundary} />
        </mesh>
      ))}
    </group>
  );
}

export function Entrance({ cell }: { cell: Vec3 }) {
  return (
    <mesh rotation-x={-Math.PI / 2} position={[cell[0] + 0.5, 0.01, cell[2] + 0.5]}>
      <planeGeometry args={[1, 1]} />
      <meshStandardMaterial color={LOOKS.arena.entrance} />
    </mesh>
  );
}
