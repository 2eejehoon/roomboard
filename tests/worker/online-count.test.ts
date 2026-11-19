import { runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { insertRoom, joinRoom } from './rooms-helpers.ts';

const onlineCount = (roomId: string) => env.DB.prepare('SELECT online_count FROM rooms WHERE id = ?').bind(roomId).first<number>('online_count');
const alarmAt = (stub: DurableObjectStub) => runInDurableObject(stub, (_o, state) => state.storage.getAlarm());

describe('rooms.online_count', () => {
  it('is written by a DO alarm about 2 seconds after joins and leaves, not on every change', async () => {
    const roomId = await insertRoom();
    const stub = env.ROOM.getByName(roomId);
    const before = Date.now();
    const a = await joinRoom(roomId, 1);
    await joinRoom(roomId, 2);
    await a.next(); // peer_joined

    const at = await alarmAt(stub);
    expect(at).not.toBeNull();
    expect(at! - before).toBeGreaterThanOrEqual(1500);
    expect(at! - before).toBeLessThanOrEqual(2500);
    expect(await onlineCount(roomId), 'nothing is written before the alarm').toBe(0);
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect(await onlineCount(roomId)).toBe(2);

    a.ws.close(1000);
    await expect.poll(() => alarmAt(stub)).not.toBeNull();
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect(await onlineCount(roomId)).toBe(1);
  });

  // 004: brawl events share this alarm, so an alarm with an unchanged count must not write D1 again.
  it('an alarm with the same count writes nothing; a changed count is written', async () => {
    const roomId = await insertRoom();
    const stub = env.ROOM.getByName(roomId);
    const a = await joinRoom(roomId, 1);
    await joinRoom(roomId, 2);
    await a.next(); // peer_joined
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect(await onlineCount(roomId)).toBe(2);
    // A marker the DO would overwrite if it wrote again.
    await env.DB.prepare('UPDATE rooms SET online_count = 99 WHERE id = ?').bind(roomId).run();
    await runInDurableObject(stub, (_o, state) => state.storage.setAlarm(Date.now() + 60_000));
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect(await onlineCount(roomId), 'same count, no write').toBe(99);
    a.ws.close(1000);
    await expect.poll(() => alarmAt(stub)).not.toBeNull();
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect(await onlineCount(roomId)).toBe(1);
  });
});
