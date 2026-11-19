// T045: the 3D room (screens.md S3 3D 화면). RoomPage loads this only through React.lazy, so three, R3F and Rapier stay out
// of the entry chunk. The scene reads the store and sends my pose; the server and the store own every room rule.
import { CameraControls, KeyboardControls, useGLTF, useKeyboardControls, useProgress } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { CuboidCollider, Physics, RigidBody } from '@react-three/rapier';
import { Ecctrl, type EcctrlHandle } from 'ecctrl';
import { useButtonStore, useJoystickStore } from 'ecctrl/input';
import { TimeControl } from 'ecctrl/time';
import { memo, Suspense, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Euler, Vector3, type Mesh } from 'three';
import type { BrawlMessage } from '../../../core/brawl/brawl-session.ts';
import { inArena } from '../../../core/brawl/arena.ts';
import type { Pose } from '../../../core/room-session.ts';
import { THEMES, type Bounds, type Look, type RoomObject, type Vec3 } from '../../../core/themes.ts';
import { t } from '../../i18n/t.ts';
import type { RoomStore } from '../../state/room-store.ts';
import { createBrawlInput, type BrawlInput } from '../../brawl/input.ts';
import { LOOKS } from '../../brawl/looks.ts';
import { flightPosition, serverNow } from '../../brawl/store.ts';
import { Arena, ARENA, Entrance } from './Arena.tsx';
import { feetY, nextSend, onStorePose } from '../send-rule.ts';
import { Avatar, DamageLabel, RemoteAvatar, shadowed } from './RemoteAvatar.tsx';
import { TouchControls } from './TouchControls.tsx';

type Move = (p: Vec3, r: number, a: Pose['a'], d?: [number, number]) => void;
type Brawl = (msg: BrawlMessage) => void;
type Control = 'forward' | 'backward' | 'leftward' | 'rightward' | 'jump' | 'run' | Skill;
// 004 T023: skill keys, also the touch buttons' ids (TouchControls).
type Skill = 'jab' | 'smash' | 'throw' | 'guard' | 'roll';
const SKILLS: Skill[] = ['jab', 'smash', 'throw', 'guard', 'roll'];

const KEYS: { name: Control; keys: string[] }[] = [
  { name: 'forward', keys: ['ArrowUp', 'KeyW'] },
  { name: 'backward', keys: ['ArrowDown', 'KeyS'] },
  { name: 'leftward', keys: ['ArrowLeft', 'KeyA'] },
  { name: 'rightward', keys: ['ArrowRight', 'KeyD'] },
  { name: 'jump', keys: ['Space'] },
  { name: 'run', keys: ['Shift'] },
  { name: 'jab', keys: ['KeyJ'] },
  { name: 'smash', keys: ['KeyK'] },
  { name: 'throw', keys: ['KeyL'] },
  { name: 'guard', keys: ['KeyI'] },
  { name: 'roll', keys: ['KeyU'] },
];
// Ecctrl's body origin is the capsule centre: half height 0.3 + radius 0.3 + float height 0.2 (its defaults) above the feet.
// The protocol's p is the feet.
const FEET = 0.8;
const euler = new Euler(0, 0, 0, 'YXZ');
const STILL = Object.fromEntries(KEYS.map((k) => [k.name, false])) as Record<Control, boolean>;

// T107: the Claude app's in-app browser dragged the page under the joystick and flashed white. The joystick takes touches as
// pointer events, which cannot cancel a drag, so touchmove on the 3D controls is cancelled here; the page behind is the sky.
function HoldPage({ sky }: { sky: string }) {
  useEffect(() => {
    const hold = (e: TouchEvent) => {
      if (e.target instanceof Element && e.target.closest('canvas, #ecctrl-joystick, #ecctrl-virtual-button')) e.preventDefault();
    };
    document.addEventListener('touchmove', hold, { passive: false });
    document.documentElement.style.backgroundColor = sky;
    return () => {
      document.removeEventListener('touchmove', hold);
      document.documentElement.style.backgroundColor = '';
    };
  }, [sky]);
  return null;
}

