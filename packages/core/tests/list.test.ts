import { describe, expect, it } from 'vitest';
import { IList } from '../src/list';

describe('IList', () => {
  describe('construction', () => {
    it('creates empty list', () => {
      const list = IList.empty<number>();
      expect(list.size).toBe(0);
    });

    it('creates list from values', () => {
      const list = IList.of(1, 2, 3, 4, 5);
      expect(list.size).toBe(5);
      expect(list.get(0)).toBe(1);
      expect(list.get(4)).toBe(5);
    });

    it('creates list from iterable', () => {
      const list = IList.from([1, 2, 3, 4, 5]);
      expect(list.size).toBe(5);
      expect(list.get(0)).toBe(1);
      expect(list.get(4)).toBe(5);
    });
  });

  describe('get/has', () => {
    it('gets existing value', () => {
      const list = IList.of(10, 20, 30, 40, 50);
      expect(list.get(0)).toBe(10);
      expect(list.get(2)).toBe(30);
      expect(list.get(4)).toBe(50);
    });

    it('returns undefined for out of bounds', () => {
      const list = IList.of(1, 2, 3);
      expect(list.get(-1)).toBeUndefined();
      expect(list.get(10)).toBeUndefined();
    });

    it('checks index existence', () => {
      const list = IList.of(1, 2, 3);
      expect(list.has(0)).toBe(true);
      expect(list.has(2)).toBe(true);
      expect(list.has(3)).toBe(false);
      expect(list.has(-1)).toBe(false);
    });
  });

  describe('set', () => {
    it('sets value at index', () => {
      const list1 = IList.of(1, 2, 3, 4, 5);
      const list2 = list1.set(2, 999);

      expect(list1.get(2)).toBe(3);
      expect(list2.get(2)).toBe(999);
      expect(list2.size).toBe(5);
    });

    it('throws on out of bounds', () => {
      const list = IList.of(1, 2, 3);
      expect(() => list.set(10, 999)).toThrow(RangeError);
      expect(() => list.set(-1, 999)).toThrow(RangeError);
    });

    it('maintains immutability', () => {
      const list1 = IList.of(1, 2, 3);
      const list2 = list1.set(1, 999);

      expect(list1.get(1)).toBe(2);
      expect(list2.get(1)).toBe(999);
    });
  });

  describe('push/pop', () => {
    it('pushes values', () => {
      let list = IList.empty<number>();
      list = list.push(1);
      list = list.push(2);
      list = list.push(3);

      expect(list.size).toBe(3);
      expect(list.get(0)).toBe(1);
      expect(list.get(2)).toBe(3);
    });

    it('pops values', () => {
      const list1 = IList.of(1, 2, 3, 4, 5);
      const list2 = list1.pop();
      const list3 = list2.pop();

      expect(list1.size).toBe(5);
      expect(list2.size).toBe(4);
      expect(list3.size).toBe(3);
      expect(list3.get(2)).toBe(3);
    });

    it('handles pop on empty list', () => {
      const list = IList.empty<number>();
      const popped = list.pop();
      expect(popped.size).toBe(0);
    });

    it('maintains immutability with push/pop', () => {
      const list1 = IList.of(1, 2, 3);
      const list2 = list1.push(4);
      const list3 = list2.pop();

      expect(list1.size).toBe(3);
      expect(list2.size).toBe(4);
      expect(list3.size).toBe(3);
    });
  });

  describe('concat', () => {
    it('concatenates two lists', () => {
      const list1 = IList.of(1, 2, 3);
      const list2 = IList.of(4, 5, 6);
      const result = list1.concat(list2);

      expect(result.size).toBe(6);
      expect(result.get(0)).toBe(1);
      expect(result.get(5)).toBe(6);
    });

    it('concatenates empty lists', () => {
      const list1 = IList.of(1, 2, 3);
      const list2 = IList.empty<number>();
      const result = list1.concat(list2);

      expect(result.size).toBe(3);
    });

    it('maintains immutability', () => {
      const list1 = IList.of(1, 2, 3);
      const list2 = IList.of(4, 5, 6);
      const result = list1.concat(list2);

      expect(list1.size).toBe(3);
      expect(list2.size).toBe(3);
      expect(result.size).toBe(6);
    });

    it('concatenates large lists (100 + 100)', () => {
      const list1 = IList.from(Array.from({ length: 100 }, (_, i) => i));
      const list2 = IList.from(Array.from({ length: 100 }, (_, i) => i + 100));
      const result = list1.concat(list2);

      expect(result.size).toBe(200);
      expect(result.get(0)).toBe(0);
      expect(result.get(99)).toBe(99);
      expect(result.get(100)).toBe(100);
      expect(result.get(199)).toBe(199);
    });

    it('concatenates very large lists (1000 + 1000)', () => {
      const list1 = IList.from(Array.from({ length: 1000 }, (_, i) => i));
      const list2 = IList.from(Array.from({ length: 1000 }, (_, i) => i + 1000));
      const result = list1.concat(list2);

      expect(result.size).toBe(2000);
      expect(result.get(0)).toBe(0);
      expect(result.get(999)).toBe(999);
      expect(result.get(1000)).toBe(1000);
      expect(result.get(1999)).toBe(1999);

      // Verify all elements
      for (let i = 0; i < 2000; i++) {
        expect(result.get(i)).toBe(i);
      }
    });

    it('concatenates multiple times', () => {
      let result = IList.empty<number>();
      const chunk = IList.from([1, 2, 3, 4, 5]);

      for (let i = 0; i < 10; i++) {
        result = result.concat(chunk);
      }

      expect(result.size).toBe(50);
      expect(result.get(0)).toBe(1);
      expect(result.get(49)).toBe(5);
    });

    it('concatenates lists of different sizes', () => {
      const small = IList.from([1, 2, 3]);
      const large = IList.from(Array.from({ length: 500 }, (_, i) => i + 10));
      const result = small.concat(large);

      expect(result.size).toBe(503);
      expect(result.get(0)).toBe(1);
      expect(result.get(2)).toBe(3);
      expect(result.get(3)).toBe(10);
      expect(result.get(502)).toBe(509);
    });
  });

  describe('slice', () => {
    it('slices list', () => {
      const list = IList.of(1, 2, 3, 4, 5);
      const slice = list.slice(1, 4);

      expect(slice.size).toBe(3);
      expect(slice.get(0)).toBe(2);
      expect(slice.get(2)).toBe(4);
    });

    it('slices with start only', () => {
      const list = IList.of(1, 2, 3, 4, 5);
      const slice = list.slice(2);

      expect(slice.size).toBe(3);
      expect(slice.get(0)).toBe(3);
    });

    it('slices with no arguments', () => {
      const list = IList.of(1, 2, 3);
      const slice = list.slice();

      expect(slice.size).toBe(3);
      expect(slice.get(0)).toBe(1);
    });
  });

  describe('transformation', () => {
    it('maps over values', () => {
      const list = IList.of(1, 2, 3, 4, 5);
      const mapped = list.map((x) => x * 2);

      expect(mapped.get(0)).toBe(2);
      expect(mapped.get(4)).toBe(10);
    });

    it('filters values', () => {
      const list = IList.of(1, 2, 3, 4, 5);
      const filtered = list.filter((x) => x % 2 === 0);

      expect(filtered.size).toBe(2);
      expect(filtered.get(0)).toBe(2);
      expect(filtered.get(1)).toBe(4);
    });

    it('reduces values', () => {
      const list = IList.of(1, 2, 3, 4, 5);
      const sum = list.reduce((acc, x) => acc + x, 0);

      expect(sum).toBe(15);
    });
  });

  describe('iteration', () => {
    it('iterates with for...of', () => {
      const list = IList.of(1, 2, 3, 4, 5);
      const values: number[] = [];

      for (const value of list) {
        values.push(value);
      }

      expect(values).toEqual([1, 2, 3, 4, 5]);
    });

    it('converts to array', () => {
      const list = IList.of(1, 2, 3, 4, 5);
      const array = list.toArray();

      expect(array).toEqual([1, 2, 3, 4, 5]);
    });
  });

  describe('utility methods', () => {
    it('gets first element', () => {
      const list = IList.of(1, 2, 3);
      expect(list.first()).toBe(1);
      expect(IList.empty().first()).toBeUndefined();
    });

    it('gets last element', () => {
      const list = IList.of(1, 2, 3);
      expect(list.last()).toBe(3);
      expect(IList.empty().last()).toBeUndefined();
    });

    it('finds index of value', () => {
      const list = IList.of(10, 20, 30, 40);
      expect(list.indexOf(30)).toBe(2);
      expect(list.indexOf(999)).toBe(-1);
    });

    it('checks if includes value', () => {
      const list = IList.of(10, 20, 30);
      expect(list.includes(20)).toBe(true);
      expect(list.includes(999)).toBe(false);
    });

    it('finds value with predicate', () => {
      const list = IList.of(1, 2, 3, 4, 5);
      const found = list.find((x) => x > 3);
      expect(found).toBe(4);
    });

    it('checks some with predicate', () => {
      const list = IList.of(1, 2, 3, 4, 5);
      expect(list.some((x) => x > 3)).toBe(true);
      expect(list.some((x) => x > 10)).toBe(false);
    });

    it('checks every with predicate', () => {
      const list = IList.of(1, 2, 3, 4, 5);
      expect(list.every((x) => x > 0)).toBe(true);
      expect(list.every((x) => x > 3)).toBe(false);
    });

    it('reverses list', () => {
      const list = IList.of(1, 2, 3, 4, 5);
      const reversed = list.reverse();

      expect(reversed.get(0)).toBe(5);
      expect(reversed.get(4)).toBe(1);
    });

    it('sorts list', () => {
      const list = IList.of(3, 1, 4, 1, 5, 9, 2, 6);
      const sorted = list.sort((a, b) => a - b);

      expect(sorted.get(0)).toBe(1);
      expect(sorted.get(7)).toBe(9);
    });
  });

  describe('equality', () => {
    it('compares lists for equality', () => {
      const list1 = IList.of(1, 2, 3);
      const list2 = IList.of(1, 2, 3);
      const list3 = IList.of(1, 2, 4);

      expect(list1.equals(list2)).toBe(true);
      expect(list1.equals(list3)).toBe(false);
    });

    it('returns true for same reference', () => {
      const list = IList.of(1, 2, 3);
      expect(list.equals(list)).toBe(true);
    });
  });

  describe('large lists', () => {
    it('handles 100 elements', () => {
      let list = IList.empty<number>();

      // Push 100 elements
      for (let i = 0; i < 100; i++) {
        list = list.push(i);
      }

      expect(list.size).toBe(100);

      // Verify all elements
      for (let i = 0; i < 100; i++) {
        expect(list.get(i)).toBe(i);
      }
    });

    it('handles 1000 elements', () => {
      let list = IList.empty<number>();

      // Push 1000 elements
      for (let i = 0; i < 1000; i++) {
        list = list.push(i);
      }

      expect(list.size).toBe(1000);

      // Verify random samples
      expect(list.get(0)).toBe(0);
      expect(list.get(500)).toBe(500);
      expect(list.get(999)).toBe(999);

      // Pop half
      for (let i = 0; i < 500; i++) {
        list = list.pop();
      }

      expect(list.size).toBe(500);
      expect(list.get(499)).toBe(499);
    });

    it('handles updates on large list', () => {
      let list = IList.empty<number>();

      // Create list with 100 elements
      for (let i = 0; i < 100; i++) {
        list = list.push(i);
      }

      // Update multiple elements
      list = list.set(10, 999);
      list = list.set(50, 888);
      list = list.set(90, 777);

      expect(list.get(10)).toBe(999);
      expect(list.get(50)).toBe(888);
      expect(list.get(90)).toBe(777);
      expect(list.size).toBe(100);
    });
  });

  describe('structural sharing', () => {
    it('shares structure on push', () => {
      const list1 = IList.of(1, 2, 3);
      const list2 = list1.push(4);

      // Both lists should be valid
      expect(list1.size).toBe(3);
      expect(list2.size).toBe(4);

      // Original unchanged
      expect(list1.get(2)).toBe(3);
      expect(list2.get(2)).toBe(3);
      expect(list2.get(3)).toBe(4);
    });

    it('shares structure on set', () => {
      const list1 = IList.of(1, 2, 3, 4, 5);
      const list2 = list1.set(2, 999);

      // Both lists valid
      expect(list1.get(2)).toBe(3);
      expect(list2.get(2)).toBe(999);

      // Unchanged elements should be same
      expect(list1.get(0)).toBe(list2.get(0));
    });
  });

  describe('edge cases', () => {
    it('handles empty list operations', () => {
      const list = IList.empty<number>();
      expect(list.size).toBe(0);
      expect(list.first()).toBeUndefined();
      expect(list.last()).toBeUndefined();
      expect(list.pop().size).toBe(0);
    });

    it('handles single element', () => {
      const list = IList.of(42);
      expect(list.size).toBe(1);
      expect(list.get(0)).toBe(42);
      expect(list.first()).toBe(42);
      expect(list.last()).toBe(42);

      const popped = list.pop();
      expect(popped.size).toBe(0);
    });

    it('handles push beyond tail buffer (>32 elements)', () => {
      let list = IList.empty<number>();

      // Push 64 elements to exceed tail buffer
      for (let i = 0; i < 64; i++) {
        list = list.push(i);
      }

      expect(list.size).toBe(64);
      expect(list.get(0)).toBe(0);
      expect(list.get(31)).toBe(31);
      expect(list.get(32)).toBe(32);
      expect(list.get(63)).toBe(63);
    });

    it('handles set at different tree depths', () => {
      let list = IList.empty<number>();

      // Create list with 100 elements (multiple tree levels)
      for (let i = 0; i < 100; i++) {
        list = list.push(i);
      }

      // Update at different positions
      list = list.set(0, 1000); // Root level
      list = list.set(32, 2000); // Different node
      list = list.set(64, 3000); // Another node
      list = list.set(99, 4000); // Tail

      expect(list.get(0)).toBe(1000);
      expect(list.get(32)).toBe(2000);
      expect(list.get(64)).toBe(3000);
      expect(list.get(99)).toBe(4000);
    });
  });
});
