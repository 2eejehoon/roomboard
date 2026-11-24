// 004 T026 (FR-033, R8): the arena seen from the side for the 2D screen. My depth row (z cell) is drawn strong, other rows faint
// with their depth difference; buttons move a cell, change row, face and use skills under the same server rules as 3D.
import { Button } from '@astryxdesign/core/Button';
import { Stack } from '@astryxdesign/core/Stack';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { BrawlMessage } from '../../../core/brawl/brawl-session.ts';
import { buildGrid, cellKey, cellOf, inArena, makeArena, type Grid } from '../../../core/brawl/arena.ts';
import { damageColor } from '../../../core/brawl/feel.ts';
import { MAX_SPEED } from '../../../core/movement.ts';
import { TUNING } from '../../../core/brawl/tuning.ts';
import type { Pose } from '../../../core/room-session.ts';
import type { Vec3 } from '../../../core/themes.ts';
import { BLOCK_KINDS, createBrawlInput, cycle, HEIGHTS, type BrawlInput } from '../../brawl/input.ts';
import { LOOKS } from '../../brawl/looks.ts';
import { flightOf, serverNow, type BrawlState, type LogEntry } from '../../brawl/store.ts';
import { t } from '../../i18n/t.ts';
import type { Peer, RoomState } from '../../state/room-store.ts';

const ARENA = makeArena(TUNING);
const [W, H] = ARENA.size;
const FAINT = 0.4;
// Facing for each button: r = 0, ±π/2, π (R8); the side view looks along -z, so right is +x.
const FACE = { left: -Math.PI / 2, right: Math.PI / 2, front: Math.PI, back: 0 } as const;
type Move = (p: Vec3, r: number, a: Pose['a'], d?: [number, number]) => void;
// The held direction (FR-028, precedent 2026-11-24-2d-held-direction): [x, z] in the side view's terms, cycled by one button.
const STEERS = [null, 'left', 'right', 'front', 'back'] as const;
const STEER_D = { left: [-1, 0], right: [1, 0], front: [0, -1], back: [0, 1] } as const;

// In the arena, or falling off it or knocked out below it until the respawn. Only a fighter can be below the room floor
// (PR #88 review), so the 2D screen's controls, side view and list all use this.
export const fighting = (brawl: BrawlState, p: Pick<Peer, 'peerId' | 'p'>) => inArena(ARENA, p.p) || p.p[1] < 0 || !!brawl.fighters[p.peerId]?.knockedOut;
const clamp = (v: number, max: number) => Math.min(max, Math.max(0, v));

