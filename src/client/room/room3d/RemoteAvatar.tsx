// T046: other participants' avatars (Quaternius characters by avatarId), interpolated between their last two poses, nickname overhead.
import { Html, useAnimations, useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { MathUtils, Vector3, type Group } from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Pose } from '../../../core/room-session.ts';
import type { Peer } from '../../state/room-store.ts';

const CLIPS: Record<Pose['a'], string> = { idle: 'Idle', walk: 'Walk', run: 'Run', jump: 'Jump' };
const AVATAR_SCALE = 0.5; // the Quaternius characters are 3.3 units tall; this makes them about 1.65 m
const MOVE_INTERVAL_MS = 200; // the sender's throttle (room-socket.ts), so one pose blends into the next just as it arrives

export function Avatar({ avatarId, a }: { avatarId: string; a: Pose['a'] }) {
  const gltf = useGLTF(`/assets/characters/${avatarId}.glb`);
  // Skinned meshes need their own skeleton per instance; two peers can share an avatarId.
  const scene = useMemo(() => clone(gltf.scene), [gltf.scene]);
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

  useEffect(() => {
    const g = group.current;
    if (!g) return;
    from.current = { p: g.position.clone(), r: g.rotation.y, at: performance.now() };
    to.current = { p: new Vector3(x, y, z), r: peer.r };
  }, [x, y, z, peer.r]);

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const k = Math.min(1, (performance.now() - from.current.at) / MOVE_INTERVAL_MS);
    g.position.lerpVectors(from.current.p, to.current.p, k);
    const turn = MathUtils.euclideanModulo(to.current.r - from.current.r + Math.PI, Math.PI * 2) - Math.PI; // shortest way round
    g.rotation.y = from.current.r + turn * k;
  });

  return (
    <group ref={group} position={peer.p} rotation-y={peer.r}>
      <Avatar avatarId={peer.avatarId} a={peer.a} />
      <Html position={[0, 1.9, 0]} center>
        <span style={{ whiteSpace: 'nowrap', padding: '2px 6px', borderRadius: 4, background: 'rgba(0,0,0,0.5)', color: 'white' }}>{peer.nickname}</span>
      </Html>
    </group>
  );
}
