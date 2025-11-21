/**
 * OrderIndex - Maintains insertion order for Maps and Sets
 * Uses Vec for O(n) iteration instead of HAMT lookup per index
 */

import { DELETED, ORDER_COMPACT_RATIO } from './constants';
import type { Owner } from './types';
import { emptyVec, vecFromArray, vecPush, vecAssoc, vecGet, vecIter } from './vec';
import { hamtEmpty, hamtSet, hamtGet, hamtDelete, type HMap } from './hamt';
import type { Vec } from './types';

export { DELETED };

export interface OrderIndex<K, V = unknown> {
  next: number;
  keyToIdx: HMap<K, number>;
  idxToKey: Vec<K | typeof DELETED>;
  idxToVal?: Vec<V | typeof DELETED>;
  holes: number;
}

export function orderEmpty<K>(): OrderIndex<K> {
  return { next: 0, keyToIdx: hamtEmpty(), idxToKey: emptyVec(), holes: 0 };
}

export function orderFromBase<K, V>(base: Map<K, V>): OrderIndex<K, V> {
  let keyToIdx = hamtEmpty<K, number>();
  const keys: (K | typeof DELETED)[] = [];
  const vals: (V | typeof DELETED)[] = [];
  let i = 0;
  const owner: Owner = {};
  for (const [k, v] of base) {
    keyToIdx = hamtSet(keyToIdx, owner, k, i);
    keys.push(k);
    vals.push(v);
    i++;
  }
  return { next: i, keyToIdx, idxToKey: vecFromArray(keys), idxToVal: vecFromArray(vals), holes: 0 };
}

export function orderAppend<K>(ord: OrderIndex<K>, owner: Owner, key: K): OrderIndex<K> {
  const idx = ord.next;
  return {
    next: idx + 1,
    keyToIdx: hamtSet(ord.keyToIdx, owner, key, idx),
    idxToKey: vecPush(ord.idxToKey, owner, key),
    holes: ord.holes,
  };
}

export function orderAppendWithValue<K, V>(ord: OrderIndex<K, V>, owner: Owner, key: K, value: V): OrderIndex<K, V> {
  const idx = ord.next;
  return {
    next: idx + 1,
    keyToIdx: hamtSet(ord.keyToIdx, owner, key, idx),
    idxToKey: vecPush(ord.idxToKey, owner, key),
    idxToVal: ord.idxToVal ? vecPush(ord.idxToVal, owner, value) : undefined,
    holes: ord.holes,
  };
}

export function orderUpdateValue<K, V>(ord: OrderIndex<K, V>, owner: Owner, key: K, value: V): OrderIndex<K, V> {
  if (!ord.idxToVal) return ord;
  const idx = hamtGet(ord.keyToIdx, key);
  if (idx === undefined) return ord;
  return {
    next: ord.next,
    keyToIdx: ord.keyToIdx,
    idxToKey: ord.idxToKey,
    idxToVal: vecAssoc(ord.idxToVal, owner, idx, value),
    holes: ord.holes,
  };
}

export function orderCompact<K, V>(ord: OrderIndex<K, V>, owner: Owner): OrderIndex<K, V> {
  if (ord.holes === 0) return ord;
  let newKeyToIdx = hamtEmpty<K, number>();
  const newKeys: (K | typeof DELETED)[] = [];
  const newVals: (V | typeof DELETED)[] | undefined = ord.idxToVal ? [] : undefined;
  let newIdx = 0;

  const keyLen = ord.idxToKey.count;
  for (let i = 0; i < keyLen; i++) {
    const k = vecGet(ord.idxToKey, i);
    if (k !== DELETED) {
      newKeyToIdx = hamtSet(newKeyToIdx, owner, k as K, newIdx);
      newKeys.push(k as K);
      if (newVals && ord.idxToVal) {
        newVals.push(vecGet(ord.idxToVal, i) as V);
      }
      newIdx++;
    }
  }

  return {
    next: newIdx,
    keyToIdx: newKeyToIdx,
    idxToKey: vecFromArray(newKeys),
    idxToVal: newVals ? vecFromArray(newVals) : undefined,
    holes: 0,
  };
}

export function orderDelete<K, V>(ord: OrderIndex<K, V>, owner: Owner, key: K): OrderIndex<K, V> {
  const idx = hamtGet(ord.keyToIdx, key);
  if (idx === undefined) return ord;
  const newHoles = ord.holes + 1;
  const result: OrderIndex<K, V> = {
    next: ord.next,
    keyToIdx: hamtDelete(ord.keyToIdx, owner, key),
    idxToKey: vecAssoc(ord.idxToKey, owner, idx, DELETED),
    idxToVal: ord.idxToVal ? vecAssoc(ord.idxToVal, owner, idx, DELETED) : undefined,
    holes: newHoles,
  };
  if (newHoles > ord.next * ORDER_COMPACT_RATIO && ord.next > 32) {
    return orderCompact(result, owner);
  }
  return result;
}

export function* orderIter<K>(ord: OrderIndex<K>): IterableIterator<K> {
  for (const k of vecIter(ord.idxToKey)) {
    if (k !== DELETED) yield k as K;
  }
}

export function* orderEntryIter<K, V>(ord: OrderIndex<K, V>): IterableIterator<[K, V]> {
  if (!ord.idxToVal) return;
  const keyIter = vecIter(ord.idxToKey);
  const valIter = vecIter(ord.idxToVal);
  while (true) {
    const k = keyIter.next();
    const v = valIter.next();
    if (k.done || v.done) break;
    if (k.value !== DELETED) {
      yield [k.value as K, v.value as V];
    }
  }
}

export function orderFromSetBase<T>(base: Set<T>): OrderIndex<T> {
  let keyToIdx = hamtEmpty<T, number>();
  const keys: (T | typeof DELETED)[] = [];
  let i = 0;
  const owner: Owner = {};
  for (const v of base) {
    keyToIdx = hamtSet(keyToIdx, owner, v, i);
    keys.push(v);
    i++;
  }
  return { next: i, keyToIdx, idxToKey: vecFromArray(keys), holes: 0 };
}
