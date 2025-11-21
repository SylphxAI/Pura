/**
 * Benchmark: Pura Object vs Native Object
 *
 * Compares three approaches:
 * 1. Native object (direct mutation)
 * 2. Native object with spread copy (immutable)
 * 3. Pura object (structural sharing)
 */

import { bench, describe } from 'vitest';
import { pura, produce } from '../packages/core/src/index';

// ===== Setup =====
const SMALL = 10;    // 10 properties
const MEDIUM = 100;  // 100 properties
const LARGE = 1000;  // 1000 properties

function createObject(size: number): Record<string, number> {
  const obj: Record<string, number> = {};
  for (let i = 0; i < size; i++) {
    obj[`key${i}`] = i;
  }
  return obj;
}

// ===== Small objects (10 properties) =====
describe('Small object (10 props) - Single update', () => {
  const nativeSmall = createObject(SMALL);
  const puraSmall = pura(createObject(SMALL));

  bench('Native (direct mutate)', () => {
    nativeSmall.key5 = 999;
    return nativeSmall;
  });

  bench('Native (spread copy)', () => {
    return { ...nativeSmall, key5: 999 };
  });

  bench('Pura (produce)', () => {
    return produce(puraSmall, draft => {
      draft.key5 = 999;
    });
  });
});

describe('Small object (10 props) - Add property', () => {
  const nativeSmall = createObject(SMALL);
  const puraSmall = pura(createObject(SMALL));

  bench('Native (direct mutate)', () => {
    (nativeSmall as any).newKey = 999;
    delete (nativeSmall as any).newKey;
    return nativeSmall;
  });

  bench('Native (spread copy)', () => {
    return { ...nativeSmall, newKey: 999 };
  });

  bench('Pura (produce)', () => {
    return produce(puraSmall, draft => {
      (draft as any).newKey = 999;
    });
  });
});

// ===== Medium objects (100 properties) =====
describe('Medium object (100 props) - Single update', () => {
  const nativeMedium = createObject(MEDIUM);
  const puraMedium = pura(createObject(MEDIUM));

  bench('Native (direct mutate)', () => {
    nativeMedium.key50 = 999;
    return nativeMedium;
  });

  bench('Native (spread copy)', () => {
    return { ...nativeMedium, key50: 999 };
  });

  bench('Pura (produce)', () => {
    return produce(puraMedium, draft => {
      draft.key50 = 999;
    });
  });
});

describe('Medium object (100 props) - Multiple updates (10 keys)', () => {
  const nativeMedium = createObject(MEDIUM);
  const puraMedium = pura(createObject(MEDIUM));
  const keys = ['key10', 'key20', 'key30', 'key40', 'key50', 'key60', 'key70', 'key80', 'key90', 'key99'];

  bench('Native (direct mutate)', () => {
    for (const key of keys) {
      nativeMedium[key] = 999;
    }
    return nativeMedium;
  });

  bench('Native (spread copy)', () => {
    let obj = nativeMedium;
    for (const key of keys) {
      obj = { ...obj, [key]: 999 };
    }
    return obj;
  });

  bench('Native (single spread)', () => {
    return {
      ...nativeMedium,
      key10: 999, key20: 999, key30: 999, key40: 999, key50: 999,
      key60: 999, key70: 999, key80: 999, key90: 999, key99: 999,
    };
  });

  bench('Pura (produce)', () => {
    return produce(puraMedium, draft => {
      for (const key of keys) {
        draft[key] = 999;
      }
    });
  });
});

// ===== Large objects (1000 properties) =====
describe('Large object (1000 props) - Single update', () => {
  const nativeLarge = createObject(LARGE);
  const puraLarge = pura(createObject(LARGE));

  bench('Native (direct mutate)', () => {
    nativeLarge.key500 = 999;
    return nativeLarge;
  });

  bench('Native (spread copy)', () => {
    return { ...nativeLarge, key500: 999 };
  });

  bench('Pura (produce)', () => {
    return produce(puraLarge, draft => {
      draft.key500 = 999;
    });
  });
});

describe('Large object (1000 props) - Multiple updates (100 keys)', () => {
  const nativeLarge = createObject(LARGE);
  const puraLarge = pura(createObject(LARGE));
  const keys = Array.from({ length: 100 }, (_, i) => `key${i * 10}`);

  bench('Native (direct mutate)', () => {
    for (const key of keys) {
      nativeLarge[key] = 999;
    }
    return nativeLarge;
  });

  bench('Native (spread copy each)', () => {
    let obj = nativeLarge;
    for (const key of keys) {
      obj = { ...obj, [key]: 999 };
    }
    return obj;
  });

  bench('Native (Object.assign)', () => {
    const updates: Record<string, number> = {};
    for (const key of keys) {
      updates[key] = 999;
    }
    return Object.assign({}, nativeLarge, updates);
  });

  bench('Pura (produce)', () => {
    return produce(puraLarge, draft => {
      for (const key of keys) {
        draft[key] = 999;
      }
    });
  });
});

