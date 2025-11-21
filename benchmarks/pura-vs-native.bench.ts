/**
 * Benchmark: Pura vs Native Array
 *
 * Two comparison scenarios:
 * 1. Immutable semantics: Native copy vs Pura produce
 * 2. Mutable semantics: Native direct vs Pura direct
 */

import { bench, describe } from 'vitest';
import { pura, produce } from '../packages/core/src/index';

const SMALL = 100;
const MEDIUM = 1000;
const LARGE = 10000;

// Pre-create arrays (simulating existing data)
const nativeSmall = Array.from({ length: SMALL }, (_, i) => i);
const nativeMedium = Array.from({ length: MEDIUM }, (_, i) => i);
const nativeLarge = Array.from({ length: LARGE }, (_, i) => i);

const puraSmall = pura(Array.from({ length: SMALL }, (_, i) => i));
const puraMedium = pura(Array.from({ length: MEDIUM }, (_, i) => i));
const puraLarge = pura(Array.from({ length: LARGE }, (_, i) => i));

// ============================================================
// IMMUTABLE SEMANTICS: Need to preserve original, return new
// Native: slice() + mutate  vs  Pura: produce()
// ============================================================

describe('[Immutable] Small (100) - Single update', () => {
  bench('Native (slice+mutate)', () => {
    const copy = nativeSmall.slice();
    copy[50] = 999;
    return copy;
  });

  bench('Pura (produce)', () => {
    return produce(puraSmall, d => { d[50] = 999; });
  });
});

describe('[Immutable] Small (100) - Push', () => {
  bench('Native (spread)', () => {
    return [...nativeSmall, 100];
  });

  bench('Pura (produce)', () => {
    return produce(puraSmall, d => { d.push(100); });
  });
});

describe('[Immutable] Medium (1000) - Single update', () => {
  bench('Native (slice+mutate)', () => {
    const copy = nativeMedium.slice();
    copy[500] = 999;
    return copy;
  });

  bench('Pura (produce)', () => {
    return produce(puraMedium, d => { d[500] = 999; });
  });
});

describe('[Immutable] Medium (1000) - Push 10', () => {
  bench('Native (slice+push)', () => {
    const copy = nativeMedium.slice();
    for (let i = 0; i < 10; i++) copy.push(i);
    return copy;
  });

  bench('Pura (produce)', () => {
    return produce(puraMedium, d => {
      for (let i = 0; i < 10; i++) d.push(i);
    });
  });
});

describe('[Immutable] Medium (1000) - 10 updates', () => {
  const indices = [100, 200, 300, 400, 500, 600, 700, 800, 900, 999];

  bench('Native (slice+mutate)', () => {
    const copy = nativeMedium.slice();
    for (const idx of indices) copy[idx] = 999;
    return copy;
  });

  bench('Pura (produce)', () => {
    return produce(puraMedium, d => {
      for (const idx of indices) d[idx] = 999;
    });
  });
});

describe('[Immutable] Large (10000) - Single update', () => {
  bench('Native (slice+mutate)', () => {
    const copy = nativeLarge.slice();
    copy[5000] = 999;
    return copy;
  });

  bench('Pura (produce)', () => {
    return produce(puraLarge, d => { d[5000] = 999; });
  });
});

describe('[Immutable] Large (10000) - Push 10', () => {
  bench('Native (slice+push)', () => {
    const copy = nativeLarge.slice();
    for (let i = 0; i < 10; i++) copy.push(i);
    return copy;
  });

  bench('Pura (produce)', () => {
    return produce(puraLarge, d => {
      for (let i = 0; i < 10; i++) d.push(i);
    });
  });
});

describe('[Immutable] Large (10000) - 100 updates', () => {
  const indices = Array.from({ length: 100 }, (_, i) => i * 100);

  bench('Native (slice+mutate)', () => {
    const copy = nativeLarge.slice();
    for (const idx of indices) copy[idx] = 999;
    return copy;
  });

  bench('Pura (produce)', () => {
    return produce(puraLarge, d => {
      for (const idx of indices) d[idx] = 999;
    });
  });
});

// ============================================================
// MUTABLE SEMANTICS: Direct mutation (no immutability needed)
// Note: Native arrays grow, so we reset between runs
// ============================================================

describe('[Mutable] Large (10000) - Index write', () => {
  bench('Native', () => {
    nativeLarge[5000] = 999;
    return nativeLarge;
  });

  bench('Pura', () => {
    puraLarge[5000] = 999;
    return puraLarge;
  });
});

// ============================================================
// READ OPERATIONS
// ============================================================

describe('[Read] Small (100) - Sequential read', () => {
  bench('Native', () => {
    let sum = 0;
    for (let i = 0; i < nativeSmall.length; i++) {
      sum += nativeSmall[i]!;
    }
    return sum;
  });

  bench('Pura', () => {
    let sum = 0;
    for (let i = 0; i < puraSmall.length; i++) {
      sum += puraSmall[i]!;
    }
    return sum;
  });
});

describe('[Read] Small (100) - for...of iteration', () => {
  bench('Native', () => {
    let sum = 0;
    for (const v of nativeSmall) sum += v;
    return sum;
  });

  bench('Pura', () => {
    let sum = 0;
    for (const v of puraSmall) sum += v;
    return sum;
  });
});

describe('[Read] Small (100) - map()', () => {
  bench('Native', () => {
    return nativeSmall.map(x => x * 2);
  });

  bench('Pura', () => {
    return puraSmall.map(x => x * 2);
  });
});

describe('[Read] Medium (1000) - Sequential read', () => {
  bench('Native', () => {
    let sum = 0;
    for (let i = 0; i < nativeMedium.length; i++) {
      sum += nativeMedium[i]!;
    }
    return sum;
  });

  bench('Pura', () => {
    let sum = 0;
    for (let i = 0; i < puraMedium.length; i++) {
      sum += puraMedium[i]!;
    }
    return sum;
  });
});

describe('[Read] Medium (1000) - for...of iteration', () => {
  bench('Native', () => {
    let sum = 0;
    for (const v of nativeMedium) sum += v;
    return sum;
  });

  bench('Pura', () => {
    let sum = 0;
    for (const v of puraMedium) sum += v;
    return sum;
  });
});

describe('[Read] Medium (1000) - map()', () => {
  bench('Native', () => {
    return nativeMedium.map(x => x * 2);
  });

  bench('Pura', () => {
    return puraMedium.map(x => x * 2);
  });
});

describe('[Read] Large (10000) - Sequential read', () => {
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

describe('[Read] Large (10000) - for...of iteration', () => {
  bench('Native', () => {
    let sum = 0;
    for (const v of nativeLarge) sum += v;
    return sum;
  });

  bench('Pura', () => {
    let sum = 0;
    for (const v of puraLarge) sum += v;
    return sum;
  });
});

describe('[Read] Large (10000) - map()', () => {
  bench('Native', () => {
    return nativeLarge.map(x => x * 2);
  });

  bench('Pura', () => {
    return puraLarge.map(x => x * 2);
  });
});

describe('[Read] Large (10000) - filter()', () => {
  bench('Native', () => {
    return nativeLarge.filter(x => x % 2 === 0);
  });

  bench('Pura', () => {
    return puraLarge.filter(x => x % 2 === 0);
  });
});

describe('[Read] Large (10000) - reduce()', () => {
  bench('Native', () => {
    return nativeLarge.reduce((a, b) => a + b, 0);
  });

  bench('Pura', () => {
    return puraLarge.reduce((a, b) => a + b, 0);
  });
});
