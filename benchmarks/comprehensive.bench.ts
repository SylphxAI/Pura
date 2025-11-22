/**
 * Comprehensive Performance Benchmark
 *
 * Compares all mutation strategies across different data types and sizes:
 *
 * **Direct Mutation:**
 * - Native (baseline)
 * - Pura (persistent data structure)
 *
 * **Immutable Mutation:**
 * - Native Copy (slice/spread + mutate)
 * - Produce (proxy-based)
 * - ProduceFast (mutation-collection)
 *
 * **Data Types:**
 * - Array (small: 100, medium: 1K, large: 10K)
 * - Object (nested structures)
 * - Map (small: 100, medium: 1K)
 * - Set (small: 100, medium: 1K)
 *
 * **Operations:**
 * - Create (push, add, set)
 * - Read (iteration, access)
 * - Update (modify existing)
 * - Delete (remove elements)
 */

import { bench, describe } from 'vitest';
import { pura, produce, produceFast } from '../packages/core/src/index';

// ============================================================
// Test Data Sizes
// ============================================================

const SMALL = 100;
const MEDIUM = 1000;
const LARGE = 10000;

// ============================================================
// ARRAY BENCHMARKS
// ============================================================

describe('Array (Small: 100) - Single Update', () => {
  const nativeArr = Array.from({ length: SMALL }, (_, i) => i);
  const puraArr = pura(Array.from({ length: SMALL }, (_, i) => i));

  // Direct Mutation
  bench('[Direct] Native', () => {
    nativeArr[50] = 999;
  });

  bench('[Direct] Pura', () => {
    puraArr[50] = 999;
  });

  // Immutable Mutation
  bench('[Immutable] Native Copy', () => {
    const copy = nativeArr.slice();
    copy[50] = 999;
    return copy;
  });

  bench('[Immutable] Produce', () => {
    return produce(puraArr, d => { d[50] = 999; });
  });

  bench('[Immutable] ProduceFast', () => {
    return produceFast(puraArr, $ => {
      $.set(50, 999);
    });
  });
});

describe('Array (Small: 100) - Multiple Updates (10)', () => {
  const nativeArr = Array.from({ length: SMALL }, (_, i) => i);
  const puraArr = pura(Array.from({ length: SMALL }, (_, i) => i));
  const indices = [10, 20, 30, 40, 50, 60, 70, 80, 90, 99];

  bench('[Immutable] Native Copy', () => {
    const copy = nativeArr.slice();
    for (const idx of indices) copy[idx] = 999;
    return copy;
  });

  bench('[Immutable] Produce', () => {
    return produce(puraArr, d => {
      for (const idx of indices) d[idx] = 999;
    });
  });

  bench('[Immutable] ProduceFast', () => {
    return produceFast(puraArr, $ => {
      for (const idx of indices) $.set(idx, 999);
    });
  });
});

describe('Array (Small: 100) - Push', () => {
  const nativeArr = Array.from({ length: SMALL }, (_, i) => i);
  const puraArr = pura(Array.from({ length: SMALL }, (_, i) => i));

  bench('[Immutable] Native Spread', () => {
    return [...nativeArr, 100];
  });

  bench('[Immutable] Produce', () => {
    return produce(puraArr, d => { d.push(100); });
  });

  bench('[Immutable] ProduceFast', () => {
    return produceFast(puraArr, $ => {
      $.push(100);
    });
  });
});

describe('Array (Medium: 1K) - Single Update', () => {
  const nativeArr = Array.from({ length: MEDIUM }, (_, i) => i);
  const puraArr = pura(Array.from({ length: MEDIUM }, (_, i) => i));

  bench('[Direct] Native', () => {
    nativeArr[500] = 999;
  });

  bench('[Direct] Pura', () => {
    puraArr[500] = 999;
  });

  bench('[Immutable] Native Copy', () => {
    const copy = nativeArr.slice();
    copy[500] = 999;
    return copy;
  });

  bench('[Immutable] Produce', () => {
    return produce(puraArr, d => { d[500] = 999; });
  });

  bench('[Immutable] ProduceFast', () => {
    return produceFast(puraArr, $ => {
      $.set(500, 999);
    });
  });
});

