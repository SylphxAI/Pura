/**
 * Benchmark: RRB-Tree operations (concat, slice)
 */

import { bench, describe } from 'vitest';
import { pura, produce } from '../packages/core/src/index';

// ===== Setup =====
const LARGE = 10000;

function createArray(size: number): number[] {
  return Array.from({ length: size }, (_, i) => i);
}

// ===== Slice benchmarks =====
describe('Large array (10000 items) - Slice middle 100', () => {
  const nativeLarge = createArray(LARGE);
  const puraLarge = pura(createArray(LARGE));

  bench('Native', () => {
    return nativeLarge.slice(4950, 5050);
  });

  bench('Pura', () => {
    return puraLarge.slice(4950, 5050);
  });
});

describe('Large array (10000 items) - Slice first half', () => {
  const nativeLarge = createArray(LARGE);
  const puraLarge = pura(createArray(LARGE));

  bench('Native', () => {
    return nativeLarge.slice(0, 5000);
  });

  bench('Pura', () => {
    return puraLarge.slice(0, 5000);
  });
});

describe('Large array (10000 items) - Slice last half', () => {
  const nativeLarge = createArray(LARGE);
  const puraLarge = pura(createArray(LARGE));

  bench('Native', () => {
    return nativeLarge.slice(5000);
  });

  bench('Pura', () => {
    return puraLarge.slice(5000);
  });
});

// ===== Concat benchmarks =====
describe('Medium arrays (1000 + 1000) - Concat', () => {
  const native1 = createArray(1000);
  const native2 = createArray(1000);
  const pura1 = pura(createArray(1000));
  const pura2 = pura(createArray(1000));

  bench('Native (concat)', () => {
    return native1.concat(native2);
  });

  bench('Native (spread)', () => {
    return [...native1, ...native2];
  });

  bench('Pura (concat)', () => {
    return pura1.concat(pura2);
  });

  bench('Pura (produce push)', () => {
    return produce(pura1, draft => {
      draft.push(...pura2);
    });
  });
});

describe('Large arrays (10000 + 10000) - Concat', () => {
  const native1 = createArray(LARGE);
  const native2 = createArray(LARGE);
  const pura1 = pura(createArray(LARGE));
  const pura2 = pura(createArray(LARGE));

  bench('Native (concat)', () => {
    return native1.concat(native2);
  });

  bench('Pura (concat)', () => {
    return pura1.concat(pura2);
  });

  bench('Pura (produce push)', () => {
    return produce(pura1, draft => {
      draft.push(...pura2);
    });
  });
});

// ===== Combined operations =====
describe('Slice then modify (10000 items)', () => {
  const nativeLarge = createArray(LARGE);
  const puraLarge = pura(createArray(LARGE));

  bench('Native (slice + push)', () => {
    const sliced = nativeLarge.slice(0, 5000);
    sliced.push(99999);
    return sliced;
  });

  bench('Pura (slice result is native)', () => {
    const sliced = puraLarge.slice(0, 5000);
    sliced.push(99999);
    return sliced;
  });
});
