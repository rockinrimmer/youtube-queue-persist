import { describe, expect, it } from 'vitest';
import { EMPTY_STATE, MAX_VIDEOS, normaliseSnapshot, recordSnapshot, type QueueSnapshot } from '../lib/queue';

const video = (id: string) => ({ id, title: `Video ${id}`, author: 'A channel' });
const queue = (ids = ['jNQXAC9IVRw', 'aqz-KE-bpKQ']): QueueSnapshot => ({
  videos: ids.map(video), currentIndex: 0, position: 42,
});

describe('saved queue retention', () => {
  it('retains a saved queue when YouTube is empty, loading, or returns malformed data', () => {
    const saved = recordSnapshot(EMPTY_STATE, queue(), 1, 100);
    for (const value of [null, {}, { videos: [] }, { videos: [video('bad')] }]) {
      expect(recordSnapshot(saved, value, 1, 200)).toBe(saved);
    }
  });
  it('keeps the previous order on reorder, without replacing the backup for position updates', () => {
    const original = recordSnapshot(EMPTY_STATE, queue(), 1, 100);
    const reordered = recordSnapshot(original, queue(['aqz-KE-bpKQ', 'jNQXAC9IVRw']), 1, 200);
    const progressed = recordSnapshot(reordered, { ...reordered.current, position: 87 }, 1, 300);
    expect(progressed.previous).toEqual(original.current);
    expect(progressed.current?.position).toBe(87);
  });
  it('preserves repeated videos and their selected occurrence', () => {
    const result = normaliseSnapshot({ ...queue(['jNQXAC9IVRw', 'aqz-KE-bpKQ', 'jNQXAC9IVRw']), currentIndex: 2 });
    expect(result?.videos).toHaveLength(3);
    expect(result?.currentIndex).toBe(2);
  });
  it('clamps untrusted indices and rejects invalid or oversized video lists', () => {
    expect(normaliseSnapshot({ ...queue(), currentIndex: 500, position: -10 })).toMatchObject({ currentIndex: 1, position: 0 });
    expect(normaliseSnapshot({ ...queue(), position: Infinity })?.position).toBe(0);
    expect(normaliseSnapshot(queue(Array(MAX_VIDEOS + 1).fill('jNQXAC9IVRw')))).toBeNull();
    expect(normaliseSnapshot(queue(['https://bad.invalid']))).toBeNull();
  });
});
