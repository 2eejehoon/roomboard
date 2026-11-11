// T046: other participants' avatars (Quaternius characters by avatarId), interpolated between their last two poses, nickname overhead.
import { Html, useAnimations, useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MathUtils, Mesh, Vector3, type Group, type Material, type MeshStandardMaterial, type Object3D } from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { AVATAR_SKINS } from '../../../core/identity.ts';
import type { Pose } from '../../../core/room-session.ts';
import type { Peer } from '../../state/room-store.ts';

const CLIPS: Record<Pose['a'], string> = { idle: 'Idle', walk: 'Walk', run: 'Run', jump: 'Jump' };
const AVATAR_SCALE = 0.5; // the Quaternius characters are 3.3 units tall; this makes them about 1.65 m
const MOVE_INTERVAL_MS = 200; // the sender's throttle (room-socket.ts), so one pose blends into the next just as it arrives

// Every mesh of a model casts a shadow and takes them (003 FR-002).
export function shadowed<T extends Object3D>(model: T): T {
  model.traverse((o) => {
    o.castShadow = o.receiveShadow = true;
  });
  return model;
}

// The skin material, painted with the avatar's skin colour (AVATAR_SKINS). Shared by every instance of the avatar, all the same colour.
function paintSkin(model: Object3D, color: string) {
  model.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    for (const m of [o.material as Material | Material[]].flat()) if (m.name === 'Skin') (m as MeshStandardMaterial).color.set(color);
  });
}

export function Avatar({ avatarId, a }: { avatarId: string; a: Pose['a'] }) {
  const gltf = useGLTF(`/assets/characters/${avatarId}.glb`);
  // Skinned meshes need their own skeleton per instance; two peers can share an avatarId.
  const scene = useMemo(() => {
    const model = shadowed(clone(gltf.scene));
    const skin = AVATAR_SKINS[avatarId];
    if (skin) paintSkin(model, skin);
    return model;
  }, [gltf.scene, avatarId]);
  const { actions } = useAnimations(gltf.animations, scene);
  useEffect(() => {
    const action = actions[CLIPS[a]];
    action?.reset().fadeIn(0.2).play();
    return () => void action?.fadeOut(0.2);
  }, [actions, a]);
  return <primitive object={scene} scale={AVATAR_SCALE} />;
}

export function RemoteAvatar({ peer }: { peer: Peer }) {
  const group = useRef<Group>(null);
  const from = useRef({ p: new Vector3(...peer.p), r: peer.r, at: 0 });
  const to = useRef({ p: new Vector3(...peer.p), r: peer.r });
  const [x, y, z] = peer.p;
  // Mount pose only. Reactive position/rotation props would move the group on commit, before the effect reads it as `from`.
  const [start] = useState(() => ({ p: peer.p, r: peer.r }));

  useEffect(() => {
    const g = group.current;
    if (!g) return;
    from.current = { p: g.position.clone(), r: g.rotation.y, at: performance.now() };
    to.current = { p: new Vector3(x, y, z), r: peer.r };
  }, [x, y, z, peer.r]);

  // Priority -1: before the child Html's frame callback, which places the label from this group's matrix. At 0 the child (subscribed
  // first) runs first and the label trails a frame behind, so after one long frame it jumps although the avatar glided (T046, CI).
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const k = Math.min(1, (performance.now() - from.current.at) / MOVE_INTERVAL_MS);
    g.position.lerpVectors(from.current.p, to.current.p, k);
    const turn = MathUtils.euclideanModulo(to.current.r - from.current.r + Math.PI, Math.PI * 2) - Math.PI; // shortest way round
    g.rotation.y = from.current.r + turn * k;
  }, -1);

  return (
    <group ref={group} position={start.p} rotation-y={start.r}>
      <Avatar avatarId={peer.avatarId} a={peer.a} />
      <Html position={[0, 1.9, 0]} center>
        <span style={{ whiteSpace: 'nowrap', padding: '2px 6px', borderRadius: 4, background: 'rgba(0,0,0,0.5)', color: 'white' }}>{peer.nickname}</span>
      </Html>
    </group>
  );
}
