/**
 * Benchmark: Pura vs Native Array
 *
 * Compares three approaches:
 * 1. Native array (mutable)
 * 2. Native array with naive copy (immutable via slice)
 * 3. Pura (efficient tree-based)
 */

import { bench, describe } from 'vitest';
import { pura, produce } from '../packages/core/src/index';

// ===== Setup =====
const SMALL = 100;
const MEDIUM = 1000;
const LARGE = 10000;

// ===== Small arrays (100 items) =====
describe('Small array (100 items) - Single update', () => {
  const nativeSmall = Array.from({ length: SMALL }, (_, i) => i);
  const puraSmall = pura(nativeSmall);

  bench('Native (direct mutate)', () => {
    nativeSmall[50] = 999;
    return nativeSmall;
  });

  bench('Native (copy then mutate)', () => {
    const copy = nativeSmall.slice();
    copy[50] = 999;
    return copy;
  });

  bench('Pura (produce)', () => {
    return produce(puraSmall, draft => {
      draft[50] = 999;
    });
  });
});

describe('Small array (100 items) - Push', () => {
  const nativeSmall = Array.from({ length: SMALL }, (_, i) => i);
  const puraSmall = pura(nativeSmall);

  bench('Native (direct mutate)', () => {
    nativeSmall.push(100);
    nativeSmall.pop(); // Reset to maintain state
    return nativeSmall;
  });

  bench('Native (copy then mutate)', () => {
    const copy = nativeSmall.slice();
    copy.push(100);
    return copy;
  });

  bench('Pura (produce)', () => {
    return produce(puraSmall, draft => {
      draft.push(100);
    });
  });
});

// ===== Medium arrays (1000 items) =====
describe('Medium array (1000 items) - Single update', () => {
  const nativeMedium = Array.from({ length: MEDIUM }, (_, i) => i);
  const puraMedium = pura(nativeMedium);

  bench('Native (direct mutate)', () => {
    nativeMedium[500] = 999;
    return nativeMedium;
  });

  bench('Native (copy then mutate)', () => {
    const copy = nativeMedium.slice();
    copy[500] = 999;
    return copy;
  });

  bench('Pura (produce)', () => {
    return produce(puraMedium, draft => {
      draft[500] = 999;
    });
  });
});

describe('Medium array (1000 items) - Push 10 items', () => {
  const nativeMedium = Array.from({ length: MEDIUM }, (_, i) => i);
  const puraMedium = pura(nativeMedium);

  bench('Native (direct mutate)', () => {
    for (let i = 0; i < 10; i++) {
      nativeMedium.push(i);
    }
    for (let i = 0; i < 10; i++) {
      nativeMedium.pop(); // Reset
    }
    return nativeMedium;
  });

  bench('Native (copy then mutate)', () => {
    const copy = nativeMedium.slice();
    for (let i = 0; i < 10; i++) {
      copy.push(i);
    }
    return copy;
  });

  bench('Pura (produce)', () => {
    return produce(puraMedium, draft => {
      for (let i = 0; i < 10; i++) {
        draft.push(i);
      }
    });
  });
});

describe('Medium array (1000 items) - Multiple updates (10 indices)', () => {
  const nativeMedium = Array.from({ length: MEDIUM }, (_, i) => i);
  const puraMedium = pura(nativeMedium);
  const indices = [100, 200, 300, 400, 500, 600, 700, 800, 900, 999];

  bench('Native (direct mutate)', () => {
    for (const idx of indices) {
      nativeMedium[idx] = 999;
    }
    return nativeMedium;
  });

  bench('Native (copy then mutate)', () => {
    const copy = nativeMedium.slice();
    for (const idx of indices) {
      copy[idx] = 999;
    }
    return copy;
  });

  bench('Pura (produce)', () => {
    return produce(puraMedium, draft => {
      for (const idx of indices) {
        draft[idx] = 999;
      }
    });
  });
});

// ===== Large arrays (10000 items) =====
describe('Large array (10000 items) - Single update', () => {
  const nativeLarge = Array.from({ length: LARGE }, (_, i) => i);
  const puraLarge = pura(nativeLarge);

  bench('Native (direct mutate)', () => {
    nativeLarge[5000] = 999;
    return nativeLarge;
  });

  bench('Native (copy then mutate)', () => {
    const copy = nativeLarge.slice();
    copy[5000] = 999;
    return copy;
  });

  bench('Pura (produce)', () => {
    return produce(puraLarge, draft => {
      draft[5000] = 999;
    });
  });
});

describe('Large array (10000 items) - Push 10 items', () => {
  const nativeLarge = Array.from({ length: LARGE }, (_, i) => i);
  const puraLarge = pura(nativeLarge);

  bench('Native (direct mutate)', () => {
    for (let i = 0; i < 10; i++) {
      nativeLarge.push(i);
    }
    for (let i = 0; i < 10; i++) {
      nativeLarge.pop(); // Reset
    }
    return nativeLarge;
  });

  bench('Native (copy then mutate)', () => {
    const copy = nativeLarge.slice();
    for (let i = 0; i < 10; i++) {
      copy.push(i);
    }
    return copy;
  });

  bench('Pura (produce)', () => {
    return produce(puraLarge, draft => {
      for (let i = 0; i < 10; i++) {
        draft.push(i);
      }
    });
  });
});

describe('Large array (10000 items) - Multiple updates (100 indices)', () => {
  const nativeLarge = Array.from({ length: LARGE }, (_, i) => i);
  const puraLarge = pura(nativeLarge);
  const indices = Array.from({ length: 100 }, () => Math.floor(Math.random() * LARGE));

  bench('Native (direct mutate)', () => {
    for (const idx of indices) {
      nativeLarge[idx] = 999;
    }
    return nativeLarge;
  });

  bench('Native (copy then mutate)', () => {
    const copy = nativeLarge.slice();
    for (const idx of indices) {
      copy[idx] = 999;
    }
    return copy;
  });

  bench('Pura (produce)', () => {
    return produce(puraLarge, draft => {
      for (const idx of indices) {
        draft[idx] = 999;
      }
    });
  });
});

// ===== Read operations =====
describe('Large array (10000 items) - Read all items', () => {
  const nativeLarge = Array.from({ length: LARGE }, (_, i) => i);
  const puraLarge = pura(nativeLarge);

  bench('Native', () => {
    let sum = 0;
    for (let i = 0; i < nativeLarge.length; i++) {
      sum += nativeLarge[i]!;
    }
    return sum;
  });

  bench('Pura', () => {
    let sum = 0;
    for (let i = 0; i < puraLarge.length; i++) {
      sum += puraLarge[i]!;
    }
    return sum;
  });
});

describe('Large array (10000 items) - Array methods (map)', () => {
  const nativeLarge = Array.from({ length: LARGE }, (_, i) => i);
  const puraLarge = pura(nativeLarge);

  bench('Native', () => {
    return nativeLarge.map(x => x * 2);
  });

  bench('Pura', () => {
    return puraLarge.map(x => x * 2);
  });
});

// ===== Direct mutation (mutable mode) =====
describe('Large array (10000 items) - Direct mutation', () => {
  bench('Native (direct push)', () => {
    const arr = Array.from({ length: LARGE }, (_, i) => i);
    arr.push(10000);
    return arr;
  });

  bench('Pura (direct push)', () => {
    const arr = pura(Array.from({ length: LARGE }, (_, i) => i));
    arr.push(10000);
    return arr;
  });
});
