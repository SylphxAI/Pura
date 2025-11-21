/**
 * Benchmark: Pura Map vs Native Map
 *
 * Compares three approaches:
 * 1. Native Map (direct mutation)
 * 2. Native Map with copy (immutable via new Map())
 * 3. Pura Map (structural sharing)
 */

import { bench, describe } from 'vitest';
import { pura, produce } from '../packages/core/src/index';

// ===== Setup =====
const SMALL = 10;
const MEDIUM = 100;
const LARGE = 1000;

function createMap(size: number): Map<string, number> {
  const map = new Map<string, number>();
  for (let i = 0; i < size; i++) {
    map.set(`key${i}`, i);
  }
  return map;
}

// ===== Small maps (10 entries) =====
describe('Small map (10 entries) - Single set', () => {
  const nativeSmall = createMap(SMALL);
  const puraSmall = pura(createMap(SMALL));

  bench('Native (direct mutate)', () => {
    nativeSmall.set('key5', 999);
    return nativeSmall;
  });

  bench('Pura (direct mutate)', () => {
    puraSmall.set('key5', 999);
    return puraSmall;
  });

  bench('Native (copy then set)', () => {
    const copy = new Map(nativeSmall);
    copy.set('key5', 999);
    return copy;
  });

  bench('Pura (produce)', () => {
    return produce(puraSmall, draft => {
      draft.set('key5', 999);
    });
  });
});

describe('Small map (10 entries) - Add entry', () => {
  const nativeSmall = createMap(SMALL);
  const puraSmall = pura(createMap(SMALL));

  bench('Native (direct mutate)', () => {
    nativeSmall.set('newKey', 999);
    nativeSmall.delete('newKey');
    return nativeSmall;
  });

  bench('Native (copy then add)', () => {
    const copy = new Map(nativeSmall);
    copy.set('newKey', 999);
    return copy;
  });

  bench('Pura (produce)', () => {
    return produce(puraSmall, draft => {
      draft.set('newKey', 999);
    });
  });
});

// ===== Medium maps (100 entries) =====
describe('Medium map (100 entries) - Single set', () => {
  const nativeMedium = createMap(MEDIUM);
  const puraMedium = pura(createMap(MEDIUM));

  bench('Native (direct mutate)', () => {
    nativeMedium.set('key50', 999);
    return nativeMedium;
  });

  bench('Native (copy then set)', () => {
    const copy = new Map(nativeMedium);
    copy.set('key50', 999);
    return copy;
  });

  bench('Pura (produce)', () => {
    return produce(puraMedium, draft => {
      draft.set('key50', 999);
    });
  });
});

describe('Medium map (100 entries) - Multiple sets (10 keys)', () => {
  const nativeMedium = createMap(MEDIUM);
  const puraMedium = pura(createMap(MEDIUM));
  const keys = ['key10', 'key20', 'key30', 'key40', 'key50', 'key60', 'key70', 'key80', 'key90', 'key99'];

  bench('Native (direct mutate)', () => {
    for (const key of keys) {
      nativeMedium.set(key, 999);
    }
    return nativeMedium;
  });

  bench('Native (copy once, then set)', () => {
    const copy = new Map(nativeMedium);
    for (const key of keys) {
      copy.set(key, 999);
    }
    return copy;
  });

  bench('Pura (produce)', () => {
    return produce(puraMedium, draft => {
      for (const key of keys) {
        draft.set(key, 999);
      }
    });
  });
});

// ===== Large maps (1000 entries) =====
describe('Large map (1000 entries) - Single set', () => {
  const nativeLarge = createMap(LARGE);
  const puraLarge = pura(createMap(LARGE));

  bench('Native (direct mutate)', () => {
    nativeLarge.set('key500', 999);
    return nativeLarge;
  });

  bench('Native (copy then set)', () => {
    const copy = new Map(nativeLarge);
    copy.set('key500', 999);
    return copy;
  });

  bench('Pura (produce)', () => {
    return produce(puraLarge, draft => {
      draft.set('key500', 999);
    });
  });
});

describe('Large map (1000 entries) - Multiple sets (100 keys)', () => {
  const nativeLarge = createMap(LARGE);
  const puraLarge = pura(createMap(LARGE));
  const keys = Array.from({ length: 100 }, (_, i) => `key${i * 10}`);

  bench('Native (direct mutate)', () => {
    for (const key of keys) {
      nativeLarge.set(key, 999);
    }
    return nativeLarge;
  });

  bench('Native (copy once, then set)', () => {
    const copy = new Map(nativeLarge);
    for (const key of keys) {
      copy.set(key, 999);
    }
    return copy;
  });

  bench('Pura (produce)', () => {
    return produce(puraLarge, draft => {
      for (const key of keys) {
        draft.set(key, 999);
      }
    });
  });
});

// ===== Delete operations =====
describe('Large map (1000 entries) - Delete single', () => {
  const nativeLarge = createMap(LARGE);
  const puraLarge = pura(createMap(LARGE));

  bench('Native (direct delete)', () => {
    nativeLarge.delete('key500');
    nativeLarge.set('key500', 500); // Restore
    return nativeLarge;
  });

  bench('Native (copy then delete)', () => {
    const copy = new Map(nativeLarge);
    copy.delete('key500');
    return copy;
  });

  bench('Pura (produce)', () => {
    return produce(puraLarge, draft => {
      draft.delete('key500');
    });
  });
});

