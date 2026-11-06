export const CHANNEL_CAPACITY = 20;

// Smallest channel with room left; when all are full this is max + 1 (data-model.md "Channel").
export function assignChannel(counts: Readonly<Record<number, number>>): number {
  let channel = 1;
  while ((counts[channel] ?? 0) >= CHANNEL_CAPACITY) channel++;
  return channel;
}
