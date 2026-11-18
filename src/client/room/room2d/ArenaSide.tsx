// 004 T026 (FR-033, R8): the arena seen from the side for the 2D screen. My depth row (z cell) is drawn strong, other rows faint
// with their depth difference; buttons move a cell, change row, face and use skills under the same server rules as 3D.
import { Button } from '@astryxdesign/core/Button';
import { Stack } from '@astryxdesign/core/Stack';
import { useEffect, useMemo, useRef } from 'react';
import type { BrawlMessage } from '../../../core/brawl/brawl-session.ts';
import { buildGrid, cellKey, cellOf, makeArena } from '../../../core/brawl/arena.ts';
import { TUNING } from '../../../core/brawl/tuning.ts';
import type { Pose } from '../../../core/room-session.ts';
import type { Vec3 } from '../../../core/themes.ts';
import { createBrawlInput, type BrawlInput } from '../../brawl/input.ts';
import { LOOKS } from '../../brawl/looks.ts';
import { flightOf, serverNow, type BrawlState } from '../../brawl/store.ts';
import { t } from '../../i18n/t.ts';
import type { RoomState } from '../../state/room-store.ts';

const ARENA = makeArena(TUNING);
const [W, H] = ARENA.size;
const FAINT = 0.4;
// Facing for each button: r = 0, ±π/2, π (R8); the side view looks along -z, so right is +x.
const FACE = { left: -Math.PI / 2, right: Math.PI / 2, front: Math.PI, back: 0 } as const;
type Move = (p: Vec3, r: number, a: Pose['a']) => void;

export function ArenaSide({ state, move, brawl }: { state: RoomState; move: Move; brawl: (msg: BrawlMessage) => void }) {
  const you = state.you!;
  const grid = useMemo(() => buildGrid(ARENA, new Map(state.brawl.blocks.map(([cell, kind, hp]) => [cellKey(cell), kind ? { cell, kind, hp } : null]))), [state.brawl.blocks]);
  const input = useRef<BrawlInput | null>(null);
  const live = useRef(state.brawl);
  useEffect(() => {
    live.current = state.brawl;
  });
  useEffect(() => {
    const i = createBrawlInput({ send: brawl, serverNow: () => serverNow(live.current, Date.now()), readyAt: () => live.current.readyAt, show: () => {} });
    input.current = i;
    return () => i.dispose();
  }, [brawl]);

  const [cx, cy, row] = cellOf(ARENA, you.p);
  // One cell along x or z. Off the edge (no block under) the client falls, which the server reads as a knock-out (R4).
  const step = (dx: number, dz: number, r: number) => {
    const next = [you.p[0] + dx * ARENA.cellSize, you.p[1], you.p[2] + dz * ARENA.cellSize] as Vec3;
    const [x, y, z] = cellOf(ARENA, next);
    if (grid.has(cellKey([x, y, z]))) return move(you.p, r, 'idle');
    move(grid.has(cellKey([x, y - 1, z])) ? next : [next[0], ARENA.koY - ARENA.cellSize, next[2]], r, 'walk');
  };
  const people = [you, ...state.peers].filter((p) => p.p[0] >= ARENA.bounds.min[0] && p.p[0] <= ARENA.bounds.max[0]);
  const sx = (x: number) => (x - ARENA.origin[0]) / ARENA.cellSize;
  const sy = (y: number) => H - (y - ARENA.origin[1]) / ARENA.cellSize;
  const facing = you.r;
  const dir: [number, number] = [Math.round(Math.sin(facing)), Math.round(Math.cos(facing))];

  return (
    <Stack as="section" gap={2} aria-label={t('brawl.controls')}>
      <svg role="img" aria-label={t('brawl.view', { row })} viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: 480, background: '#1d2330' }}>
        {[...grid.values()].map((b) => {
          const [x, y, z] = b.cell;
          if (z !== row && grid.has(cellKey([x, y, row]))) return null;
          return <rect key={cellKey(b.cell)} x={x} y={H - y - 1} width={1} height={1} fill={LOOKS.blocks[b.kind].color} opacity={z === row ? 1 : FAINT} />;
        })}
        {people.map((p) => {
          const launch = state.brawl.fighters[p.peerId]?.launch;
          return launch ? (
            <polyline key={`path-${p.peerId}`} points={flightOf(launch).points.map((q) => `${sx(q[0])},${sy(q[1])}`).join(' ')} fill="none" stroke={LOOKS.swing.color} strokeWidth={0.1} />
          ) : null;
        })}
        {people.map((p) => {
          const depth = cellOf(ARENA, p.p)[2] - row;
          return (
            <g key={p.peerId} data-peer={p.peerId} opacity={depth === 0 ? 1 : FAINT}>
              <circle cx={sx(p.p[0])} cy={sy(p.p[1]) - 0.5} r={0.4} fill={p === you ? '#ffffff' : '#ff8a65'} />
              {depth !== 0 && (
                <text x={sx(p.p[0])} y={sy(p.p[1]) - 1.2} fontSize={0.8} fill="#ffffff" textAnchor="middle">
                  {depth > 0 ? `+${depth}` : depth}
                </text>
              )}
            </g>
          );
        })}
        <rect x={cx} y={H - cy - 1} width={1} height={1} fill="none" stroke="#ffffff" strokeWidth={0.05} />
      </svg>
      <Stack direction="horizontal" gap={2} wrap="wrap">
        <Button label={t('brawl.left')} onClick={() => step(-1, 0, FACE.left)} />
        <Button label={t('brawl.right')} onClick={() => step(1, 0, FACE.right)} />
        <Button label={t('brawl.front')} onClick={() => step(0, -1, FACE.front)} />
        <Button label={t('brawl.back')} onClick={() => step(0, 1, FACE.back)} />
      </Stack>
      <Stack direction="horizontal" gap={2} wrap="wrap">
        <Button label={t('brawl.jab')} onClick={() => input.current?.press('jab')} />
        {/* Charged between press and release; a keyboard click sends both at once. */}
        <Button
          label={t('brawl.smash')}
          onPointerDown={() => input.current?.press('smash')}
          onPointerUp={() => input.current?.release('smash')}
          onClick={(e) => {
            if (e.detail === 0) {
              input.current?.press('smash');
              input.current?.release('smash');
            }
          }}
        />
        <Button label={t('brawl.throw')} onClick={() => input.current?.press('throw')} />
        {/* Held: pointer or a held key. */}
        <Button
          label={t('brawl.guard')}
          onPointerDown={() => input.current?.guard(true)}
          onPointerUp={() => input.current?.guard(false)}
          onKeyDown={(e) => !e.repeat && (e.key === ' ' || e.key === 'Enter') && input.current?.guard(true)}
          onKeyUp={(e) => (e.key === ' ' || e.key === 'Enter') && input.current?.guard(false)}
        />
        <Button label={t('brawl.roll')} onClick={() => input.current?.roll(dir)} />
      </Stack>
    </Stack>
  );
}

export function BrawlLog({ brawl, name }: { brawl: BrawlState; name: (peerId: string) => string }) {
  return (
    <div aria-live="polite">
      {brawl.log.map((e) => (
        <p key={e.id}>
          {e.kind === 'hit'
            ? t('brawl.log.hit', { by: name(e.by!), target: name(e.peerId), damage: e.damage! })
            : t(e.kind === 'ko' ? 'brawl.log.ko' : 'brawl.log.respawn', { name: name(e.peerId) })}
        </p>
      ))}
    </div>
  );
}

export const arenaEntranceCentre = (cell: Vec3): Vec3 => [cell[0] + 0.5, 0, cell[2] + 0.5];