// ===== Read operations =====
describe('Large map (1000 entries) - Read single key', () => {
  const nativeLarge = createMap(LARGE);
  const puraLarge = pura(createMap(LARGE));

  bench('Native (get)', () => {
    return nativeLarge.get('key500');
  });

  bench('Pura (get)', () => {
    return puraLarge.get('key500');
  });
});

describe('Large map (1000 entries) - Check has', () => {
  const nativeLarge = createMap(LARGE);
  const puraLarge = pura(createMap(LARGE));

  bench('Native (has)', () => {
    return nativeLarge.has('key500');
  });

  bench('Pura (has)', () => {
    return puraLarge.has('key500');
  });
});

describe('Large map (1000 entries) - Read all entries', () => {
  const nativeLarge = createMap(LARGE);
  const puraLarge = pura(createMap(LARGE));

  bench('Native (forEach)', () => {
    let sum = 0;
    nativeLarge.forEach(v => { sum += v; });
    return sum;
  });

  bench('Pura (forEach)', () => {
    let sum = 0;
    puraLarge.forEach(v => { sum += v; });
    return sum;
  });

  bench('Native (for...of)', () => {
    let sum = 0;
    for (const [, v] of nativeLarge) {
      sum += v;
    }
    return sum;
  });

  bench('Pura (for...of)', () => {
    let sum = 0;
    for (const [, v] of puraLarge) {
      sum += v;
    }
    return sum;
  });
});

// ===== Iteration =====
describe('Large map (1000 entries) - Iteration methods', () => {
  const nativeLarge = createMap(LARGE);
  const puraLarge = pura(createMap(LARGE));

  bench('Native (keys)', () => {
    return [...nativeLarge.keys()].length;
  });

  bench('Pura (keys)', () => {
    return [...puraLarge.keys()].length;
  });

  bench('Native (values)', () => {
    return [...nativeLarge.values()].length;
  });

  bench('Pura (values)', () => {
    return [...puraLarge.values()].length;
  });

  bench('Native (entries)', () => {
    return [...nativeLarge.entries()].length;
  });

  bench('Pura (entries)', () => {
    return [...puraLarge.entries()].length;
  });
});

// ===== Object keys =====
describe('Medium map - Object keys', () => {
  const key1 = { id: 1 };
  const key2 = { id: 2 };
  const key3 = { id: 3 };

  const nativeMap = new Map([[key1, 1], [key2, 2], [key3, 3]]);
  const puraMap = pura(new Map([[key1, 1], [key2, 2], [key3, 3]]));

  bench('Native (get with object key)', () => {
    return nativeMap.get(key2);
  });

  bench('Pura (get with object key)', () => {
    return puraMap.get(key2);
  });

  bench('Native (direct mutate)', () => {
    nativeMap.set(key2, 999);
    return nativeMap;
  });

  bench('Pura (direct mutate)', () => {
    puraMap.set(key2, 999);
    return puraMap;
  });

  bench('Native (copy then set)', () => {
    const copy = new Map(nativeMap);
    copy.set(key2, 999);
    return copy;
  });

  bench('Pura (produce)', () => {
    return produce(puraMap, draft => {
      draft.set(key2, 999);
    });
  });
});

// ===== Creation =====
describe('Map creation (1000 entries)', () => {
  const entries: [string, number][] = Array.from({ length: LARGE }, (_, i) => [`key${i}`, i]);

  bench('Native (from entries)', () => {
    return new Map(entries);
  });

  bench('Native (from existing)', () => {
    const source = new Map(entries);
    return new Map(source);
  });

  bench('Pura (from Map)', () => {
    return pura(new Map(entries));
  });
});

// ===== Nested maps =====
describe('Nested map - Update inner value', () => {
  const nativeNested = new Map([
    ['outer', new Map([['inner', 0]])]
  ]);
  const puraNested = pura(new Map([
    ['outer', new Map([['inner', 0]])]
  ]));

  bench('Native (direct mutate)', () => {
    nativeNested.get('outer')!.set('inner', 999);
    return nativeNested;
  });

  bench('Native (copy chain)', () => {
    const innerCopy = new Map(nativeNested.get('outer')!);
    innerCopy.set('inner', 999);
    const outerCopy = new Map(nativeNested);
    outerCopy.set('outer', innerCopy);
    return outerCopy;
  });

  bench('Pura (produce)', () => {
    return produce(puraNested, draft => {
      draft.get('outer')!.set('inner', 999);
    });
  });
});

// ===== Clear operation =====
describe('Large map (1000 entries) - Clear', () => {
  bench('Native (direct clear)', () => {
    const map = createMap(LARGE);
    map.clear();
    return map;
  });

  bench('Native (new empty)', () => {
    return new Map<string, number>();
  });

  bench('Pura (produce clear)', () => {
    const map = pura(createMap(LARGE));
    return produce(map, draft => {
      draft.clear();
    });
  });
});