export function ArenaSide({ state, move, brawl }: { state: RoomState; move: Move; brawl: (msg: BrawlMessage) => void }) {
  const you = state.you!;
  const grid = useMemo(() => buildGrid(ARENA, new Map(state.brawl.blocks.map(([cell, kind, hp]) => [cellKey(cell), kind ? { cell, kind, hp } : null]))), [state.brawl.blocks]);
  const input = useRef<BrawlInput | null>(null);
  const [kind, setKind] = useState<(typeof BLOCK_KINDS)[number]>('dirt');
  const [h, setH] = useState<(typeof HEIGHTS)[number]>(0);
  const [steer, setSteer] = useState<(typeof STEERS)[number]>(null);
  const held = (s: typeof steer): [number, number] | undefined => (s ? [...STEER_D[s]] : undefined);
  // A respawn (or an arena reset) makes a new fighter on the server with no held direction: send mine again (PR #101 review).
  const respawned = state.brawl.log.filter((e) => e.kind === 'respawn' && e.peerId === you.peerId).at(-1)?.id;
  const resend = useRef<() => void>(() => {});
  useEffect(() => {
    resend.current = () => steer && move(you.p, you.r, you.a, held(steer));
  });
  useEffect(() => {
    if (respawned !== undefined) resend.current();
  }, [respawned]);
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
  const step = (dx: number, dz: number, r: number) => {
    const to = stepTo(grid, you.p, dx, dz);
    move(to ?? you.p, r, to ? 'walk' : 'idle', held(steer));
  };
  const people = [you, ...state.peers].filter((p) => fighting(state.brawl, p));
  // Off the edge or below the island a dot stays on the view's border (PR #88 review).
  const sx = (x: number) => clamp((x - ARENA.origin[0]) / ARENA.cellSize, W);
  const sy = (y: number) => clamp(H - (y - ARENA.origin[1]) / ARENA.cellSize, H);
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
            <polyline key={`path-${p.peerId}`} points={flightOf(launch, state.brawl.blocks).points.map((q) => `${sx(q[0])},${sy(q[1])}`).join(' ')} fill="none" stroke={LOOKS.swing.color} strokeWidth={0.1} />
          ) : null;
        })}
        {people.map((p) => {
          const depth = cellOf(ARENA, p.p)[2] - row;
          const damage = state.brawl.fighters[p.peerId]?.damage ?? 0;
          return (
            <g key={p.peerId} data-peer={p.peerId} opacity={depth === 0 ? 1 : FAINT}>
              <circle cx={sx(p.p[0])} cy={sy(p.p[1]) - 0.5} r={0.4} fill={p === you ? '#ffffff' : '#ff8a65'} />
              <text x={sx(p.p[0])} y={sy(p.p[1]) - 1.2} fontSize={0.7} fill={LOOKS.damageText.colors[damageColor(damage, TUNING)]} textAnchor="middle">
                {`${damage}%`}
              </text>
              {depth !== 0 && (
                <text x={sx(p.p[0])} y={sy(p.p[1]) - 2} fontSize={0.7} fill="#ffffff" textAnchor="middle">
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
        <Button
          label={t('brawl.steer', { dir: t(steer ? `brawl.${steer}` : 'brawl.steer.none') })}
          variant="secondary"
          onClick={() => {
            const next = cycle(STEERS, steer);
            setSteer(next);
            move(you.p, you.r, you.a, held(next)); // in place: only the held direction changes
          }}
        />
      </Stack>
      <Stack direction="horizontal" gap={2} wrap="wrap">
        <Button label={t('brawl.jab')} onClick={() => input.current?.press('jab')} />
        {/* Charged between press and release; a keyboard click sends both at once. */}
        <Button
          label={t('brawl.smash')}
          onPointerDown={(e) => {
            capture(e);
            input.current?.press('smash');
          }}
          onLostPointerCapture={() => input.current?.release('smash')}
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
          onPointerDown={(e) => {
            capture(e);
            input.current?.guard(true);
          }}
          onLostPointerCapture={() => input.current?.guard(false)}
          onKeyDown={(e) => !e.repeat && (e.key === ' ' || e.key === 'Enter') && input.current?.guard(true)}
          onKeyUp={(e) => (e.key === ' ' || e.key === 'Enter') && input.current?.guard(false)}
          // A key let go after focus moved on never reaches this button (PR #88 review).
          onBlur={() => input.current?.guard(false)}
        />
        <Button label={t('brawl.roll')} onClick={() => input.current?.roll(dir)} />
        {/* US5 (FR-029): the server takes them only while I fly, once each until I land. */}
        <Button label={t('brawl.airJump')} onClick={() => brawl({ t: 'air', k: 'jump' })} />
        <Button label={t('brawl.recover')} onClick={() => brawl({ t: 'air', k: 'recover' })} />
      </Stack>
      {/* US3 (FR-015a): the cell in front at the chosen height; the server picks it from my pose. */}
      <Stack direction="horizontal" gap={2} wrap="wrap">
        <Button label={t('brawl.place')} onClick={() => brawl({ t: 'block', op: 'place', kind, h })} />
        <Button label={t('brawl.break')} onClick={() => brawl({ t: 'block', op: 'break', h })} />
        <Button label={t('brawl.kind', { kind: t(`brawl.kind.${kind}`) })} variant="secondary" onClick={() => setKind(cycle(BLOCK_KINDS, kind))} />
        <Button label={t('brawl.height', { h: t(`brawl.height.${h}`) })} variant="secondary" onClick={() => setH(cycle(HEIGHTS, h))} />
      </Stack>
    </Stack>
  );
}

// A held button (guard, smash) ends on lostpointercapture, not pointerup (PR #88 review): with the pointer captured on press,
// a release anywhere, a touch cancel or any other loss fires it once.
export const capture = (e: React.PointerEvent<HTMLElement>) => e.currentTarget.setPointerCapture(e.pointerId);

// Lines for the room's one live region (Room2D), next to the join and leave notices: a second region would compete with it.
export function BrawlLog({ brawl, name }: { brawl: BrawlState; name: (peerId: string) => string }) {
  return brawl.log.map((e) => <p key={`brawl-${e.id}`}>{logLine(e, name)}</p>);
}

function logLine(e: LogEntry, name: (peerId: string) => string): string {
  switch (e.kind) {
    case 'hit':
      return t('brawl.log.hit', { by: name(e.by!), target: name(e.peerId), damage: e.damage! });
    case 'ko':
    case 'respawn':
      return t(e.kind === 'ko' ? 'brawl.log.ko' : 'brawl.log.respawn', { name: name(e.peerId) });
    case 'start':
      return t('brawl.log.matchStart');
    case 'cancel':
      return t('brawl.log.matchCancel');
    case 'end':
      return t('brawl.log.matchEnd', { ranks: e.ranks.map((r) => t('match.rank', { rank: r.rank, name: name(r.peerId) || t('match.gone') })).join(', ') });
  }
}

// One cell along x or z, or null when a block fills it. Off the edge (no block under) the client falls, which the server reads
// as a knock-out (R4).
export function stepTo(grid: Grid, p: Vec3, dx: number, dz: number): Vec3 | null {
  const next: Vec3 = [p[0] + dx * ARENA.cellSize, p[1], p[2] + dz * ARENA.cellSize];
  const [x, y, z] = cellOf(ARENA, next);
  if (grid.has(cellKey([x, y, z]))) return null;
  return grid.has(cellKey([x, y - 1, z])) ? next : [next[0], ARENA.koY - ARENA.cellSize, next[2]];
}

// The 2D way into the arena: one move to the entrance cell's middle, sent once walking there at MAX_SPEED would be allowed
// (validateMove counts from my last move; the 2D screen sends none before this, so from now is enough).
export function entranceWalk(from: Vec3, cell: Vec3) {
  const to: Vec3 = [cell[0] + 0.5, 0, cell[2] + 0.5];
  return { to, waitMs: Math.ceil((Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]) / MAX_SPEED) * 1000) };
}