describe('Array (Medium: 1K) - Multiple Updates (10)', () => {
  const nativeArr = Array.from({ length: MEDIUM }, (_, i) => i);
  const puraArr = pura(Array.from({ length: MEDIUM }, (_, i) => i));
  const indices = [100, 200, 300, 400, 500, 600, 700, 800, 900, 999];

  bench('[Immutable] Native Copy', () => {
    const copy = nativeArr.slice();
    for (const idx of indices) copy[idx] = 999;
    return copy;
  });

  bench('[Immutable] Produce', () => {
    return produce(puraArr, d => {
      for (const idx of indices) d[idx] = 999;
    });
  });

  bench('[Immutable] ProduceFast', () => {
    return produceFast(puraArr, $ => {
      for (const idx of indices) $.set(idx, 999);
    });
  });
});

describe('Array (Large: 10K) - Single Update', () => {
  const nativeArr = Array.from({ length: LARGE }, (_, i) => i);
  const puraArr = pura(Array.from({ length: LARGE }, (_, i) => i));

  bench('[Direct] Native', () => {
    nativeArr[5000] = 999;
  });

  bench('[Direct] Pura', () => {
    puraArr[5000] = 999;
  });

  bench('[Immutable] Native Copy', () => {
    const copy = nativeArr.slice();
    copy[5000] = 999;
    return copy;
  });

  bench('[Immutable] Produce', () => {
    return produce(puraArr, d => { d[5000] = 999; });
  });

  bench('[Immutable] ProduceFast', () => {
    return produceFast(puraArr, $ => {
      $.set(5000, 999);
    });
  });
});

describe('Array (Large: 10K) - Multiple Updates (100)', () => {
  const nativeArr = Array.from({ length: LARGE }, (_, i) => i);
  const puraArr = pura(Array.from({ length: LARGE }, (_, i) => i));
  const indices = Array.from({ length: 100 }, (_, i) => i * 100);

  bench('[Immutable] Native Copy', () => {
    const copy = nativeArr.slice();
    for (const idx of indices) copy[idx] = 999;
    return copy;
  });

  bench('[Immutable] Produce', () => {
    return produce(puraArr, d => {
      for (const idx of indices) d[idx] = 999;
    });
  });

  bench('[Immutable] ProduceFast', () => {
    return produceFast(puraArr, $ => {
      for (const idx of indices) $.set(idx, 999);
    });
  });
});

// ============================================================
// OBJECT BENCHMARKS
// ============================================================

type User = {
  id: number;
  name: string;
  email: string;
  age: number;
  profile: {
    bio: string;
    avatar: string;
    settings: {
      theme: string;
      notifications: boolean;
      privacy: string;
    };
  };
};

const createUser = (): User => ({
  id: 1,
  name: 'John Doe',
  email: 'john@example.com',
  age: 30,
  profile: {
    bio: 'Software developer',
    avatar: 'https://example.com/avatar.jpg',
    settings: {
      theme: 'light',
      notifications: true,
      privacy: 'public'
    }
  }
});

describe('Object - Single Shallow Update', () => {
  const user = createUser();

  bench('[Immutable] Native Spread', () => {
    return { ...user, name: 'Jane Doe' };
  });

  bench('[Immutable] Produce', () => {
    return produce(user, draft => {
      draft.name = 'Jane Doe';
    });
  });

  bench('[Immutable] ProduceFast', () => {
    return produceFast(user, $ => {
      $.set(['name'], 'Jane Doe');
    });
  });
});

describe('Object - Multiple Shallow Updates', () => {
  const user = createUser();

  bench('[Immutable] Native Spread', () => {
    return { ...user, name: 'Jane Doe', age: 25 };
  });

  bench('[Immutable] Produce', () => {
    return produce(user, draft => {
      draft.name = 'Jane Doe';
      draft.age = 25;
    });
  });

  bench('[Immutable] ProduceFast', () => {
    return produceFast(user, $ => {
      $.set(['name'], 'Jane Doe');
      $.set(['age'], 25);
    });
  });
});

describe('Object - Single Deep Update', () => {
  const user = createUser();

  bench('[Immutable] Native Nested Spread', () => {
    return {
      ...user,
      profile: {
        ...user.profile,
        bio: 'Updated bio'
      }
    };
  });

  bench('[Immutable] Produce', () => {
    return produce(user, draft => {
      draft.profile.bio = 'Updated bio';
    });
  });

  bench('[Immutable] ProduceFast', () => {
    return produceFast(user, $ => {
      $.set(['profile', 'bio'], 'Updated bio');
    });
  });
});

