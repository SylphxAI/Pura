/**
 * Tests for RRB-Tree operations (concat, slice)
 */

import { describe, it, expect } from 'vitest';
import { pura, produce } from './index';

describe('RRB-Tree operations', () => {
  describe('vecConcat via produce', () => {
    it('should concatenate two small arrays', () => {
      const arr1 = pura([1, 2, 3]);
      const arr2 = pura([4, 5, 6]);

      const result = produce(arr1, draft => {
        draft.push(...arr2);
      });

      expect([...result]).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it('should concatenate medium arrays', () => {
      const arr1 = pura(Array.from({ length: 100 }, (_, i) => i));
      const arr2 = pura(Array.from({ length: 100 }, (_, i) => i + 100));

      const result = produce(arr1, draft => {
        draft.push(...arr2);
      });

      expect(result.length).toBe(200);
      expect(result[0]).toBe(0);
      expect(result[99]).toBe(99);
      expect(result[100]).toBe(100);
      expect(result[199]).toBe(199);
    });

    it('should concatenate large arrays', () => {
      const arr1 = pura(Array.from({ length: 1000 }, (_, i) => i));
      const arr2 = pura(Array.from({ length: 1000 }, (_, i) => i + 1000));

      const result = produce(arr1, draft => {
        draft.push(...arr2);
      });

      expect(result.length).toBe(2000);
      expect(result[0]).toBe(0);
      expect(result[999]).toBe(999);
      expect(result[1000]).toBe(1000);
      expect(result[1999]).toBe(1999);
    });
  });

  describe('array methods that use internal concat', () => {
    it('should handle concat method', () => {
      const arr = pura([1, 2, 3]);
      const result = arr.concat([4, 5], [6, 7]);

      expect(result).toEqual([1, 2, 3, 4, 5, 6, 7]);
    });

    it('should handle concat with pura arrays', () => {
      const arr1 = pura([1, 2, 3]);
      const arr2 = pura([4, 5, 6]);
      const result = arr1.concat(arr2);

      expect(result).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it('should handle concat with mixed arrays', () => {
      const arr1 = pura([1, 2]);
      const arr2 = [3, 4];
      const arr3 = pura([5, 6]);
      const result = arr1.concat(arr2, arr3);

      expect(result).toEqual([1, 2, 3, 4, 5, 6]);
    });
  });

  describe('slice operations', () => {
    it('should slice small arrays', () => {
      const arr = pura([1, 2, 3, 4, 5]);
      const result = arr.slice(1, 4);

      expect(result).toEqual([2, 3, 4]);
    });

    it('should slice with negative indices', () => {
      const arr = pura([1, 2, 3, 4, 5]);

      expect(arr.slice(-2)).toEqual([4, 5]);
      expect(arr.slice(-3, -1)).toEqual([3, 4]);
    });

    it('should slice large arrays', () => {
      const arr = pura(Array.from({ length: 1000 }, (_, i) => i));
      const result = arr.slice(100, 200);

      expect(result.length).toBe(100);
      expect(result[0]).toBe(100);
      expect(result[99]).toBe(199);
    });
  });

  describe('structural sharing after operations', () => {
    it('should maintain correct values after multiple pushes', () => {
      let arr = pura<number>([]);

      for (let i = 0; i < 100; i++) {
        arr = produce(arr, draft => {
          draft.push(i);
        });
      }

      expect(arr.length).toBe(100);
      for (let i = 0; i < 100; i++) {
        expect(arr[i]).toBe(i);
      }
    });

    it('should handle iteration correctly after concat-like operations', () => {
      const arr1 = pura([1, 2, 3]);
      const arr2 = produce(arr1, draft => {
        draft.push(4, 5, 6);
      });

      // Verify iteration
      const values: number[] = [];
      for (const v of arr2) {
        values.push(v);
      }

      expect(values).toEqual([1, 2, 3, 4, 5, 6]);
    });
  });

  describe('edge cases', () => {
    it('should handle empty array concat', () => {
      const arr1 = pura<number>([]);
      const arr2 = pura([1, 2, 3]);

      expect(arr1.concat(arr2)).toEqual([1, 2, 3]);
      expect(arr2.concat(arr1)).toEqual([1, 2, 3]);
    });

    it('should handle single element arrays', () => {
      const arr1 = pura([1]);
      const arr2 = pura([2]);

      expect(arr1.concat(arr2)).toEqual([1, 2]);
    });

    it('should handle slice beyond bounds', () => {
      const arr = pura([1, 2, 3]);

      expect(arr.slice(0, 100)).toEqual([1, 2, 3]);
      expect(arr.slice(100)).toEqual([]);
    });
  });
});