// memo: RoomPage re-renders on every store change, including my own pose each frame; store and move never change.
export default memo(function Scene({ store, move, brawl }: { store: RoomStore; move: Move; brawl: Brawl }) {
  const room = useSyncExternalStore(store.subscribe, () => store.getState().room);
  const peers = useSyncExternalStore(store.subscribe, () => store.getState().peers);
  const avatarId = useSyncExternalStore(store.subscribe, () => store.getState().you?.avatarId);
  const fighters = useSyncExternalStore(store.subscribe, () => store.getState().brawl.fighters);
  const diff = useSyncExternalStore(store.subscribe, () => store.getState().brawl.blocks);
  const armed = useSyncExternalStore(store.subscribe, () => !!store.getState().you && inArena(ARENA, store.getState().you!.p));
  if (!room || !avatarId) return null;
  const { themeId, objects } = room.roomData;
  const { look, bounds } = THEMES[themeId];
  return (
    <>
      <HoldPage sky={look.sky} />
      <Canvas style={{ position: 'fixed', inset: 0, zIndex: -1, touchAction: 'none' }} camera={{ fov: 60 }} dpr={[1, 1.5]} shadows>
        <Suspense fallback={null}>
          <Lights look={look} bounds={bounds} />
          <color attach="background" args={[look.sky]} />
          {look.kind === 'outdoor' && <fog attach="fog" args={[look.sky, look.fog.near, look.fog.far]} />}
          {/* Ecctrl pushes its float spring once per rendered frame, so physics steps once per frame too, at most 1/30 s:
              several fixed steps per frame bounce, and one long step blows the spring up. A slow device runs in slow motion. */}
          <Physics paused>
            <TimeControl maxDelta={1 / 30} />
            <Floor bounds={bounds} look={look} />
            <Entrance cell={THEMES[themeId].arenaEntrance} />
            <Arena diff={diff} />
            {objects.map((o) => (
              <Furniture key={o.id} object={o} />
            ))}
            <KeyboardControls map={KEYS}>
              <Me store={store} move={move} brawl={brawl} avatarId={avatarId} />
            </KeyboardControls>
          </Physics>
          {peers.map((p) => (
            <RemoteAvatar
              key={p.peerId}
              peer={p}
              damage={inArena(ARENA, p.p) ? (fighters[p.peerId]?.damage ?? 0) : null}
              fly={() => flightPosition(store.getState().brawl, p.peerId, Date.now())}
            />
          ))}
        </Suspense>
      </Canvas>
      <Progress />
      <TouchControls armed={armed} />
    </>
  );
});

function Progress() {
  const { active, progress } = useProgress();
  // 003 FR-009: on the header's light surface, since the scene behind it can be any colour.
  const surface = { background: 'rgb(255 255 255 / 0.85)', width: 'fit-content', margin: '0 auto', padding: '8px 16px', borderRadius: 8 };
  return active ? (
    <p role="status" style={surface}>
      {t('room3d.loading', { n: Math.round(progress) })}
    </p>
  ) : null;
}

// 003 research R1·R2: the theme's sun (the only shadow caster, its shadow camera fitted to the bounds) and sky/ground light. No
// reflection environment: the matte low-poly models barely show one, and drei's light-panel Environment cost mobile T045 its idle.
function Lights({ look, bounds: { min, max } }: { look: Look; bounds: Bounds }) {
  const centre = new Vector3((min[0] + max[0]) / 2, 0, (min[2] + max[2]) / 2);
  const reach = Math.hypot(max[0] - min[0], max[2] - min[2]) / 2 + 2;
  const sun = centre.clone().addScaledVector(new Vector3(...look.sun.direction).normalize(), -reach * 2);
  const mapSize = matchMedia('(pointer: coarse)').matches ? 1024 : 2048;
  return (
    <>
      <hemisphereLight args={[look.ambient.sky, look.ambient.ground, look.ambient.intensity]} />
      <directionalLight
        position={sun}
        color={look.sun.color}
        intensity={look.sun.intensity}
        castShadow
        shadow-mapSize={[mapSize, mapSize]}
        shadow-bias={-0.0005}
        shadow-normalBias={0.03}
        shadow-camera-left={-reach}
        shadow-camera-right={reach}
        shadow-camera-top={reach}
        shadow-camera-bottom={-reach}
        shadow-camera-far={reach * 5}
        target-position={centre}
      />
    </>
  );
}

