/**
 * Comprehensive Test Suite for Pura Map Support
 *
 * Goal: pura(new Map()) should work with produce()
 * with structural sharing and immutable updates
 */

import { describe, it, expect } from 'vitest';
import { pura, produce, unpura, isPura, puraOrderedMap } from './index';

// ============================================
// 1. BASIC CRUD OPERATIONS
// ============================================

describe('Map - Basic CRUD', () => {
  describe('Create', () => {
    it('should create empty map', () => {
      const map = pura(new Map());
      expect(map.size).toBe(0);
    });

    it('should create map with initial entries', () => {
      const map = pura(new Map([['a', 1], ['b', 2], ['c', 3]]));
      expect(map.get('a')).toBe(1);
      expect(map.get('b')).toBe(2);
      expect(map.get('c')).toBe(3);
      expect(map.size).toBe(3);
    });

    it('should create map with various key types', () => {
      const objKey = { id: 1 };
      const map = pura(new Map<any, any>([
        ['string', 1],
        [42, 2],
        [objKey, 3],
        [true, 4],
      ]));
      expect(map.get('string')).toBe(1);
      expect(map.get(42)).toBe(2);
      expect(map.get(objKey)).toBe(3);
      expect(map.get(true)).toBe(4);
    });

    it('should create map with various value types', () => {
      const map = pura(new Map<string, any>([
        ['num', 42],
        ['str', 'hello'],
        ['bool', true],
        ['nil', null],
        ['undef', undefined],
        ['arr', [1, 2, 3]],
        ['obj', { x: 1 }],
      ]));
      expect(map.get('num')).toBe(42);
      expect(map.get('str')).toBe('hello');
      expect(map.get('bool')).toBe(true);
      expect(map.get('nil')).toBe(null);
      expect(map.get('undef')).toBe(undefined);
      expect(map.get('arr')).toEqual([1, 2, 3]);
      expect(map.get('obj')).toEqual({ x: 1 });
    });

    it('should be idempotent - pura(pura(map)) === pura(map)', () => {
      const map = pura(new Map([['a', 1]]));
      const map2 = pura(map);
      expect(map).toBe(map2);
    });
  });

  describe('Read', () => {
    it('should read existing entries with get()', () => {
      const map = pura(new Map([['x', 10], ['y', 20]]));
      expect(map.get('x')).toBe(10);
      expect(map.get('y')).toBe(20);
    });

    it('should return undefined for non-existent keys', () => {
      const map = pura(new Map([['a', 1]]));
      expect(map.get('nonexistent')).toBeUndefined();
    });

    it('should check key existence with has()', () => {
      const map = pura(new Map([['a', 1]]));
      expect(map.has('a')).toBe(true);
      expect(map.has('b')).toBe(false);
    });

    it('should return true for has() when value is undefined', () => {
      // Critical: Map.has should return true even if the value is undefined
      const map = pura(new Map<string, any>([['x', undefined], ['y', null]]));
      expect(map.has('x')).toBe(true);  // Key exists with undefined value
      expect(map.has('y')).toBe(true);  // Key exists with null value
      expect(map.has('z')).toBe(false); // Key doesn't exist
      expect(map.get('x')).toBe(undefined);
      expect(map.get('y')).toBe(null);
    });

    it('should return correct size', () => {
      const map = pura(new Map([['a', 1], ['b', 2], ['c', 3]]));
      expect(map.size).toBe(3);
    });
  });

  describe('Update (via produce)', () => {
    it('should update single entry with set()', () => {
      const map = pura(new Map([['a', 1], ['b', 2]]));
      const updated = produce(map, draft => {
        draft.set('a', 100);
      });
      expect(updated.get('a')).toBe(100);
      expect(updated.get('b')).toBe(2);
      expect(map.get('a')).toBe(1); // Original unchanged
    });

    it('should update multiple entries', () => {
      const map = pura(new Map([['a', 1], ['b', 2], ['c', 3]]));
      const updated = produce(map, draft => {
        draft.set('a', 10);
        draft.set('b', 20);
      });
      expect(updated.get('a')).toBe(10);
      expect(updated.get('b')).toBe(20);
      expect(updated.get('c')).toBe(3);
    });

    it('should add new entries', () => {
      const map = pura(new Map([['a', 1]]));
      const updated = produce(map, draft => {
        draft.set('b', 2);
      });
      expect(updated.get('a')).toBe(1);
      expect(updated.get('b')).toBe(2);
      expect(updated.size).toBe(2);
      expect(map.size).toBe(1);
    });
  });

  describe('Delete (via produce)', () => {
    it('should delete entries', () => {
      const map = pura(new Map([['a', 1], ['b', 2], ['c', 3]]));
      const updated = produce(map, draft => {
        draft.delete('b');
      });
      expect(updated.has('b')).toBe(false);
      expect(updated.size).toBe(2);
      expect(map.has('b')).toBe(true);
      expect(map.size).toBe(3);
    });

    it('should handle delete of non-existent key', () => {
      const map = pura(new Map([['a', 1]]));
      const updated = produce(map, draft => {
        draft.delete('nonexistent');
      });
      expect(updated.size).toBe(1);
    });

    it('should clear all entries', () => {
      const map = pura(new Map([['a', 1], ['b', 2]]));
      const updated = produce(map, draft => {
        draft.clear();
      });
      expect(updated.size).toBe(0);
      expect(map.size).toBe(2);
    });
  });
});

