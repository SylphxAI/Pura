/**
 * Benchmark: Single API approach vs Native vs Immer
 * Tests the performance of the simplified produce() API
 */

import { bench, describe } from 'vitest';
import { produce } from '../packages/core/src/index';
import { produce as immerProduce } from 'immer';

// ===== Setup =====
const SIZE = 1000;
const nativeArr = Array.from({ length: SIZE }, (_, i) => i);
const puraArr = produce(nativeArr, () => {}); // Convert to efficient array

describe('Single update at index 500', () => {
  bench('Native (copy)', () => {
    const copy = nativeArr.slice();
    copy[500] = 999;
    return copy;
  });

  bench('Pura produce()', () => {
    return produce(puraArr, draft => {
      draft[500] = 999;
    });
  });

  bench('Immer produce()', () => {
    return immerProduce(nativeArr, draft => {
      draft[500] = 999;
    });
  });
});

// ===== Push operations =====
describe('Push 10 items', () => {
  bench('Native (copy)', () => {
    const copy = nativeArr.slice();
    for (let i = 0; i < 10; i++) {
      copy.push(i);
    }
    return copy;
  });

  bench('Pura produce()', () => {
    return produce(puraArr, draft => {
      for (let i = 0; i < 10; i++) {
        draft.push(i);
      }
    });
  });

  bench('Immer produce()', () => {
    return immerProduce(nativeArr, draft => {
      for (let i = 0; i < 10; i++) {
        draft.push(i);
      }
    });
  });
});

// ===== Multiple updates =====
describe('Update 100 random indices', () => {
  const indices = Array.from({ length: 100 }, () => Math.floor(Math.random() * SIZE));

  bench('Native (copy)', () => {
    const copy = nativeArr.slice();
    for (const idx of indices) {
      copy[idx] = 999;
    }
    return copy;
  });

  bench('Pura produce()', () => {
    return produce(puraArr, draft => {
      for (const idx of indices) {
        draft[idx] = 999;
      }
    });
  });

  bench('Immer produce()', () => {
    return immerProduce(nativeArr, draft => {
      for (const idx of indices) {
        draft[idx] = 999;
      }
    });
  });
});

// ===== Read access =====
describe('Read all items (iteration)', () => {
  bench('Native', () => {
    let sum = 0;
    for (let i = 0; i < nativeArr.length; i++) {
      sum += nativeArr[i]!;
    }
    return sum;
  });

  bench('Pura', () => {
    let sum = 0;
    for (let i = 0; i < puraArr.length; i++) {
      sum += puraArr[i]!;
    }
    return sum;
  });
});

// ===== Array methods =====
describe('Array methods (map)', () => {
  bench('Native', () => {
    return nativeArr.map(x => x * 2);
  });

  bench('Pura', () => {
    return puraArr.map(x => x * 2);
  });
});

// ===== No changes (reference identity) =====
describe('No changes (should return same instance)', () => {
  bench('Native (copy anyway)', () => {
    return nativeArr.slice();
  });

  bench('Pura produce() - no changes', () => {
    return produce(puraArr, () => {
      // No changes
    });
  });

  bench('Immer produce() - no changes', () => {
    return immerProduce(nativeArr, () => {
      // No changes
    });
  });
});
