import { describe, expect, it } from 'vitest';
import { initialView } from '../../src/client/room/webgl.ts';

// T053 (precedent 2026-11-07-2d-view-rules): without WebGL always 2D; otherwise the saved choice, else 3D.
describe('initialView', () => {
  it('without WebGL is 2D whatever rb.view says', () => {
    expect(initialView('3d', false)).toBe('2d');
    expect(initialView(null, false)).toBe('2d');
  });

  it('with WebGL follows rb.view and starts in 3D when nothing is saved', () => {
    expect(initialView('2d', true)).toBe('2d');
    expect(initialView('3d', true)).toBe('3d');
    expect(initialView(null, true)).toBe('3d');
  });
});