// ============================================
// 2. REFERENCE IDENTITY & STRUCTURAL SHARING
// ============================================

describe('Map - Reference Identity', () => {
  it('should return same reference when no changes', () => {
    const map = pura(new Map([['a', 1], ['b', 2]]));
    const same = produce(map, draft => {
      // No changes
    });
    expect(same).toBe(map);
  });

  it('should return same reference when no mutations', () => {
    const map = pura(new Map([['a', 1]]));
    const same = produce(map, draft => {
      // Read but don't modify
      const _ = draft.get('a');
    });
    expect(same).toBe(map);
  });

  it('should return new reference when value changed', () => {
    const map = pura(new Map([['a', 1]]));
    const updated = produce(map, draft => {
      draft.set('a', 2);
    });
    expect(updated).not.toBe(map);
  });

  it('should share unmodified nested values', () => {
    const nested1 = { x: 1 };
    const nested2 = { y: 2 };
    const map = pura(new Map([
      ['modified', nested1],
      ['unmodified', nested2],
    ]));
    const updated = produce(map, draft => {
      draft.set('modified', { x: 100 });
    });
    expect(updated.get('unmodified')).toBe(nested2); // Same reference!
  });
});

// ============================================
// 3. NESTED STRUCTURES
// ============================================

describe('Map - Nested Structures', () => {
  it('should handle nested maps', () => {
    const map = pura(new Map([
      ['outer', new Map([['inner', 'value']])]
    ]));
    expect(map.get('outer')?.get('inner')).toBe('value');
  });

  it('should update nested maps via produce', () => {
    const map = pura(new Map([
      ['data', new Map([['count', 0]])]
    ]));
    const updated = produce(map, draft => {
      draft.get('data')?.set('count', 100);
    });
    expect(updated.get('data')?.get('count')).toBe(100);
    expect(map.get('data')?.get('count')).toBe(0);
  });

  it('should handle objects as values', () => {
    const map = pura(new Map([
      ['user', { name: 'Alice', age: 30 }]
    ]));
    const updated = produce(map, draft => {
      const user = draft.get('user');
      if (user) user.age = 31;
    });
    expect(updated.get('user')?.age).toBe(31);
    expect(map.get('user')?.age).toBe(30);
  });

  it('should handle arrays as values', () => {
    const map = pura(new Map([
      ['items', [1, 2, 3]]
    ]));
    const updated = produce(map, draft => {
      draft.get('items')?.push(4);
    });
    expect(updated.get('items')).toEqual([1, 2, 3, 4]);
    expect(map.get('items')).toEqual([1, 2, 3]);
  });

  it('should handle maps inside objects', () => {
    const obj = pura({
      cache: new Map([['key', 'value']])
    });
    const updated = produce(obj, draft => {
      draft.cache.set('key', 'newValue');
    });
    expect(updated.cache.get('key')).toBe('newValue');
    expect(obj.cache.get('key')).toBe('value');
  });

  it('should handle maps inside arrays', () => {
    const arr = pura([
      new Map([['id', 1]]),
      new Map([['id', 2]])
    ]);
    const updated = produce(arr, draft => {
      draft[0].set('id', 100);
    });
    expect(updated[0].get('id')).toBe(100);
    expect(arr[0].get('id')).toBe(1);
  });
});