// ===== Nested objects =====
describe('Nested object - Deep update', () => {
  const nativeNested = {
    level1: {
      level2: {
        level3: {
          value: 0
        }
      }
    }
  };
  const puraNested = pura({
    level1: {
      level2: {
        level3: {
          value: 0
        }
      }
    }
  });

  bench('Native (direct mutate)', () => {
    nativeNested.level1.level2.level3.value = 999;
    return nativeNested;
  });

  bench('Native (spread chain)', () => {
    return {
      ...nativeNested,
      level1: {
        ...nativeNested.level1,
        level2: {
          ...nativeNested.level1.level2,
          level3: {
            ...nativeNested.level1.level2.level3,
            value: 999
          }
        }
      }
    };
  });

  bench('Pura (produce)', () => {
    return produce(puraNested, draft => {
      draft.level1.level2.level3.value = 999;
    });
  });
});

describe('Nested object - Wide shallow update', () => {
  const nativeWide = {
    a: { value: 1 },
    b: { value: 2 },
    c: { value: 3 },
    d: { value: 4 },
    e: { value: 5 },
  };
  const puraWide = pura({
    a: { value: 1 },
    b: { value: 2 },
    c: { value: 3 },
    d: { value: 4 },
    e: { value: 5 },
  });

  bench('Native (direct mutate)', () => {
    nativeWide.c.value = 999;
    return nativeWide;
  });

  bench('Native (spread)', () => {
    return {
      ...nativeWide,
      c: { ...nativeWide.c, value: 999 }
    };
  });

  bench('Pura (produce)', () => {
    return produce(puraWide, draft => {
      draft.c.value = 999;
    });
  });
});

// ===== Read operations =====
describe('Large object (1000 props) - Read single key', () => {
  const nativeLarge = createObject(LARGE);
  const puraLarge = pura(createObject(LARGE));

  bench('Native', () => {
    return nativeLarge.key500;
  });

  bench('Pura', () => {
    return puraLarge.key500;
  });
});

describe('Large object (1000 props) - Read all keys', () => {
  const nativeLarge = createObject(LARGE);
  const puraLarge = pura(createObject(LARGE));

  bench('Native (for...in)', () => {
    let sum = 0;
    for (const key in nativeLarge) {
      sum += nativeLarge[key]!;
    }
    return sum;
  });

  bench('Pura (for...in)', () => {
    let sum = 0;
    for (const key in puraLarge) {
      sum += puraLarge[key]!;
    }
    return sum;
  });

  bench('Native (Object.values)', () => {
    return Object.values(nativeLarge).reduce((a, b) => a + b, 0);
  });

  bench('Pura (Object.values)', () => {
    return Object.values(puraLarge).reduce((a, b) => a + b, 0);
  });
});

// ===== Object.keys/values/entries =====
describe('Large object (1000 props) - Object methods', () => {
  const nativeLarge = createObject(LARGE);
  const puraLarge = pura(createObject(LARGE));

  bench('Native (Object.keys)', () => {
    return Object.keys(nativeLarge).length;
  });

  bench('Pura (Object.keys)', () => {
    return Object.keys(puraLarge).length;
  });

  bench('Native (Object.entries)', () => {
    return Object.entries(nativeLarge).length;
  });

  bench('Pura (Object.entries)', () => {
    return Object.entries(puraLarge).length;
  });
});

// ===== Delete property =====
describe('Medium object (100 props) - Delete property', () => {
  bench('Native (direct delete)', () => {
    const obj = createObject(MEDIUM);
    delete obj.key50;
    return obj;
  });

  bench('Native (destructure)', () => {
    const obj = createObject(MEDIUM);
    const { key50, ...rest } = obj;
    return rest;
  });

  bench('Pura (produce)', () => {
    const obj = pura(createObject(MEDIUM));
    return produce(obj, draft => {
      delete (draft as any).key50;
    });
  });
});

// ===== Creation =====
describe('Object creation (1000 props)', () => {
  const source = createObject(LARGE);

  bench('Native (literal)', () => {
    return createObject(LARGE);
  });

  bench('Native (spread)', () => {
    return { ...source };
  });

  bench('Pura (from object)', () => {
    return pura(source);
  });
});
