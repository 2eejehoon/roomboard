// T047: touch input (screens.md S3 모바일): joystick bottom left, jump bottom right. Camera drag is the canvas's own (Scene).
import { Joystick, VirtualButton } from 'ecctrl/input';
import { t } from '../../i18n/t.ts';

const BUTTON = { width: 56, height: 56 }; // over 44 px (004 FR-035)
// 004 T024: skill buttons only in the arena; the ids are the Scene's skill controls.
const SKILLS = [
  { id: 'jab', label: 'brawl.jab', right: 32, bottom: 150 },
  { id: 'smash', label: 'brawl.smash', right: 104, bottom: 150 },
  { id: 'throw', label: 'brawl.throw', right: 104, bottom: 64 },
  { id: 'guard', label: 'brawl.guard', right: 176, bottom: 64 },
  { id: 'roll', label: 'brawl.roll', right: 176, bottom: 150 },
] as const;

export function TouchControls({ armed }: { armed: boolean }) {
  if (!matchMedia('(pointer: coarse)').matches) return null;
  return (
    <>
      {/* Joystick does not pass ARIA props through, so the labelled box is ours and the joystick sits inside it. */}
      <div role="group" aria-label={t('room3d.joystick')} style={{ position: 'fixed', left: 16, bottom: 16, zIndex: 10 }}>
        <Joystick joystickWrapperStyle={{ position: 'relative' }} />
      </div>
      {/* 003 SC-003: ecctrl's default label is light grey on the light cap (contrast 1.4). */}
      <VirtualButton id="jump" label={t('room3d.jump')} buttonWrapperStyle={{ right: 32, bottom: 64 }} buttonCapStyle={{ color: '#1f1f1f' }} />
      {armed &&
        SKILLS.map((b) => (
          <VirtualButton key={b.id} id={b.id} label={t(b.label)} buttonWrapperStyle={{ right: b.right, bottom: b.bottom, ...BUTTON }} buttonCapStyle={{ color: '#1f1f1f' }} />
        ))}
    </>
  );
}
