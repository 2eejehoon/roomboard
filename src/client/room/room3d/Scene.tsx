// T045: the 3D room (screens.md S3 3D 화면). RoomPage loads this only through React.lazy, so three, R3F and Rapier stay out
// of the entry chunk. The scene reads the store and sends my pose; the server and the store own every room rule.
import { CameraControls, Environment, KeyboardControls, useGLTF, useKeyboardControls, useProgress } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { CuboidCollider, Physics, RigidBody } from '@react-three/rapier';
import { Ecctrl, type EcctrlHandle } from 'ecctrl';
import { useButtonStore, useJoystickStore } from 'ecctrl/input';
import { TimeControl } from 'ecctrl/time';
import { Suspense, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Euler } from 'three';
import type { Pose } from '../../../core/room-session.ts';
import { THEMES, type Bounds, type RoomObject, type Vec3 } from '../../../core/themes.ts';
import { t } from '../../i18n/t.ts';
import type { RoomStore } from '../../state/room-store.ts';
import { nextSend } from '../send-rule.ts';
import { Avatar, RemoteAvatar } from './RemoteAvatar.tsx';
import { TouchControls } from './TouchControls.tsx';

type Move = (p: Vec3, r: number, a: Pose['a']) => void;
type Control = 'forward' | 'backward' | 'leftward' | 'rightward' | 'jump' | 'run';

const KEYS: { name: Control; keys: string[] }[] = [
  { name: 'forward', keys: ['ArrowUp', 'KeyW'] },
  { name: 'backward', keys: ['ArrowDown', 'KeyS'] },
  { name: 'leftward', keys: ['ArrowLeft', 'KeyA'] },
  { name: 'rightward', keys: ['ArrowRight', 'KeyD'] },
  { name: 'jump', keys: ['Space'] },
  { name: 'run', keys: ['Shift'] },
];
// Ecctrl's body origin is the capsule centre: half height 0.3 + radius 0.3 + float height 0.2 (its defaults) above the feet.
// The protocol's p is the feet.
const FEET = 0.8;
const euler = new Euler(0, 0, 0, 'YXZ');

export default function Scene({ store, move }: { store: RoomStore; move: Move }) {
  const room = useSyncExternalStore(store.subscribe, () => store.getState().room);
  const peers = useSyncExternalStore(store.subscribe, () => store.getState().peers);
  const avatarId = useSyncExternalStore(store.subscribe, () => store.getState().you?.avatarId);
  if (!room || !avatarId) return null;
  const { themeId, objects } = room.roomData;
  return (
    <>
      <Canvas style={{ position: 'fixed', inset: 0, zIndex: -1 }} camera={{ fov: 60 }} dpr={[1, 1.5]}>
        <Suspense fallback={null}>
          <Environment files={`/assets/hdri/${themeId}.hdr`} />
          <color attach="background" args={['#d9cbb8']} />
          {/* Ecctrl pushes its float spring once per rendered frame, so physics steps once per frame too, at most 1/30 s:
              several fixed steps per frame bounce, and one long step blows the spring up. A slow device runs in slow motion. */}
          <Physics paused>
            <TimeControl maxDelta={1 / 30} />
            <Floor bounds={THEMES[themeId].bounds} />
            {objects.map((o) => (
              <Furniture key={o.id} object={o} />
            ))}
            <KeyboardControls map={KEYS}>
              <Me store={store} move={move} avatarId={avatarId} />
            </KeyboardControls>
          </Physics>
          {peers.map((p) => (
            <RemoteAvatar key={p.peerId} peer={p} />
          ))}
        </Suspense>
      </Canvas>
      <Progress />
      <TouchControls />
    </>
  );
}

function Progress() {
  const { active, progress } = useProgress();
  return active ? <p role="status">{t('room3d.loading', { n: Math.round(progress) })}</p> : null;
}

// Floor plus walls on the theme bounds, so physics keeps me inside the area the server accepts.
function Floor({ bounds: { min, max } }: { bounds: Bounds }) {
  const [w, h, d] = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const [cx, cz] = [(min[0] + max[0]) / 2, (min[2] + max[2]) / 2];
  return (
    <RigidBody type="fixed" colliders={false}>
      <mesh rotation-x={-Math.PI / 2} position={[cx, 0, cz]}>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color="#b9a07e" />
      </mesh>
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
  const model = useMemo(() => scene.clone(), [scene]); // Scene re-renders on every peer move
  return (
    <RigidBody type="fixed" colliders={o.collider === 'box' ? 'cuboid' : false} position={o.position} rotation={[0, o.rotationY, 0]} scale={o.scale ?? 1}>
      <primitive object={model} />
    </RigidBody>
  );
}

function Me({ store, move, avatarId }: { store: RoomStore; move: Move; avatarId: string }) {
  const ecctrl = useRef<EcctrlHandle>(null);
  const camera = useRef<CameraControls>(null);
  const [, getKeys] = useKeyboardControls<Control>();
  const a = useSyncExternalStore(store.subscribe, () => store.getState().you?.a ?? 'idle');
  // The `you` my own sends produced. Any other `you` (correction, a new welcome, the E2E hook) moves the body to it.
  const own = useRef(store.getState().you);
  const sending = useRef(false);
  const [[x, y, z]] = useState(() => store.getState().you?.p ?? [0, 0, 0]);

  useFrame(() => {
    const h = ecctrl.current;
    if (!h || !camera.current) return;
    const keys = getKeys();
    const stick = useJoystickStore.getState().joysticks.default;
    const jump = keys.jump || !!useButtonStore.getState().buttons.jump;
    h.setMovement({ ...keys, jump, joystick: { x: stick.x, y: stick.y } });
    camera.current.moveTo(h.currPos.x, h.currPos.y + 0.6, h.currPos.z, false);

    const you = store.getState().you;
    if (you && you !== own.current) {
      h.body.setTranslation({ x: you.p[0], y: you.p[1] + FEET, z: you.p[2] }, true);
      h.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      own.current = you;
      return;
    }
    const v = h.currLinVel;
    const driving = keys.forward || keys.backward || keys.leftward || keys.rightward || jump || stick.active;
    const anim = nextSend(driving, sending.current, [v.x, v.y, v.z]);
    if (!anim) return;
    sending.current = anim !== 'idle';
    const r = euler.setFromQuaternion(h.currQuat).y;
    move([h.currPos.x, Math.max(0, h.currPos.y - FEET), h.currPos.z], r, anim);
    own.current = store.getState().you;
  });

  return (
    <>
      <CameraControls ref={camera} makeDefault minDistance={3} maxDistance={8} distance={5} polarAngle={1.1} />
      <Ecctrl ref={ecctrl} position={[x, y + FEET, z]}>
        <group position-y={-FEET}>
          <Avatar avatarId={avatarId} a={a} />
        </group>
      </Ecctrl>
    </>
  );
}