describe('Object - Multiple Deep Updates', () => {
  const user = createUser();

  bench('[Immutable] Native Nested Spread', () => {
    return {
      ...user,
      name: 'Jane Doe',
      age: 25,
      profile: {
        ...user.profile,
        bio: 'Updated bio',
        settings: {
          ...user.profile.settings,
          theme: 'dark'
        }
      }
    };
  });

  bench('[Immutable] Produce', () => {
    return produce(user, draft => {
      draft.name = 'Jane Doe';
      draft.age = 25;
      draft.profile.bio = 'Updated bio';
      draft.profile.settings.theme = 'dark';
    });
  });

  bench('[Immutable] ProduceFast', () => {
    return produceFast(user, $ => {
      $.set(['name'], 'Jane Doe');
      $.set(['age'], 25);
      $.set(['profile', 'bio'], 'Updated bio');
      $.set(['profile', 'settings', 'theme'], 'dark');
    });
  });
});

// ============================================================
// MAP BENCHMARKS
// ============================================================

describe('Map (Small: 100) - Single Set', () => {
  const entries: [string, number][] = Array.from({ length: SMALL }, (_, i) => [`key${i}`, i]);
  const nativeMap = new Map(entries);

  bench('[Immutable] Native Copy', () => {
    const copy = new Map(nativeMap);
    copy.set('key50', 999);
    return copy;
  });

  bench('[Immutable] Produce', () => {
    return produce(nativeMap, draft => {
      draft.set('key50', 999);
    });
  });

  bench('[Immutable] ProduceFast', () => {
    return produceFast(nativeMap, $ => {
      $.set('key50', 999);
    });
  });
});

describe('Map (Small: 100) - Multiple Sets (10)', () => {
  const entries: [string, number][] = Array.from({ length: SMALL }, (_, i) => [`key${i}`, i]);
  const nativeMap = new Map(entries);

  bench('[Immutable] Native Copy', () => {
    const copy = new Map(nativeMap);
    for (let i = 0; i < 10; i++) {
      copy.set(`newKey${i}`, i);
    }
    return copy;
  });

  bench('[Immutable] Produce', () => {
    return produce(nativeMap, draft => {
      for (let i = 0; i < 10; i++) {
        draft.set(`newKey${i}`, i);
      }
    });
  });

  bench('[Immutable] ProduceFast', () => {
    return produceFast(nativeMap, $ => {
      for (let i = 0; i < 10; i++) {
        $.set(`newKey${i}`, i);
      }
    });
  });
});

describe('Map (Medium: 1K) - Single Set', () => {
  const entries: [string, number][] = Array.from({ length: MEDIUM }, (_, i) => [`key${i}`, i]);
  const nativeMap = new Map(entries);

  bench('[Immutable] Native Copy', () => {
    const copy = new Map(nativeMap);
    copy.set('key500', 999);
    return copy;
  });

  bench('[Immutable] Produce', () => {
    return produce(nativeMap, draft => {
      draft.set('key500', 999);
    });
  });

  bench('[Immutable] ProduceFast', () => {
    return produceFast(nativeMap, $ => {
      $.set('key500', 999);
    });
  });
});

describe('Map (Medium: 1K) - Delete', () => {
  const entries: [string, number][] = Array.from({ length: MEDIUM }, (_, i) => [`key${i}`, i]);
  const nativeMap = new Map(entries);

  bench('[Immutable] Native Copy', () => {
    const copy = new Map(nativeMap);
    copy.delete('key500');
    return copy;
  });

  bench('[Immutable] Produce', () => {
    return produce(nativeMap, draft => {
      draft.delete('key500');
    });
  });

  bench('[Immutable] ProduceFast', () => {
    return produceFast(nativeMap, $ => {
      $.delete('key500');
    });
  });
});

// ============================================================
// SET BENCHMARKS
// ============================================================

describe('Set (Small: 100) - Single Add', () => {
  const nativeSet = new Set(Array.from({ length: SMALL }, (_, i) => i));

  bench('[Immutable] Native Copy', () => {
    const copy = new Set(nativeSet);
    copy.add(100);
    return copy;
  });

  bench('[Immutable] Produce', () => {
    return produce(nativeSet, draft => {
      draft.add(100);
    });
  });

  bench('[Immutable] ProduceFast', () => {
    return produceFast(nativeSet, $ => {
      $.add(100);
    });
  });
});

