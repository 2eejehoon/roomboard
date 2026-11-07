import { describe, expect, it } from 'vitest';
import { createReportRequest, createRoomRequest, deleteRoomRequest, updateRoomRequest } from '../../src/core/api-schemas.ts';

const room = { title: '작은 카페', description: '', themeId: 'cafe', password: 'pass', turnstileToken: 'tok' };
const message = { messageId: 'm_1', nickname: '느긋한 수달', text: 'hi', sentAt: 1762400000000, channel: 1, sig: 'abc' };
const report = { target: { type: 'room', roomId: 'aB3dE5fG7h' }, reason: 'spam', deviceKey: '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b' };
const ok = (schema: { safeParse: (v: unknown) => { success: boolean } }, v: unknown) => schema.safeParse(v).success;

describe('createRoomRequest (openapi CreateRoomRequest)', () => {
  it('accepts a valid request, trims the title and defaults the description', () => {
    const noDesc: Partial<typeof room> = { ...room, title: '  카페  ' };
    delete noDesc.description;
    expect(createRoomRequest.parse(noDesc)).toEqual({ ...room, title: '카페', description: '' });
  });

  it.each([
    ['empty title', { title: '' }],
    ['blank title', { title: '   ' }],
    ['61-char title', { title: 'a'.repeat(61) }],
    ['301-char description', { description: 'a'.repeat(301) }],
    ['3-char password', { password: 'abc' }],
    ['65-char password', { password: 'a'.repeat(65) }],
    ['unknown theme', { themeId: 'moon' }],
    ['missing turnstile token', { turnstileToken: '' }],
  ])('rejects %s', (_, patch) => {
    expect(ok(createRoomRequest, { ...room, ...patch })).toBe(false);
  });

  it('title and description limits count characters, not UTF-16 units', () => {
    expect(ok(createRoomRequest, { ...room, title: '😀'.repeat(60), description: '😀'.repeat(300) })).toBe(true);
    expect(ok(createRoomRequest, { ...room, title: '😀'.repeat(61) })).toBe(false);
    expect(ok(createRoomRequest, { ...room, description: '😀'.repeat(301) })).toBe(false);
  });

  it('accepts the length limits exactly', () => {
    expect(ok(createRoomRequest, { ...room, title: 'a'.repeat(60), description: 'a'.repeat(300), password: 'a'.repeat(64) })).toBe(true);
    expect(ok(createRoomRequest, { ...room, password: 'abcd' })).toBe(true);
  });
});

describe('updateRoomRequest / deleteRoomRequest', () => {
  it('needs the password plus at least one change (minProperties: 2)', () => {
    expect(ok(updateRoomRequest, { password: 'pass' })).toBe(false);
    expect(ok(updateRoomRequest, { password: 'pass', title: '새 제목' })).toBe(true);
    expect(ok(updateRoomRequest, { password: 'pass', themeId: 'garden' })).toBe(true);
    expect(ok(updateRoomRequest, { title: '새 제목' })).toBe(false);
    expect(ok(updateRoomRequest, { password: 'pass', themeId: 'moon' })).toBe(false);
  });

  it('delete needs a 4~64 char password', () => {
    expect(ok(deleteRoomRequest, { password: 'pass' })).toBe(true);
    expect(ok(deleteRoomRequest, { password: 'abc' })).toBe(false);
  });
});

describe('createReportRequest (openapi CreateReportRequest)', () => {
  it('accepts room and message reports', () => {
    expect(ok(createReportRequest, report)).toBe(true);
    expect(ok(createReportRequest, { ...report, target: { type: 'message', roomId: 'aB3dE5fG7h', message } })).toBe(true);
  });

  it('accepts every reason and rejects others', () => {
    for (const reason of ['spam', 'abuse', 'sexual', 'illegal', 'other']) expect(ok(createReportRequest, { ...report, reason }), reason).toBe(true);
    expect(ok(createReportRequest, { ...report, reason: 'boring' })).toBe(false);
  });

  it('requires a uuid deviceKey and a valid room id', () => {
    expect(ok(createReportRequest, { ...report, deviceKey: 'not-a-uuid' })).toBe(false);
    expect(ok(createReportRequest, { ...report, target: { type: 'room', roomId: 'short' } })).toBe(false);
  });

  it.each(Object.keys(message))('message report requires message.%s', (field) => {
    const rest: Record<string, unknown> = { ...message };
    delete rest[field];
    expect(ok(createReportRequest, { ...report, target: { type: 'message', roomId: 'aB3dE5fG7h', message: rest } })).toBe(false);
  });
});
