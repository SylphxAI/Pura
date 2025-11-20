/**
 * Reality Check Benchmarks
 *
 * Comparing three approaches:
 * 1. Pura (IList/IMap) - Persistent immutable structures
 * 2. Naive FP - Spreading/copying for immutability
 * 3. Mutation - Direct mutable operations
 *
 * Goal: Prove that Pura makes FP practical by being MUCH faster than
 * naive copying while staying close to mutation performance.
 */

import { bench, describe } from 'vitest';
import { IList } from '../packages/core/src/list';
import { IMap } from '../packages/core/src/map';

// ============================================================================
// ARRAY / LIST OPERATIONS
// ============================================================================

describe('Reality Check: List Operations (100 elements)', () => {
  const SIZE = 100;
  const values = Array.from({ length: SIZE }, (_, i) => i);

  // Setup
  const ilist = IList.from(values);
  let mutableArray = [...values];

  // READ
  bench('IList - get(50)', () => {
    ilist.get(50);
  });

  bench('Array (mutable) - get [50]', () => {
    mutableArray[50];
  });

  // WRITE (UPDATE)
  bench('IList - set(50, 999)', () => {
    ilist.set(50, 999);
  });

  bench('Array (naive FP) - set [50] = 999 (copy entire array)', () => {
    const copy = [...mutableArray];
    copy[50] = 999;
  });

  bench('Array (mutation) - set [50] = 999', () => {
    mutableArray[50] = 999;
  });

  // APPEND
  bench('IList - push(999)', () => {
    ilist.push(999);
  });

  bench('Array (naive FP) - push(999) (spread)', () => {
    [...mutableArray, 999];
  });

  bench('Array (mutation) - push(999)', () => {
    mutableArray.push(999);
    mutableArray.pop(); // restore for fairness
  });
});

describe('Reality Check: List Operations (1000 elements)', () => {
  const SIZE = 1000;
  const values = Array.from({ length: SIZE }, (_, i) => i);

  const ilist = IList.from(values);
  let mutableArray = [...values];

  // WRITE (UPDATE) - This is where persistent structures shine!
  bench('IList - set(500, 999)', () => {
    ilist.set(500, 999);
  });

  bench('Array (naive FP) - set [500] = 999 (copy 1000 elements)', () => {
    const copy = [...mutableArray];
    copy[500] = 999;
  });

  bench('Array (mutation) - set [500] = 999', () => {
    mutableArray[500] = 999;
  });

  // SEQUENTIAL UPDATES - The killer use case!
  bench('IList - 10 sequential sets', () => {
    let list = ilist;
    for (let i = 0; i < 10; i++) {
      list = list.set(i * 100, 999);
    }
  });

  bench('Array (naive FP) - 10 sequential sets (10 full copies!)', () => {
    let arr = mutableArray;
    for (let i = 0; i < 10; i++) {
      const copy = [...arr];
      copy[i * 100] = 999;
      arr = copy;
    }
  });

  bench('Array (mutation) - 10 sequential sets', () => {
    for (let i = 0; i < 10; i++) {
      mutableArray[i * 100] = 999;
    }
  });
});

describe('Reality Check: List Build-up (creating 1000-element list)', () => {
  // BUILD BY PUSHING
  bench('IList - build by pushing 1000 elements', () => {
    let list = IList.empty<number>();
    for (let i = 0; i < 1000; i++) {
      list = list.push(i);
    }
  });

  bench('Array (naive FP) - build by spreading 1000 times', () => {
    let arr: number[] = [];
    for (let i = 0; i < 1000; i++) {
      arr = [...arr, i];
    }
  });

  bench('Array (mutation) - build by pushing 1000 times', () => {
    const arr: number[] = [];
    for (let i = 0; i < 1000; i++) {
      arr.push(i);
    }
  });
});

// ============================================================================
// MAP / OBJECT OPERATIONS
// ============================================================================

describe('Reality Check: Map Operations (100 entries)', () => {
  const SIZE = 100;
  const entries = Array.from({ length: SIZE }, (_, i) => [`key${i}`, i] as [string, number]);

  // Setup
  const imap = IMap.from(entries);
  let mutableMap = new Map(entries);
  let mutableObj = Object.fromEntries(entries);

  // READ
  bench('IMap - get("key50")', () => {
    imap.get('key50');
  });

  bench('Map (mutable) - get("key50")', () => {
    mutableMap.get('key50');
  });

  bench('Object (mutable) - get ["key50"]', () => {
    mutableObj['key50'];
  });

  // WRITE
  bench('IMap - set("key50", 999)', () => {
    imap.set('key50', 999);
  });

  bench('Map (naive FP) - set("key50", 999) (clone)', () => {
    new Map(mutableMap).set('key50', 999);
  });

  bench('Map (mutation) - set("key50", 999)', () => {
    mutableMap.set('key50', 999);
  });

  bench('Object (naive FP) - set ["key50"] = 999 (spread)', () => {
    ({ ...mutableObj, key50: 999 });
  });

  bench('Object (mutation) - set ["key50"] = 999', () => {
    mutableObj['key50'] = 999;
  });
});

describe('Reality Check: Map Operations (1000 entries)', () => {
  const SIZE = 1000;
  const entries = Array.from({ length: SIZE }, (_, i) => [`key${i}`, i] as [string, number]);

  const imap = IMap.from(entries);
  let mutableMap = new Map(entries);
  let mutableObj = Object.fromEntries(entries);

  // SEQUENTIAL UPDATES
  bench('IMap - 10 sequential sets', () => {
    let map = imap;
    for (let i = 0; i < 10; i++) {
      map = map.set(`key${i * 100}`, 999);
    }
  });

  bench('Map (naive FP) - 10 sequential sets (10 full clones!)', () => {
    let map = mutableMap;
    for (let i = 0; i < 10; i++) {
      map = new Map(map);
      map.set(`key${i * 100}`, 999);
    }
  });

  bench('Map (mutation) - 10 sequential sets', () => {
    for (let i = 0; i < 10; i++) {
      mutableMap.set(`key${i * 100}`, 999);
    }
  });

  bench('Object (naive FP) - 10 sequential sets (10 full spreads!)', () => {
    let obj = mutableObj;
    for (let i = 0; i < 10; i++) {
      obj = { ...obj, [`key${i * 100}`]: 999 };
    }
  });

  bench('Object (mutation) - 10 sequential sets', () => {
    for (let i = 0; i < 10; i++) {
      mutableObj[`key${i * 100}`] = 999;
    }
  });
});

describe('Reality Check: Map Build-up (creating 1000-entry map)', () => {
  bench('IMap - build by setting 1000 entries', () => {
    let map = IMap.empty<string, number>();
    for (let i = 0; i < 1000; i++) {
      map = map.set(`key${i}`, i);
    }
  });

  bench('Map (naive FP) - build by cloning 1000 times', () => {
    let map = new Map<string, number>();
    for (let i = 0; i < 1000; i++) {
      map = new Map(map);
      map.set(`key${i}`, i);
    }
  });

  bench('Map (mutation) - build by setting 1000 times', () => {
    const map = new Map<string, number>();
    for (let i = 0; i < 1000; i++) {
      map.set(`key${i}`, i);
    }
  });

  bench('Object (naive FP) - build by spreading 1000 times', () => {
    let obj: Record<string, number> = {};
    for (let i = 0; i < 1000; i++) {
      obj = { ...obj, [`key${i}`]: i };
    }
  });

  bench('Object (mutation) - build by setting 1000 times', () => {
    const obj: Record<string, number> = {};
    for (let i = 0; i < 1000; i++) {
      obj[`key${i}`] = i;
    }
  });
});
