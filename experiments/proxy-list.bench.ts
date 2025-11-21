/**
 * Benchmark: Proxy-wrapped IList vs 普通數組 vs 原生 IList
 */

import { bench, describe } from 'vitest';
import { IList } from '../packages/core/src/list';
import { createListProxy, fromArray } from './proxy-list';

describe('Proxy-wrapped IList vs Native Array vs IList', () => {
  const size = 1000;
  const data = Array.from({ length: size }, (_, i) => i);

  // 三種實現
  const nativeArray = [...data];
  const ilist = IList.from(data);
  const proxyList = fromArray(data);

  // ===== 讀取操作 =====
  describe('Read operations', () => {
    bench('Native array - index access', () => {
      let sum = 0;
      for (let i = 0; i < size; i++) {
        sum += nativeArray[i]!;
      }
    });

    bench('IList - get()', () => {
      let sum = 0;
      for (let i = 0; i < size; i++) {
        sum += ilist.get(i)!;
      }
    });

    bench('Proxy IList - index access', () => {
      let sum = 0;
      for (let i = 0; i < size; i++) {
        sum += proxyList[i]!;
      }
    });
  });

  // ===== Push 操作 =====
  describe('Push operations', () => {
    bench('Native array - push (copy)', () => {
      let arr = [...nativeArray];
      for (let i = 0; i < 100; i++) {
        arr = [...arr, 999];
      }
    });

    bench('IList - push (O(log n))', () => {
      let list = ilist;
      for (let i = 0; i < 100; i++) {
        list = list.push(999);
      }
    });

    bench('Proxy IList - push (O(log n))', () => {
      let list = proxyList;
      for (let i = 0; i < 100; i++) {
        list = (list as any).push(999);
      }
    });
  });

  // ===== Map 操作 =====
  describe('Map operations', () => {
    bench('Native array - map', () => {
      const result = nativeArray.map(x => x * 2);
    });

    bench('IList - map', () => {
      const result = ilist.map(x => x * 2);
    });

    bench('Proxy IList - map', () => {
      const result = proxyList.map((x: number) => x * 2);
    });
  });

  // ===== Filter 操作 =====
  describe('Filter operations', () => {
    bench('Native array - filter', () => {
      const result = nativeArray.filter(x => x % 2 === 0);
    });

    bench('IList - filter', () => {
      const result = ilist.filter(x => x % 2 === 0);
    });

    bench('Proxy IList - filter', () => {
      const result = proxyList.filter((x: number) => x % 2 === 0);
    });
  });

  // ===== 迭代操作 =====
  describe('Iteration', () => {
    bench('Native array - for...of', () => {
      let sum = 0;
      for (const x of nativeArray) {
        sum += x;
      }
    });

    bench('IList - for...of', () => {
      let sum = 0;
      for (const x of ilist) {
        sum += x;
      }
    });

    bench('Proxy IList - for...of', () => {
      let sum = 0;
      for (const x of proxyList) {
        sum += x;
      }
    });
  });
});

describe('Large array operations (10000 items)', () => {
  const largeSize = 10000;
  const largeData = Array.from({ length: largeSize }, (_, i) => i);

  const largeNativeArray = [...largeData];
  const largeIList = IList.from(largeData);
  const largeProxyList = fromArray(largeData);

  describe('Single push', () => {
    bench('Native array - single push (copy 10000)', () => {
      const result = [...largeNativeArray, 999];
    });

    bench('IList - single push (O(log n))', () => {
      const result = largeIList.push(999);
    });

    bench('Proxy IList - single push (O(log n))', () => {
      const result = (largeProxyList as any).push(999);
    });
  });

  describe('Sequential pushes', () => {
    bench('Native array - 1000 pushes (O(n) each)', () => {
      let arr = largeNativeArray;
      for (let i = 0; i < 1000; i++) {
        arr = [...arr, i];
      }
    });

    bench('IList - 1000 pushes (O(log n) each)', () => {
      let list = largeIList;
      for (let i = 0; i < 1000; i++) {
        list = list.push(i);
      }
    });

    bench('Proxy IList - 1000 pushes (O(log n) each)', () => {
      let list = largeProxyList;
      for (let i = 0; i < 1000; i++) {
        list = (list as any).push(i);
      }
    });
  });
});