// Floor plus walls on the theme bounds, so physics keeps me inside the area the server accepts. Indoor themes show those walls;
// each is drawn from the inside only, so a camera that swings out past one still sees the room through it (research R3).
function Floor({ bounds: { min, max }, look }: { bounds: Bounds; look: Look }) {
  const [w, h, d] = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const [cx, cz] = [(min[0] + max[0]) / 2, (min[2] + max[2]) / 2];
  const walls: [Vec3, number, number][] = [
    [[cx, h / 2, min[2]], 0, w],
    [[cx, h / 2, max[2]], Math.PI, w],
    [[min[0], h / 2, cz], Math.PI / 2, d],
    [[max[0], h / 2, cz], -Math.PI / 2, d],
  ];
  return (
    <RigidBody type="fixed" colliders={false}>
      <mesh rotation-x={-Math.PI / 2} position={[cx, 0, cz]} receiveShadow>
        <planeGeometry args={look.kind === 'outdoor' ? [w * 4, d * 4] : [w, d]} />
        <meshStandardMaterial color={look.floor} />
      </mesh>
      {look.kind === 'indoor' &&
        walls.map(([position, rotationY, width]) => (
          <mesh key={rotationY} position={position} rotation-y={rotationY} receiveShadow>
            <planeGeometry args={[width, h]} />
            <meshStandardMaterial color={look.wall} />
          </mesh>
        ))}
      <CuboidCollider args={[w / 2, 0.5, d / 2]} position={[cx, -0.5, cz]} />
      <CuboidCollider args={[0.5, h / 2, d / 2]} position={[min[0] - 0.5, h / 2, cz]} />
      <CuboidCollider args={[0.5, h / 2, d / 2]} position={[max[0] + 0.5, h / 2, cz]} />
      <CuboidCollider args={[w / 2, h / 2, 0.5]} position={[cx, h / 2, min[2] - 0.5]} />
      <CuboidCollider args={[w / 2, h / 2, 0.5]} position={[cx, h / 2, max[2] + 0.5]} />
    </RigidBody>
  );
}

// roomData.objects: assetId names the GLB, collider "box" becomes a fixed box collider around the model.
function Furniture({ object: o }: { object: RoomObject }) {
  const { scene } = useGLTF(`/assets/models/${o.assetId}.glb`);
  const model = useMemo(() => shadowed(scene.clone()), [scene]); // Scene re-renders on every peer move
  return (
    <RigidBody type="fixed" colliders={o.collider === 'box' ? 'cuboid' : false} position={o.position} rotation={[0, o.rotationY, 0]} scale={o.scale ?? 1}>
      <primitive object={model} />
    </RigidBody>
  );
}

// The held direction for move.d: where my body is heading, on the ground plane.
function facing(v: { x: number; z: number }): [number, number] | null {
  const n = Math.hypot(v.x, v.z);
  return n > 0.1 ? [v.x / n, v.z / n] : null;
}

