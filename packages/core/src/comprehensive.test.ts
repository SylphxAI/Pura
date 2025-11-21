/**
 * Comprehensive Tests for Pura
 *
 * Design Philosophy:
 * =================
 * Transform native array structure → tree structure to speed up FP scenarios
 * while maintaining full native array compatibility (mutable + immutable).
 *
 * Key Innovation:
 * - Tree structure (Vector Trie) provides O(log n) updates with structural sharing
 * - But can still be used like native array: arr.push(), arr[i] = x, etc.
 * - produce() creates new versions via copy-on-write
 * - Direct mutations modify in-place
 * - Same type signature: T[] (no mental overhead)
 *
 * Three APIs:
 * - pura(arr) → efficient array (idempotent)
 * - produce(arr, fn) → new efficient array with structural sharing
 * - unpura(arr) → native array (idempotent)
 */

import { describe, it, expect } from 'vitest';
import { pura, produce, unpura, isPura, repura } from './index';

// ===== Core Design: Dual-Mode Arrays =====
describe('Core Design: Dual-Mode (Mutable + Immutable)', () => {
  it('Mode 1: Direct mutation - modifies in-place', () => {
    const arr = pura([1, 2, 3]);

    arr.push(4);
    expect(arr).toEqual([1, 2, 3, 4]);

    arr[0] = 100;
    expect(arr).toEqual([100, 2, 3, 4]);

    arr.pop();
    expect(arr).toEqual([100, 2, 3]);
  });

  it('Mode 2: produce() - creates new array with structural sharing', () => {
    const arr1 = pura([1, 2, 3]);
    const arr2 = produce(arr1, draft => {
      draft.push(4);
    });

    expect(arr1).toEqual([1, 2, 3]); // Original unchanged
    expect(arr2).toEqual([1, 2, 3, 4]); // New array
    expect(arr1 === arr2).toBe(false); // Different references
  });

  it('Can mix both modes freely', () => {
    // Start with immutable update
    const arr1 = pura([1, 2, 3]);
    const arr2 = produce(arr1, draft => draft.push(4));

    // Direct mutation on arr2
    arr2.push(5);

    // Another immutable update
    const arr3 = produce(arr2, draft => draft.push(6));

    expect(arr1).toEqual([1, 2, 3]);
    expect(arr2).toEqual([1, 2, 3, 4, 5]);
    expect(arr3).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

// ===== Structural Sharing =====
describe('Structural Sharing (Key Innovation)', () => {
  it('produce() creates independent versions', () => {
    const arr1 = pura([1, 2, 3]);
    const arr2 = produce(arr1, draft => draft.push(4));
    const arr3 = produce(arr2, draft => draft.push(5));

    // Mutate arr2 directly
    arr2.push(100);

    // arr1 and arr3 should be unaffected
    expect(arr1).toEqual([1, 2, 3]);
    expect(arr2).toEqual([1, 2, 3, 4, 100]);
    expect(arr3).toEqual([1, 2, 3, 4, 5]);
  });

  it('Multiple branches from same base', () => {
    const base = pura([1, 2, 3]);

    const branch1 = produce(base, draft => draft.push(4));
    const branch2 = produce(base, draft => draft.push(5));
    const branch3 = produce(base, draft => draft.push(6));

    expect(base).toEqual([1, 2, 3]);
    expect(branch1).toEqual([1, 2, 3, 4]);
    expect(branch2).toEqual([1, 2, 3, 5]);
    expect(branch3).toEqual([1, 2, 3, 6]);
  });

  it('Deep branching tree', () => {
    const v1 = pura([1]);
    const v2 = produce(v1, d => d.push(2));
    const v3 = produce(v2, d => d.push(3));
    const v4a = produce(v3, d => d.push(4));
    const v4b = produce(v3, d => d.push(5));

    expect(v1).toEqual([1]);
    expect(v2).toEqual([1, 2]);
    expect(v3).toEqual([1, 2, 3]);
    expect(v4a).toEqual([1, 2, 3, 4]);
    expect(v4b).toEqual([1, 2, 3, 5]);
  });

  it('Mutations after branching stay isolated', () => {
    const base = pura([1, 2, 3]);
    const branch = produce(base, draft => draft.push(4));

    // Mutate base
    base.push(100);

    // Mutate branch
    branch.push(200);

    expect(base).toEqual([1, 2, 3, 100]);
    expect(branch).toEqual([1, 2, 3, 4, 200]);
  });
});

// ===== Three APIs Interoperability =====
describe('Three APIs: pura, produce, unpura', () => {
  describe('pura() - Convert to efficient', () => {
    it('Native → Efficient', () => {
      const native = [1, 2, 3];
      const efficient = pura(native);

      expect(efficient).toEqual([1, 2, 3]);
      efficient.push(4);
      expect(efficient).toEqual([1, 2, 3, 4]);
      expect(native).toEqual([1, 2, 3]); // Native unchanged
    });

    it('Idempotent: Efficient → Same reference', () => {
      const eff1 = pura([1, 2, 3]);
      const eff2 = pura(eff1);

      expect(eff1 === eff2).toBe(true);
    });

    it('Idempotent: Multiple calls return same', () => {
      const arr = pura([1, 2, 3]);
      expect(pura(arr) === arr).toBe(true);
      expect(pura(pura(arr)) === arr).toBe(true);
      expect(pura(pura(pura(arr))) === arr).toBe(true);
    });
  });

  describe('produce() - Immutable updates', () => {
    it('Works with native arrays', () => {
      const native = [1, 2, 3];
      const result = produce(native, draft => draft.push(4));

      expect(native).toEqual([1, 2, 3]); // Native unchanged
      expect(result).toEqual([1, 2, 3, 4]);
    });

    it('Works with efficient arrays', () => {
      const efficient = pura([1, 2, 3]);
      const result = produce(efficient, draft => draft.push(4));

      expect(efficient).toEqual([1, 2, 3]); // Original unchanged
      expect(result).toEqual([1, 2, 3, 4]);
    });

    it('No changes → returns same reference', () => {
      const arr = pura([1, 2, 3]);
      const result = produce(arr, () => {
        // No mutations
      });

      expect(result === arr).toBe(true);
    });

    it('produce() returns pura object that can be mutated', () => {
      // Array
      const arr1 = pura([1, 2, 3]);
      const arr2 = produce(arr1, d => d.push(4));
      expect(isPura(arr2)).toBe(true);
      arr2.push(5); // Can mutate the result
      expect(arr2).toEqual([1, 2, 3, 4, 5]);
      expect(arr1).toEqual([1, 2, 3]); // Original unchanged

      // Object
      const obj1 = pura({ a: 1 });
      const obj2 = produce(obj1, d => { d.b = 2; });
      expect(isPura(obj2)).toBe(true);
      obj2.c = 3; // Can mutate the result
      expect(obj2).toEqual({ a: 1, b: 2, c: 3 });
      expect(obj1).toEqual({ a: 1 }); // Original unchanged

      // Map
      const map1 = pura(new Map([['a', 1]]));
      const map2 = produce(map1, d => d.set('b', 2));
      expect(isPura(map2)).toBe(true);
      map2.set('c', 3); // Can mutate the result
      expect(map2.get('c')).toBe(3);
      expect(map1.has('c')).toBe(false); // Original unchanged

      // Set
      const set1 = pura(new Set([1]));
      const set2 = produce(set1, d => d.add(2));
      expect(isPura(set2)).toBe(true);
      set2.add(3); // Can mutate the result
      expect(set2.has(3)).toBe(true);
      expect(set1.has(3)).toBe(false); // Original unchanged
    });
  });

  describe('unpura() - Convert to native', () => {
    it('Efficient → Native', () => {
      const efficient = pura([1, 2, 3]);
      const native = unpura(efficient);

      expect(Array.isArray(native)).toBe(true);
      expect(native).toEqual([1, 2, 3]);
    });

    it('Idempotent: Native → Same reference', () => {
      const native = [1, 2, 3];
      const result = unpura(native);

      expect(result === native).toBe(true);
    });

    it('Idempotent: Multiple calls return same', () => {
      const arr = [1, 2, 3];
      expect(unpura(arr) === arr).toBe(true);
      expect(unpura(unpura(arr)) === arr).toBe(true);
      expect(unpura(unpura(unpura(arr))) === arr).toBe(true);
    });
  });

  describe('Round-trip conversions', () => {
    it('Native → Efficient → Native', () => {
      const original = [1, 2, 3];
      const efficient = pura(original);
      const back = unpura(efficient);

      expect(back).toEqual([1, 2, 3]);
      expect(Array.isArray(back)).toBe(true);
    });

    it('All APIs accept both types seamlessly', () => {
      const native = [1, 2, 3];
      const eff1 = pura(native);

      // produce() accepts both
      const r1 = produce(native, d => d.push(4));
      const r2 = produce(eff1, d => d.push(4));
      expect(r1).toEqual([1, 2, 3, 4]);
      expect(r2).toEqual([1, 2, 3, 4]);

      // pura() accepts both
      const p1 = pura(native);
      const p2 = pura(eff1);
      expect(p2 === eff1).toBe(true); // Idempotent

      // unpura() accepts both
      const u1 = unpura(native);
      const u2 = unpura(eff1);
      expect(u1 === native).toBe(true); // Idempotent
      expect(u2).toEqual([1, 2, 3]);
    });
  });
});

// ===== Mutation Operations =====
describe('Direct Mutations (Mutable Mode)', () => {
  describe('push()', () => {
    it('Single item', () => {
      const arr = pura([1, 2, 3]);
      const len = arr.push(4);
      expect(len).toBe(4);
      expect(arr).toEqual([1, 2, 3, 4]);
    });

    it('Multiple items', () => {
      const arr = pura([1, 2, 3]);
      arr.push(4, 5, 6);
      expect(arr).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it('Empty array', () => {
      const arr = pura([]);
      arr.push(1);
      expect(arr).toEqual([1]);
    });
  });

  describe('pop()', () => {
    it('Removes and returns last item', () => {
      const arr = pura([1, 2, 3]);
      const popped = arr.pop();
      expect(popped).toBe(3);
      expect(arr).toEqual([1, 2]);
    });

    it('Empty array returns undefined', () => {
      const arr = pura([]);
      expect(arr.pop()).toBeUndefined();
    });

    it('Single item', () => {
      const arr = pura([1]);
      expect(arr.pop()).toBe(1);
      expect(arr).toEqual([]);
    });
  });

  describe('Index assignment', () => {
    it('Update existing index', () => {
      const arr = pura([1, 2, 3]);
      arr[1] = 100;
      expect(arr).toEqual([1, 100, 3]);
    });

    it('Update multiple indices', () => {
      const arr = pura([1, 2, 3, 4, 5]);
      arr[0] = 10;
      arr[2] = 30;
      arr[4] = 50;
      expect(arr).toEqual([10, 2, 30, 4, 50]);
    });

    it('Update first element', () => {
      const arr = pura([1, 2, 3]);
      arr[0] = 100;
      expect(arr[0]).toBe(100);
    });

    it('Update last element', () => {
      const arr = pura([1, 2, 3]);
      arr[2] = 100;
      expect(arr[2]).toBe(100);
    });
  });

  describe('Batch mutations', () => {
    it('Multiple pushes', () => {
      const arr = pura([1]);
      arr.push(2);
      arr.push(3);
      arr.push(4);
      expect(arr).toEqual([1, 2, 3, 4]);
    });

    it('Multiple pops', () => {
      const arr = pura([1, 2, 3, 4]);
      arr.pop();
      arr.pop();
      expect(arr).toEqual([1, 2]);
    });

    it('Mix push, pop, index assignment', () => {
      const arr = pura([1, 2, 3]);
      arr.push(4);
      arr[0] = 100;
      arr.pop();
      arr.push(5);
      expect(arr).toEqual([100, 2, 3, 5]);
    });
  });
});

// ===== produce() Operations =====
describe('produce() - Immutable Updates', () => {
  describe('push in draft', () => {
    it('Single push', () => {
      const arr = pura([1, 2, 3]);
      const result = produce(arr, draft => {
        draft.push(4);
      });
      expect(arr).toEqual([1, 2, 3]);
      expect(result).toEqual([1, 2, 3, 4]);
    });

    it('Multiple pushes in one produce', () => {
      const arr = pura([1, 2, 3]);
      const result = produce(arr, draft => {
        draft.push(4);
        draft.push(5);
        draft.push(6);
      });
      expect(arr).toEqual([1, 2, 3]);
      expect(result).toEqual([1, 2, 3, 4, 5, 6]);
    });
  });

  describe('pop in draft', () => {
    it('Single pop', () => {
      const arr = pura([1, 2, 3]);
      const result = produce(arr, draft => {
        draft.pop();
      });
      expect(arr).toEqual([1, 2, 3]);
      expect(result).toEqual([1, 2]);
    });

    it('Multiple pops', () => {
      const arr = pura([1, 2, 3, 4, 5]);
      const result = produce(arr, draft => {
        draft.pop();
        draft.pop();
      });
      expect(arr).toEqual([1, 2, 3, 4, 5]);
      expect(result).toEqual([1, 2, 3]);
    });
  });

  describe('Index assignment in draft', () => {
    it('Update single index', () => {
      const arr = pura([1, 2, 3]);
      const result = produce(arr, draft => {
        draft[1] = 100;
      });
      expect(arr).toEqual([1, 2, 3]);
      expect(result).toEqual([1, 100, 3]);
    });

    it('Update multiple indices', () => {
      const arr = pura([1, 2, 3, 4, 5]);
      const result = produce(arr, draft => {
        draft[0] = 10;
        draft[2] = 30;
        draft[4] = 50;
      });
      expect(arr).toEqual([1, 2, 3, 4, 5]);
      expect(result).toEqual([10, 2, 30, 4, 50]);
    });
  });

  describe('Complex mutations in draft', () => {
    it('Mix push, pop, index assignment', () => {
      const arr = pura([1, 2, 3]);
      const result = produce(arr, draft => {
        draft.push(4);
        draft[0] = 100;
        draft.pop();
        draft.push(5);
      });
      expect(arr).toEqual([1, 2, 3]);
      expect(result).toEqual([100, 2, 3, 5]);
    });

    it('Filter-like operation', () => {
      const arr = pura([1, 2, 3, 4, 5]);
      const result = produce(arr, draft => {
        // Remove even numbers
        let writeIdx = 0;
        for (let i = 0; i < draft.length; i++) {
          if (draft[i]! % 2 !== 0) {
            draft[writeIdx] = draft[i]!;
            writeIdx++;
          }
        }
        while (draft.length > writeIdx) {
          draft.pop();
        }
      });
      expect(arr).toEqual([1, 2, 3, 4, 5]);
      expect(result).toEqual([1, 3, 5]);
    });
  });

  describe('Chained produce()', () => {
    it('Sequential updates', () => {
      const v1 = pura([1, 2, 3]);
      const v2 = produce(v1, d => d.push(4));
      const v3 = produce(v2, d => d.push(5));
      const v4 = produce(v3, d => d.push(6));

      expect(v1).toEqual([1, 2, 3]);
      expect(v2).toEqual([1, 2, 3, 4]);
      expect(v3).toEqual([1, 2, 3, 4, 5]);
      expect(v4).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it('Each version is independent', () => {
      const v1 = pura([1, 2, 3]);
      const v2 = produce(v1, d => d.push(4));
      const v3 = produce(v2, d => d.push(5));

      // Mutate v2
      v2.push(100);

      // v1 and v3 unchanged
      expect(v1).toEqual([1, 2, 3]);
      expect(v2).toEqual([1, 2, 3, 4, 100]);
      expect(v3).toEqual([1, 2, 3, 4, 5]);
    });
  });
});

// ===== Array Methods =====
describe('Array Methods (FP Operations)', () => {
  describe('map()', () => {
    it('Transforms elements', () => {
      const arr = pura([1, 2, 3]);
      const result = arr.map(x => x * 2);
      expect(result).toEqual([2, 4, 6]);
      expect(arr).toEqual([1, 2, 3]); // Original unchanged
    });

    it('Returns new array', () => {
      const arr = pura([1, 2, 3]);
      const result = arr.map(x => x);
      expect(result).toEqual([1, 2, 3]);
      expect(result === arr).toBe(false);
    });
  });

  describe('filter()', () => {
    it('Filters elements', () => {
      const arr = pura([1, 2, 3, 4, 5]);
      const result = arr.filter(x => x % 2 === 0);
      expect(result).toEqual([2, 4]);
      expect(arr).toEqual([1, 2, 3, 4, 5]); // Original unchanged
    });

    it('Empty result', () => {
      const arr = pura([1, 3, 5]);
      const result = arr.filter(x => x % 2 === 0);
      expect(result).toEqual([]);
    });
  });

  describe('reduce()', () => {
    it('Sums array', () => {
      const arr = pura([1, 2, 3, 4, 5]);
      const sum = arr.reduce((acc, x) => acc + x, 0);
      expect(sum).toBe(15);
    });

    it('Builds object', () => {
      const arr = pura([1, 2, 3]);
      const result = arr.reduce((acc, x) => {
        acc[x] = x * 2;
        return acc;
      }, {} as Record<number, number>);
      expect(result).toEqual({ 1: 2, 2: 4, 3: 6 });
    });
  });

  describe('slice()', () => {
    it('Returns subset', () => {
      const arr = pura([1, 2, 3, 4, 5]);
      const result = arr.slice(1, 4);
      expect(result).toEqual([2, 3, 4]);
    });

    it('Full slice returns copy', () => {
      const arr = pura([1, 2, 3]);
      const result = arr.slice();
      expect(result).toEqual([1, 2, 3]);
    });
  });

  describe('concat()', () => {
    it('Combines arrays', () => {
      const arr1 = pura([1, 2, 3]);
      const arr2 = [4, 5, 6];
      const result = arr1.concat(arr2);
      expect(result).toEqual([1, 2, 3, 4, 5, 6]);
    });
  });

  describe('forEach()', () => {
    it('Iterates over elements', () => {
      const arr = pura([1, 2, 3]);
      const result: number[] = [];
      arr.forEach(x => result.push(x * 2));
      expect(result).toEqual([2, 4, 6]);
    });
  });

  describe('find() and findIndex()', () => {
    it('find() returns element', () => {
      const arr = pura([1, 2, 3, 4, 5]);
      expect(arr.find(x => x > 3)).toBe(4);
      expect(arr.find(x => x > 10)).toBeUndefined();
    });

    it('findIndex() returns index', () => {
      const arr = pura([1, 2, 3, 4, 5]);
      expect(arr.findIndex(x => x > 3)).toBe(3);
      expect(arr.findIndex(x => x > 10)).toBe(-1);
    });
  });

  describe('some() and every()', () => {
    it('some() checks if any match', () => {
      const arr = pura([1, 2, 3, 4, 5]);
      expect(arr.some(x => x > 3)).toBe(true);
      expect(arr.some(x => x > 10)).toBe(false);
    });

    it('every() checks if all match', () => {
      const arr = pura([1, 2, 3, 4, 5]);
      expect(arr.every(x => x > 0)).toBe(true);
      expect(arr.every(x => x > 3)).toBe(false);
    });
  });
});

// ===== Read Operations =====
describe('Read Operations', () => {
  describe('Index access', () => {
    it('Read by index', () => {
      const arr = pura([1, 2, 3, 4, 5]);
      expect(arr[0]).toBe(1);
      expect(arr[2]).toBe(3);
      expect(arr[4]).toBe(5);
    });

    it('Out of bounds returns undefined', () => {
      const arr = pura([1, 2, 3]);
      expect(arr[10]).toBeUndefined();
      expect(arr[-1]).toBeUndefined();
    });
  });

  describe('length property', () => {
    it('Returns correct length', () => {
      expect(pura([]).length).toBe(0);
      expect(pura([1]).length).toBe(1);
      expect(pura([1, 2, 3]).length).toBe(3);
    });

    it('Updates after mutations', () => {
      const arr = pura([1, 2, 3]);
      expect(arr.length).toBe(3);
      arr.push(4);
      expect(arr.length).toBe(4);
      arr.pop();
      expect(arr.length).toBe(3);
    });
  });

  describe('Iteration', () => {
    it('for loop', () => {
      const arr = pura([1, 2, 3]);
      const result: number[] = [];
      for (let i = 0; i < arr.length; i++) {
        result.push(arr[i]!);
      }
      expect(result).toEqual([1, 2, 3]);
    });

    it('for-of loop', () => {
      const arr = pura([1, 2, 3]);
      const result: number[] = [];
      for (const item of arr) {
        result.push(item);
      }
      expect(result).toEqual([1, 2, 3]);
    });

    it('Iteration after mutations', () => {
      const arr = pura([1, 2, 3]);
      arr.push(4);
      arr[0] = 100;

      const result: number[] = [];
      for (const item of arr) {
        result.push(item);
      }
      expect(result).toEqual([100, 2, 3, 4]);
    });
  });
});

// ===== Edge Cases =====
describe('Edge Cases', () => {
  describe('Empty arrays', () => {
    it('Create empty array', () => {
      const arr = pura([]);
      expect(arr.length).toBe(0);
      expect(arr).toEqual([]);
    });

    it('Push to empty', () => {
      const arr = pura([]);
      arr.push(1);
      expect(arr).toEqual([1]);
    });

    it('Pop from empty', () => {
      const arr = pura([]);
      expect(arr.pop()).toBeUndefined();
    });

    it('produce on empty', () => {
      const arr = pura([]);
      const result = produce(arr, d => d.push(1));
      expect(arr).toEqual([]);
      expect(result).toEqual([1]);
    });
  });

  describe('Single element', () => {
    it('Create with one element', () => {
      const arr = pura([1]);
      expect(arr.length).toBe(1);
      expect(arr[0]).toBe(1);
    });

    it('Operations on single element', () => {
      const arr = pura([1]);
      arr.push(2);
      expect(arr).toEqual([1, 2]);
      arr.pop();
      expect(arr).toEqual([1]);
      arr[0] = 100;
      expect(arr).toEqual([100]);
    });
  });

  describe('Large arrays', () => {
    it('Create large array', () => {
      const arr = pura(Array.from({ length: 1000 }, (_, i) => i));
      expect(arr.length).toBe(1000);
      expect(arr[0]).toBe(0);
      expect(arr[999]).toBe(999);
    });

    it('Operations on large array', () => {
      const arr = pura(Array.from({ length: 1000 }, (_, i) => i));
      arr.push(1000);
      expect(arr.length).toBe(1001);
      expect(arr[1000]).toBe(1000);
    });

    it('produce on large array', () => {
      const arr = pura(Array.from({ length: 1000 }, (_, i) => i));
      const result = produce(arr, d => {
        d[500] = 9999;
      });
      expect(arr[500]).toBe(500);
      expect(result[500]).toBe(9999);
    });
  });

  describe('Different data types', () => {
    it('Strings', () => {
      const arr = pura(['a', 'b', 'c']);
      arr.push('d');
      expect(arr).toEqual(['a', 'b', 'c', 'd']);
    });

    it('Objects', () => {
      const arr = pura([{ id: 1 }, { id: 2 }]);
      arr.push({ id: 3 });
      expect(arr).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
    });

    it('Mixed types', () => {
      const arr = pura([1, 'two', { three: 3 }] as any[]);
      arr.push([4]);
      expect(arr).toEqual([1, 'two', { three: 3 }, [4]]);
    });
  });
});

// ===== Real-World Scenarios =====
describe('Real-World Scenarios', () => {
  it('State management pattern (like Redux)', () => {
    // Initial state
    let todos = pura([
      { id: 1, text: 'Learn Pura', done: false },
      { id: 2, text: 'Build app', done: false }
    ]);

    // Action 1: Add todo
    todos = produce(todos, draft => {
      draft.push({ id: 3, text: 'Ship it', done: false });
    });

    // Action 2: Toggle todo
    todos = produce(todos, draft => {
      draft[0] = { ...draft[0]!, done: true };
    });

    // Action 3: Remove todo
    todos = produce(todos, draft => {
      draft.pop();
    });

    expect(todos).toEqual([
      { id: 1, text: 'Learn Pura', done: true },
      { id: 2, text: 'Build app', done: false }
    ]);
  });

  it('Undo/Redo system', () => {
    const history: typeof state[] = [];
    let historyIndex = -1;

    // Initial state
    let state = pura([1, 2, 3]);
    history.push(state);
    historyIndex = 0;

    // Change 1
    state = produce(state, d => d.push(4));
    history.push(state);
    historyIndex = 1;

    // Change 2
    state = produce(state, d => d.push(5));
    history.push(state);
    historyIndex = 2;

    // Undo
    historyIndex--;
    state = history[historyIndex]!;
    expect(state).toEqual([1, 2, 3, 4]);

    // Undo again
    historyIndex--;
    state = history[historyIndex]!;
    expect(state).toEqual([1, 2, 3]);

    // Redo
    historyIndex++;
    state = history[historyIndex]!;
    expect(state).toEqual([1, 2, 3, 4]);
  });

  it('Collaborative editing - multiple branches', () => {
    // Base document
    const baseDoc = pura(['Line 1', 'Line 2', 'Line 3']);

    // User A's edit
    const docA = produce(baseDoc, draft => {
      draft[0] = 'Line 1 - edited by A';
    });

    // User B's edit (from same base)
    const docB = produce(baseDoc, draft => {
      draft.push('Line 4 - added by B');
    });

    // Base unchanged
    expect(baseDoc).toEqual(['Line 1', 'Line 2', 'Line 3']);

    // Each edit independent
    expect(docA).toEqual(['Line 1 - edited by A', 'Line 2', 'Line 3']);
    expect(docB).toEqual(['Line 1', 'Line 2', 'Line 3', 'Line 4 - added by B']);
  });

  it('Form state with validation', () => {
    interface FormState {
      name: string;
      email: string;
      age: number;
    }

    // Use array to track form fields and errors
    let fields = pura<FormState>([
      { name: '', email: '', age: 0 }
    ]);
    let errors = pura<string>([]);

    // Update field
    fields = produce(fields, draft => {
      draft[0] = { name: 'John', email: '', age: 0 };
    });

    // Validation
    errors = produce(errors, draft => {
      if (!fields[0]?.email) {
        draft.push('Email required');
      }
    });

    expect(errors).toEqual(['Email required']);
    expect(fields[0]).toEqual({ name: 'John', email: '', age: 0 });
  });
});

// ===== Trie Boundary Tests (BRANCH_FACTOR = 32) =====
describe('Trie Boundary Tests', () => {
  const BRANCH_FACTOR = 32;

  describe('Push across tail boundaries', () => {
    it('Push exactly BRANCH_FACTOR items', () => {
      const arr = pura<number>([]);
      for (let i = 0; i < BRANCH_FACTOR; i++) {
        arr.push(i);
      }
      expect(arr.length).toBe(BRANCH_FACTOR);
      expect(arr[0]).toBe(0);
      expect(arr[BRANCH_FACTOR - 1]).toBe(BRANCH_FACTOR - 1);
    });

    it('Push BRANCH_FACTOR + 1 items (tail overflow)', () => {
      const arr = pura<number>([]);
      for (let i = 0; i <= BRANCH_FACTOR; i++) {
        arr.push(i);
      }
      expect(arr.length).toBe(BRANCH_FACTOR + 1);
      expect(arr[BRANCH_FACTOR]).toBe(BRANCH_FACTOR);
    });

    it('Push 1024 items (shift upgrade from 5 to 10)', () => {
      const arr = pura<number>([]);
      for (let i = 0; i < 1024; i++) {
        arr.push(i);
      }
      expect(arr.length).toBe(1024);
      expect(arr[0]).toBe(0);
      expect(arr[1023]).toBe(1023);
    });

    it('Push 1025 items (after shift upgrade)', () => {
      const arr = pura<number>([]);
      for (let i = 0; i < 1025; i++) {
        arr.push(i);
      }
      expect(arr.length).toBe(1025);
      expect(arr[1024]).toBe(1024);
      // Verify all indices are accessible
      for (let i = 0; i < 1025; i++) {
        expect(arr[i]).toBe(i);
      }
    });
  });

  describe('Pop across tail boundaries', () => {
    it('Pop from BRANCH_FACTOR + 1 items back to BRANCH_FACTOR', () => {
      const items = Array.from({ length: BRANCH_FACTOR + 1 }, (_, i) => i);
      const arr = pura(items);
      const popped = arr.pop();
      expect(popped).toBe(BRANCH_FACTOR);
      expect(arr.length).toBe(BRANCH_FACTOR);
    });

    it('Pop across multiple tail boundaries', () => {
      const size = BRANCH_FACTOR * 3 + 10;
      const arr = pura(Array.from({ length: size }, (_, i) => i));

      // Pop down to verify boundary crossings
      for (let i = size - 1; i >= 0; i--) {
        expect(arr.pop()).toBe(i);
        expect(arr.length).toBe(i);
      }
      expect(arr.length).toBe(0);
    });

    it('Pop from 1025 items (crosses shift boundary)', () => {
      const arr = pura(Array.from({ length: 1025 }, (_, i) => i));

      // Pop back to 1024
      expect(arr.pop()).toBe(1024);
      expect(arr.length).toBe(1024);
      expect(arr[1023]).toBe(1023);

      // Pop back to 1023
      expect(arr.pop()).toBe(1023);
      expect(arr.length).toBe(1023);
    });
  });

  describe('Large array correctness', () => {
    it('5000 items - all indices accessible', () => {
      const arr = pura(Array.from({ length: 5000 }, (_, i) => i));
      expect(arr.length).toBe(5000);

      // Sample check various indices
      expect(arr[0]).toBe(0);
      expect(arr[31]).toBe(31);
      expect(arr[32]).toBe(32);
      expect(arr[100]).toBe(100);
      expect(arr[1000]).toBe(1000);
      expect(arr[2000]).toBe(2000);
      expect(arr[4999]).toBe(4999);
    });

    it('10000 items - iteration correctness', () => {
      const arr = pura(Array.from({ length: 10000 }, (_, i) => i));

      // For loop iteration
      let sum = 0;
      for (let i = 0; i < arr.length; i++) {
        sum += arr[i]!;
      }
      expect(sum).toBe((10000 * 9999) / 2);

      // For-of iteration
      let sum2 = 0;
      for (const v of arr) {
        sum2 += v;
      }
      expect(sum2).toBe((10000 * 9999) / 2);
    });

    it('produce on large array preserves all data', () => {
      const base = pura(Array.from({ length: 5000 }, (_, i) => i));

      const result = produce(base, draft => {
        draft[2500] = 99999;
      });

      // Base unchanged
      expect(base[2500]).toBe(2500);

      // Result has change
      expect(result[2500]).toBe(99999);

      // Other indices preserved
      expect(result[0]).toBe(0);
      expect(result[1000]).toBe(1000);
      expect(result[4999]).toBe(4999);
    });
  });
});

// ===== Deep Proxy Behavior (Immer-style) =====
describe('Deep Proxy Behavior', () => {
  it('Nested object mutation in produce - replacement pattern still works', () => {
    interface User {
      name: string;
      age: number;
    }

    const base = pura<User>([{ name: 'John', age: 20 }]);

    // Replacement pattern still works
    const result = produce(base, draft => {
      draft[0] = { ...draft[0]!, age: 30 };
    });

    // Base unchanged
    expect(base[0]!.age).toBe(20);
    // Result has new value
    expect(result[0]!.age).toBe(30);
  });

  it('Direct nested mutation works correctly (Immer-style)', () => {
    interface User {
      name: string;
      age: number;
    }

    const base = pura<User>([{ name: 'John', age: 20 }]);

    // Direct mutation now works correctly with deep proxy!
    const result = produce(base, draft => {
      const user = draft[0]!;
      user.age = 99; // Deep proxy handles this
    });

    // Base unchanged (deep proxy COW)
    expect(base[0]!.age).toBe(20);
    // Result has new value
    expect(result[0]!.age).toBe(99);
  });

  it('Deeply nested mutation works', () => {
    interface Nested {
      level1: {
        level2: {
          value: number;
        };
      };
    }

    const base = pura<Nested>([{ level1: { level2: { value: 1 } } }]);

    const result = produce(base, draft => {
      draft[0]!.level1.level2.value = 999;
    });

    // Base unchanged
    expect(base[0]!.level1.level2.value).toBe(1);
    // Result has new value
    expect(result[0]!.level1.level2.value).toBe(999);
  });

  it('Array of primitives - direct mutation', () => {
    const base = pura([1, 2, 3]);

    const result = produce(base, draft => {
      draft[0] = 100;
    });

    expect(base[0]).toBe(1);
    expect(result[0]).toBe(100);
  });

  it('Nested array mutation', () => {
    const base = pura([[1, 2], [3, 4]]);

    const result = produce(base, draft => {
      draft[0]!.push(99);
      draft[1]![0] = 100;
    });

    // Base unchanged
    expect(base[0]).toEqual([1, 2]);
    expect(base[1]).toEqual([3, 4]);
    // Result has changes
    expect(result[0]).toEqual([1, 2, 99]);
    expect(result[1]).toEqual([100, 4]);
  });
});

// ===== Helper Functions =====
describe('Helper Functions', () => {
  describe('isPura', () => {
    it('returns true for pura arrays', () => {
      const arr = pura([1, 2, 3]);
      expect(isPura(arr)).toBe(true);
    });

    it('returns false for native arrays', () => {
      const arr = [1, 2, 3];
      expect(isPura(arr)).toBe(false);
    });

    it('returns true for produce results', () => {
      const base = pura([1, 2, 3]);
      const result = produce(base, d => d.push(4));
      expect(isPura(result)).toBe(true);
    });
  });

  describe('repura', () => {
    it('re-optimizes fallback-ed array after sort', () => {
      const arr = pura([3, 1, 2]);
      arr.sort((a, b) => a - b); // Triggers fallback

      // Re-optimize
      const optimized = repura(arr);

      expect(optimized).toEqual([1, 2, 3]);
      expect(isPura(optimized)).toBe(true);
    });

    it('is idempotent for already optimized arrays', () => {
      const arr = pura([1, 2, 3]);
      const result = repura(arr);

      expect(result).toEqual([1, 2, 3]);
      expect(isPura(result)).toBe(true);
    });

    it('converts native arrays to pura', () => {
      const native = [1, 2, 3];
      const result = repura(native);

      expect(result).toEqual([1, 2, 3]);
      expect(isPura(result)).toBe(true);
    });
  });
});

// ===== Sequence Consistency Tests =====
describe('Sequence Consistency', () => {
  const sizes = [0, 10, 31, 32, 33, 1023, 1024, 1025, 2048];

  sizes.forEach(size => {
    it(`vecFromArray correctness at size ${size}`, () => {
      const arr = pura(Array.from({ length: size }, (_, i) => i));
      expect(arr.length).toBe(size);
      for (let i = 0; i < size; i++) {
        expect(arr[i]).toBe(i);
      }
    });
  });

  it('Sequential push consistency', () => {
    const arr = pura<number>([]);
    for (let i = 0; i < 1050; i++) {
      arr.push(i);
      expect(arr.length).toBe(i + 1);
      expect(arr[i]).toBe(i);
    }
  });

  it('Sequential pop consistency', () => {
    const arr = pura(Array.from({ length: 1050 }, (_, i) => i));
    for (let i = 1049; i >= 0; i--) {
      expect(arr.pop()).toBe(i);
      expect(arr.length).toBe(i);
    }
  });
});
