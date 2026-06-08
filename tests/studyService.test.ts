import { describe, it, expect } from 'vitest';
import { splitIntoChunks, mapWithConcurrency } from '../src/services/studyService';

describe('splitIntoChunks', () => {
  it('splits text into fixed-size pieces', () => {
    expect(splitIntoChunks('abcdef', 2)).toEqual(['ab', 'cd', 'ef']);
  });

  it('returns a single chunk when the text is shorter than the size', () => {
    expect(splitIntoChunks('abc', 10)).toEqual(['abc']);
  });
});

describe('mapWithConcurrency', () => {
  it('preserves input order in the results', async () => {
    const out = await mapWithConcurrency([10, 20, 30], 2, async (n) => {
      await new Promise((r) => setTimeout(r, n % 15));
      return n * 2;
    });
    expect(out).toEqual([20, 40, 60]);
  });

  it('never runs more than `limit` workers at once', async () => {
    let active = 0;
    let peak = 0;
    await mapWithConcurrency([1, 2, 3, 4, 5, 6], 2, async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 10));
      active--;
      return null;
    });
    expect(peak).toBeLessThanOrEqual(2);
  });
});