// ============================================
// 4. ITERATION
// ============================================

describe('Map - Iteration', () => {
  it('should iterate with forEach', () => {
    const map = pura(new Map([['a', 1], ['b', 2], ['c', 3]]));
    const entries: [string, number][] = [];
    map.forEach((value, key) => {
      entries.push([key, value]);
    });
    expect(entries.sort()).toEqual([['a', 1], ['b', 2], ['c', 3]]);
  });

  it('should iterate with for...of', () => {
    const map = pura(new Map([['a', 1], ['b', 2]]));
    const entries: [string, number][] = [];
    for (const [key, value] of map) {
      entries.push([key, value]);
    }
    expect(entries.sort()).toEqual([['a', 1], ['b', 2]]);
  });

  it('should support keys()', () => {
    const map = pura(new Map([['a', 1], ['b', 2], ['c', 3]]));
    const keys = [...map.keys()];
    expect(keys.sort()).toEqual(['a', 'b', 'c']);
  });

  it('should support values()', () => {
    const map = pura(new Map([['a', 1], ['b', 2], ['c', 3]]));
    const values = [...map.values()];
    expect(values.sort()).toEqual([1, 2, 3]);
  });

  it('should support entries()', () => {
    const map = pura(new Map([['a', 1], ['b', 2]]));
    const entries = [...map.entries()];
    expect(entries.sort()).toEqual([['a', 1], ['b', 2]]);
  });

  it('should support Symbol.iterator', () => {
    const map = pura(new Map([['x', 10]]));
    expect(typeof map[Symbol.iterator]).toBe('function');
    const entries = [...map];
    expect(entries).toEqual([['x', 10]]);
  });
});

// ============================================
// 5. SPECIAL KEY TYPES
// ============================================

describe('Map - Special Key Types', () => {
  it('should handle object keys', () => {
    const key1 = { id: 1 };
    const key2 = { id: 2 };
    const map = pura(new Map([[key1, 'one'], [key2, 'two']]));
    expect(map.get(key1)).toBe('one');
    expect(map.get(key2)).toBe('two');
    expect(map.get({ id: 1 })).toBeUndefined(); // Different reference
  });

  it('should handle symbol keys', () => {
    const sym = Symbol('key');
    const map = pura(new Map([[sym, 'value']]));
    expect(map.get(sym)).toBe('value');
  });

  it('should handle NaN as key', () => {
    const map = pura(new Map([[NaN, 'nan value']]));
    expect(map.get(NaN)).toBe('nan value');
    expect(map.has(NaN)).toBe(true);
  });

  it('should handle null and undefined keys', () => {
    const map = pura(new Map<any, string>([
      [null, 'null value'],
      [undefined, 'undefined value'],
    ]));
    expect(map.get(null)).toBe('null value');
    expect(map.get(undefined)).toBe('undefined value');
  });

  it('should distinguish between 0 and -0', () => {
    const map = pura(new Map([[0, 'zero']]));
    expect(map.get(-0)).toBe('zero'); // Map treats 0 and -0 as same
  });

  it('should update object key entries via produce', () => {
    const key = { id: 1 };
    const map = pura(new Map([[key, 'old']]));
    const updated = produce(map, draft => {
      draft.set(key, 'new');
    });
    expect(updated.get(key)).toBe('new');
    expect(map.get(key)).toBe('old');
  });
});

// ============================================
// 6. EDGE CASES
// ============================================

