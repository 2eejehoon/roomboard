// T053 (precedent 2026-11-07-2d-view-rules): without WebGL the room is 2D whatever rb.view says.
import type { View } from '../device.ts';

export function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

export const initialView = (saved: View | null, webgl: boolean): View => (webgl ? (saved ?? '3d') : '2d');