function Me({ store, move, brawl, avatarId }: { store: RoomStore; move: Move; brawl: Brawl; avatarId: string }) {
  const ecctrl = useRef<EcctrlHandle>(null);
  const flash = useRef<Mesh>(null);
  const swungAt = useRef(-Infinity);
  const pressed = useRef<Partial<Record<Skill, boolean>>>({});
  const input = useRef<BrawlInput | null>(null);
  useEffect(() => {
    const i = createBrawlInput({
      send: brawl,
      serverNow: () => serverNow(store.getState().brawl, Date.now()),
      readyAt: () => store.getState().brawl.readyAt,
      show: () => (swungAt.current = performance.now()),
    });
    input.current = i;
    return () => i.dispose();
  }, [store, brawl]);
  const damage = useSyncExternalStore(store.subscribe, () => {
    const { you, brawl: b } = store.getState();
    return you && inArena(ARENA, you.p) ? (b.fighters[you.peerId]?.damage ?? 0) : null;
  });
  const camera = useRef<CameraControls>(null);
  const [, getKeys] = useKeyboardControls<Control>();
  const a = useSyncExternalStore(store.subscribe, () => store.getState().you?.a ?? 'idle');
  // The `you` my own sends produced. Any other `you` (correction, a new welcome, the E2E hook) moves the body if it is far off, or else resends my pose.
  const own = useRef(store.getState().you);
  const sending = useRef(false);
  const [[x, y, z]] = useState(() => store.getState().you?.p ?? [0, 0, 0]);

  useFrame(() => {
    const h = ecctrl.current;
    if (!h || !camera.current) return;
    // T074: while the chat input has focus the movement keys are letters (screens.md S3 3D).
    const keys = document.activeElement instanceof HTMLInputElement ? STILL : getKeys();
    const stick = useJoystickStore.getState().joysticks.default;
    const jump = keys.jump || !!useButtonStore.getState().buttons.jump;
    h.setMovement({ ...keys, jump, joystick: { x: stick.x, y: stick.y } });
    camera.current.moveTo(h.currPos.x, h.currPos.y + 0.6, h.currPos.z, false);
    if (flash.current) flash.current.visible = performance.now() - swungAt.current < LOOKS.swing.durationMs;

    const you = store.getState().you;
    // 004: while I fly the server owns my position and the store replays it (FR-031); knocked out, I just fall.
    const fly = you && flightPosition(store.getState().brawl, you.peerId, Date.now());
    if (fly) {
      h.body.setTranslation({ x: fly[0], y: fly[1] + FEET, z: fly[2] }, true);
      h.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      own.current = you;
      return;
    }
    if (you && inArena(ARENA, you.p)) {
      const touch = useButtonStore.getState().buttons;
      for (const k of SKILLS) {
        const down = !!keys[k] || !!touch[k];
        if (down === !!pressed.current[k]) continue;
        pressed.current[k] = down;
        const i = input.current;
        if (!i) break;
        if (k === 'guard') i.guard(down);
        else if (k === 'roll') {
          if (down) i.roll(facing(h.currLinVel) ?? [0, 0]);
        } else if (down) i.press(k);
        else if (k === 'smash') i.release(k);
      }
    }
    if (you && you !== own.current) {
      own.current = you;
      if (onStorePose([h.currPos.x, h.currPos.y - FEET, h.currPos.z], you.p) === 'snap') {
        h.body.setTranslation({ x: you.p[0], y: you.p[1] + FEET, z: you.p[2] }, true);
        h.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        return;
      }
      sending.current = true; // nextSend sends where I am, then idle
    }
    const v = h.currLinVel;
    const driving = keys.forward || keys.backward || keys.leftward || keys.rightward || jump || stick.active;
    const anim = nextSend(driving, sending.current, [v.x, v.y, v.z]);
    if (!anim) return;
    sending.current = anim !== 'idle';
    const r = euler.setFromQuaternion(h.currQuat).y;
    const p: Vec3 = [h.currPos.x, h.currPos.y - FEET, h.currPos.z];
    const themeId = store.getState().room?.roomData.themeId;
    move([p[0], themeId ? feetY(p[1], p, THEMES[themeId].bounds) : p[1], p[2]], r, anim, driving ? (facing(v) ?? undefined) : undefined);
    own.current = store.getState().you;
  });

  return (
    <>
      <CameraControls ref={camera} makeDefault minDistance={3} maxDistance={8} distance={5} polarAngle={1.1} />
      <Ecctrl ref={ecctrl} position={[x, y + FEET, z]}>
        <group position-y={-FEET}>
          <Avatar avatarId={avatarId} a={a} />
          <mesh ref={flash} position={[0, 1, 0.6]} visible={false}>
            <sphereGeometry args={[LOOKS.swing.size]} />
            <meshBasicMaterial color={LOOKS.swing.color} />
          </mesh>
          {damage !== null && <DamageLabel damage={damage} />}
        </group>
      </Ecctrl>
    </>
  );
}
