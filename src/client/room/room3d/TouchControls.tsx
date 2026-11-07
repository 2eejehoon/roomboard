// T047: touch input (screens.md S3 모바일): joystick bottom left, jump bottom right. Camera drag is the canvas's own (Scene).
import { Joystick, VirtualButton } from 'ecctrl/input';
import { t } from '../../i18n/t.ts';

export function TouchControls() {
  if (!matchMedia('(pointer: coarse)').matches) return null;
  return (
    <>
      {/* Joystick does not pass ARIA props through, so the labelled box is ours and the joystick sits inside it. */}
      <div role="group" aria-label={t('room3d.joystick')} style={{ position: 'fixed', left: 16, bottom: 16, zIndex: 10 }}>
        <Joystick joystickWrapperStyle={{ position: 'relative' }} />
      </div>
      <VirtualButton id="jump" label={t('room3d.jump')} buttonWrapperStyle={{ right: 32, bottom: 64 }} />
    </>
  );
}