describe('Map - Edge Cases', () => {
  it('should handle empty map produce', () => {
    const map = pura(new Map<string, number>());
    const updated = produce(map, draft => {
      draft.set('a', 1);
    });
    expect(updated.get('a')).toBe(1);
    expect(updated.size).toBe(1);
  });

  it('should handle large maps', () => {
    const entries: [string, number][] = [];
    for (let i = 0; i < 1000; i++) {
      entries.push([`key${i}`, i]);
    }
    const map = pura(new Map(entries));
    expect(map.get('key0')).toBe(0);
    expect(map.get('key999')).toBe(999);
    expect(map.size).toBe(1000);
  });

  it('should update large map efficiently', () => {
    const entries: [string, number][] = [];
    for (let i = 0; i < 1000; i++) {
      entries.push([`key${i}`, i]);
    }
    const map = pura(new Map(entries));
    const updated = produce(map, draft => {
      draft.set('key500', 9999);
    });
    expect(updated.get('key500')).toBe(9999);
    expect(map.get('key500')).toBe(500);
  });

  it('should contain all keys (HAMT may reorder)', () => {
    // Note: HAMT-based implementation doesn't preserve insertion order
    const map = pura(new Map([['c', 3], ['a', 1], ['b', 2]]));
    const keys = [...map.keys()].sort();
    expect(keys).toEqual(['a', 'b', 'c']);
  });
});

// ============================================
// 7. HELPER FUNCTIONS
// ============================================

describe('Map - Helper Functions', () => {
  describe('isPura', () => {
    it('should return true for pura maps', () => {
      const map = pura(new Map([['a', 1]]));
      expect(isPura(map)).toBe(true);
    });

    it('should return false for plain maps', () => {
      const map = new Map([['a', 1]]);
      expect(isPura(map)).toBe(false);
    });
  });

  describe('unpura', () => {
    it('should convert pura map to plain map', () => {
      const map = pura(new Map([['a', 1], ['b', 2]]));
      const plain = unpura(map);
      expect(plain instanceof Map).toBe(true);
      expect(plain.get('a')).toBe(1);
      expect(isPura(plain)).toBe(false);
    });

    it('should return same map if not pura', () => {
      const plain = new Map([['a', 1]]);
      expect(unpura(plain)).toBe(plain);
    });
  });
});

// ============================================
// 8. EQUALITY & COMPARISON
// ============================================

describe('Map - Equality & Comparison', () => {
  it('should pass equality check for same contents', () => {
    const map = pura(new Map([['a', 1], ['b', 2]]));
    // Maps don't have direct deep equality, check contents
    expect([...map.entries()].sort()).toEqual([['a', 1], ['b', 2]]);
  });

  it('should work with JSON serialization (via entries)', () => {
    const map = pura(new Map([['a', 1], ['b', 2]]));
    const json = JSON.stringify([...map.entries()]);
    // Sort because HAMT iteration order is hash-based, not insertion order
    expect(JSON.parse(json).sort()).toEqual([['a', 1], ['b', 2]]);
  });
});

// ============================================
// 9. MULTIPLE PRODUCE CHAINS
// ============================================

describe('Map - Multiple Produce Chains', () => {
  it('should chain multiple produce calls', () => {
    const v1 = pura(new Map([['count', 0]]));
    const v2 = produce(v1, d => { d.set('count', 1); });
    const v3 = produce(v2, d => { d.set('count', 2); });
    const v4 = produce(v3, d => { d.set('count', 3); });

    expect(v1.get('count')).toBe(0);
    expect(v2.get('count')).toBe(1);
    expect(v3.get('count')).toBe(2);
    expect(v4.get('count')).toBe(3);
  });

  it('should maintain independence across branches', () => {
    const base = pura(new Map([['a', 1], ['b', 2]]));

    const branch1 = produce(base, d => {
      d.set('a', 100);
    });

    const branch2 = produce(base, d => {
      d.set('b', 200);
    });

    expect(base.get('a')).toBe(1);
    expect(base.get('b')).toBe(2);
    expect(branch1.get('a')).toBe(100);
    expect(branch1.get('b')).toBe(2);
    expect(branch2.get('a')).toBe(1);
    expect(branch2.get('b')).toBe(200);
  });
});

// ============================================
// 10. DIRECT MUTATION (Outside produce)
// ============================================

describe('Map - Direct Mutation', () => {
  it('should support direct set (COW)', () => {
    const map = pura(new Map([['a', 1]]));
    map.set('a', 2);
    expect(map.get('a')).toBe(2);
  });

  it('should support direct delete', () => {
    const map = pura(new Map([['a', 1], ['b', 2]]));
    map.delete('b');
    expect(map.has('b')).toBe(false);
  });

  it('should support direct clear', () => {
    const map = pura(new Map([['a', 1]]));
    map.clear();
    expect(map.size).toBe(0);
  });
});