describe('Set (Small: 100) - Multiple Adds (10)', () => {
  const nativeSet = new Set(Array.from({ length: SMALL }, (_, i) => i));

  bench('[Immutable] Native Copy', () => {
    const copy = new Set(nativeSet);
    for (let i = 100; i < 110; i++) {
      copy.add(i);
    }
    return copy;
  });

  bench('[Immutable] Produce', () => {
    return produce(nativeSet, draft => {
      for (let i = 100; i < 110; i++) {
        draft.add(i);
      }
    });
  });

  bench('[Immutable] ProduceFast', () => {
    return produceFast(nativeSet, $ => {
      for (let i = 100; i < 110; i++) {
        $.add(i);
      }
    });
  });
});

describe('Set (Medium: 1K) - Single Add', () => {
  const nativeSet = new Set(Array.from({ length: MEDIUM }, (_, i) => i));

  bench('[Immutable] Native Copy', () => {
    const copy = new Set(nativeSet);
    copy.add(1000);
    return copy;
  });

  bench('[Immutable] Produce', () => {
    return produce(nativeSet, draft => {
      draft.add(1000);
    });
  });

  bench('[Immutable] ProduceFast', () => {
    return produceFast(nativeSet, $ => {
      $.add(1000);
    });
  });
});

describe('Set (Medium: 1K) - Delete', () => {
  const nativeSet = new Set(Array.from({ length: MEDIUM }, (_, i) => i));

  bench('[Immutable] Native Copy', () => {
    const copy = new Set(nativeSet);
    copy.delete(500);
    return copy;
  });

  bench('[Immutable] Produce', () => {
    return produce(nativeSet, draft => {
      draft.delete(500);
    });
  });

  bench('[Immutable] ProduceFast', () => {
    return produceFast(nativeSet, $ => {
      $.delete(500);
    });
  });
});

// ============================================================
// READ OPERATIONS
// ============================================================

describe('Array (Medium: 1K) - Sequential Read', () => {
  const nativeArr = Array.from({ length: MEDIUM }, (_, i) => i);
  const puraArr = pura(Array.from({ length: MEDIUM }, (_, i) => i));

  bench('[Read] Native', () => {
    let sum = 0;
    for (let i = 0; i < nativeArr.length; i++) {
      sum += nativeArr[i]!;
    }
    return sum;
  });

  bench('[Read] Pura', () => {
    let sum = 0;
    for (let i = 0; i < puraArr.length; i++) {
      sum += puraArr[i]!;
    }
    return sum;
  });
});

describe('Array (Medium: 1K) - Iterator', () => {
  const nativeArr = Array.from({ length: MEDIUM }, (_, i) => i);
  const puraArr = pura(Array.from({ length: MEDIUM }, (_, i) => i));

  bench('[Read] Native for...of', () => {
    let sum = 0;
    for (const v of nativeArr) sum += v;
    return sum;
  });

  bench('[Read] Pura for...of', () => {
    let sum = 0;
    for (const v of puraArr) sum += v;
    return sum;
  });
});

describe('Array (Large: 10K) - Map Operation', () => {
  const nativeArr = Array.from({ length: LARGE }, (_, i) => i);
  const puraArr = pura(Array.from({ length: LARGE }, (_, i) => i));

  bench('[Read] Native map()', () => {
    return nativeArr.map(x => x * 2);
  });

  bench('[Read] Pura map()', () => {
    return puraArr.map(x => x * 2);
  });
});

describe('Array (Large: 10K) - Filter Operation', () => {
  const nativeArr = Array.from({ length: LARGE }, (_, i) => i);
  const puraArr = pura(Array.from({ length: LARGE }, (_, i) => i));

  bench('[Read] Native filter()', () => {
    return nativeArr.filter(x => x % 2 === 0);
  });

  bench('[Read] Pura filter()', () => {
    return puraArr.filter(x => x % 2 === 0);
  });
});

describe('Array (Large: 10K) - Reduce Operation', () => {
  const nativeArr = Array.from({ length: LARGE }, (_, i) => i);
  const puraArr = pura(Array.from({ length: LARGE }, (_, i) => i));

  bench('[Read] Native reduce()', () => {
    return nativeArr.reduce((a, b) => a + b, 0);
  });

  bench('[Read] Pura reduce()', () => {
    return puraArr.reduce((a, b) => a + b, 0);
  });
});