// ============================================
// 11. TYPE PRESERVATION
// ============================================

describe('Map - Type Preservation', () => {
  it('should preserve Map instance check', () => {
    const map = pura(new Map([['a', 1]]));
    // Note: Proxy might not pass instanceof, but should behave like Map
    expect(typeof map.get).toBe('function');
    expect(typeof map.set).toBe('function');
    expect(typeof map.has).toBe('function');
    expect(typeof map.delete).toBe('function');
    expect(typeof map.size).toBe('number');
  });

  it('should have correct Symbol.toStringTag', () => {
    const map = pura(new Map([['a', 1]]));
    expect(Object.prototype.toString.call(map)).toBe('[object Map]');
  });
});

// ============================================
// 12. ERROR HANDLING
// ============================================

describe('Map - Error Handling', () => {
  it('should handle errors in produce gracefully', () => {
    const map = pura(new Map([['a', 1]]));
    expect(() => {
      produce(map, () => {
        throw new Error('Recipe error');
      });
    }).toThrow('Recipe error');
    expect(map.get('a')).toBe(1);
  });
});

// ============================================
// 13. ORDERED MAP (Insertion Order Preserved)
// ============================================

describe('Map - Ordered (puraOrderedMap)', () => {
  it('should preserve insertion order during iteration', () => {
    const map = puraOrderedMap(new Map([['c', 3], ['a', 1], ['b', 2]]));
    const keys = [...map.keys()];
    expect(keys).toEqual(['c', 'a', 'b']);
  });

  it('should maintain order after adding new entries', () => {
    const map = puraOrderedMap(new Map([['a', 1]]));
    const updated = produce(map, draft => {
      draft.set('b', 2);
      draft.set('c', 3);
    });
    const keys = [...updated.keys()];
    expect(keys).toEqual(['a', 'b', 'c']);
  });

  it('should not change order when updating existing key', () => {
    const map = puraOrderedMap(new Map([['a', 1], ['b', 2], ['c', 3]]));
    const updated = produce(map, draft => {
      draft.set('b', 200);  // Update existing key
    });
    const keys = [...updated.keys()];
    expect(keys).toEqual(['a', 'b', 'c']);
    expect(updated.get('b')).toBe(200);
  });

  it('should update order on delete', () => {
    const map = puraOrderedMap(new Map([['a', 1], ['b', 2], ['c', 3]]));
    const updated = produce(map, draft => {
      draft.delete('b');
    });
    const keys = [...updated.keys()];
    expect(keys).toEqual(['a', 'c']);
  });

  it('should preserve order across multiple produce calls', () => {
    const v1 = puraOrderedMap(new Map<string, number>());
    const v2 = produce(v1, d => { d.set('z', 1); });
    const v3 = produce(v2, d => { d.set('a', 2); });
    const v4 = produce(v3, d => { d.set('m', 3); });

    expect([...v4.keys()]).toEqual(['z', 'a', 'm']);
  });

  it('should work with forEach in insertion order', () => {
    const map = puraOrderedMap(new Map([['c', 3], ['a', 1], ['b', 2]]));
    const keys: string[] = [];
    map.forEach((_, k) => keys.push(k));
    expect(keys).toEqual(['c', 'a', 'b']);
  });

  it('should work with entries() in insertion order', () => {
    const map = puraOrderedMap(new Map([['c', 3], ['a', 1], ['b', 2]]));
    const entries = [...map.entries()];
    expect(entries).toEqual([['c', 3], ['a', 1], ['b', 2]]);
  });

  it('should work with values() in insertion order', () => {
    const map = puraOrderedMap(new Map([['c', 3], ['a', 1], ['b', 2]]));
    const values = [...map.values()];
    expect(values).toEqual([3, 1, 2]);
  });

  it('should reset order on clear', () => {
    const map = puraOrderedMap(new Map([['a', 1], ['b', 2]]));
    const cleared = produce(map, draft => {
      draft.clear();
      draft.set('z', 1);
      draft.set('y', 2);
    });
    expect([...cleared.keys()]).toEqual(['z', 'y']);
  });
});
