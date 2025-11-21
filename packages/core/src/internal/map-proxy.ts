/**
 * Map Proxy - HAMT-based persistent Map with Map-like interface
 */

import type { Owner } from './types';
import {
  hamtEmpty,
  hamtGet,
  hamtHas,
  hamtSet,
  hamtDelete,
  hamtFromMap,
  hamtIter,
  hamtToEntries,
  type HMap,
  orderEmpty,
  orderFromBase,
  orderAppendWithValue,
  orderUpdateValue,
  orderDelete,
  orderIter,
  orderEntryIter,
  type OrderIndex,
  createNestedProxy,
  createNestedMapProxy,
  createNestedSetProxy,
  extractNestedValue,
} from './index';

export interface HMapState<K, V> {
  map: HMap<K, V>;
  isDraft: boolean;
  owner?: Owner;
  modified: boolean;
  valueProxies?: Map<K, any>;
  ordered?: OrderIndex<K, V> | null;
}

export const MAP_STATE_ENV = new WeakMap<any, HMapState<any, any>>();

export function createMapProxy<K, V>(state: HMapState<K, V>): Map<K, V> {
  if (state.isDraft) {
    state.valueProxies = new Map();
  }

  const target = new Map<K, V>();
  const proxy = new Proxy(target, {
    get(target, prop, receiver) {
      if (prop === '__PURA_MAP_STATE__') return state;
      if (prop === 'size') return state.map.size;

      if (prop === 'get') {
        return (key: K): V | undefined => {
          if (state.isDraft && state.valueProxies?.has(key)) {
            return state.valueProxies.get(key);
          }
          const raw = hamtGet(state.map, key);
          if (state.isDraft && raw !== null && typeof raw === 'object') {
            let nestedProxy: any;
            if (raw instanceof Map) {
              nestedProxy = createNestedMapProxy(raw as Map<any, any>, () => {
                state.modified = true;
              });
            } else if (raw instanceof Set) {
              nestedProxy = createNestedSetProxy(raw as Set<any>, () => {
                state.modified = true;
              });
            } else {
              nestedProxy = createNestedProxy(raw as any, () => {
                state.modified = true;
              });
            }
            state.valueProxies!.set(key, nestedProxy);
            return nestedProxy;
          }
          return raw;
        };
      }

      if (prop === 'has') {
        return (key: K): boolean => hamtHas(state.map, key);
      }

      if (prop === 'set') {
        return (key: K, value: V) => {
          const had = hamtHas(state.map, key);
          state.map = hamtSet(state.map, state.owner, key, value);
          if (state.ordered) {
            if (had) {
              state.ordered = orderUpdateValue(state.ordered, state.owner, key, value);
            } else {
              state.ordered = orderAppendWithValue(state.ordered, state.owner, key, value);
            }
          }
          state.modified = true;
          state.valueProxies?.delete(key);
          return proxy;
        };
      }

      if (prop === 'delete') {
        return (key: K) => {
          const before = state.map.size;
          state.map = hamtDelete(state.map, state.owner, key);
          const removed = state.map.size !== before;
          if (removed) {
            if (state.ordered) {
              state.ordered = orderDelete(state.ordered, state.owner, key);
            }
            state.modified = true;
            state.valueProxies?.delete(key);
          }
          return removed;
        };
      }

      if (prop === 'clear') {
        return () => {
          if (state.map.size === 0) return;
          state.map = hamtEmpty<K, V>();
          if (state.ordered) {
            state.ordered = orderEmpty<K>();
          }
          state.modified = true;
          state.valueProxies?.clear();
        };
      }

      const iterKeys = function* (): IterableIterator<K> {
        if (state.ordered) {
          yield* orderIter(state.ordered);
        } else {
          for (const [k] of hamtIter(state.map)) {
            yield k;
          }
        }
      };

      const wrapValue = (key: K, raw: V): V => {
        if (!state.isDraft) return raw;
        if (state.valueProxies?.has(key)) return state.valueProxies.get(key);
        if (raw !== null && typeof raw === 'object') {
          let nestedProxy: any;
          if (raw instanceof Map) {
            nestedProxy = createNestedMapProxy(raw as Map<any, any>, () => { state.modified = true; });
          } else if (raw instanceof Set) {
            nestedProxy = createNestedSetProxy(raw as Set<any>, () => { state.modified = true; });
          } else {
            nestedProxy = createNestedProxy(raw as any, () => { state.modified = true; });
          }
          state.valueProxies!.set(key, nestedProxy);
          return nestedProxy;
        }
        return raw;
      };

      if (prop === Symbol.iterator || prop === 'entries') {
        return function* () {
          if (state.ordered?.idxToVal) {
            for (const [k, rawV] of orderEntryIter(state.ordered)) {
              yield [k, wrapValue(k, rawV)] as [K, V];
            }
          } else {
            for (const k of iterKeys()) {
              const rawV = hamtGet(state.map, k) as V;
              yield [k, wrapValue(k, rawV)] as [K, V];
            }
          }
        };
      }

      if (prop === 'keys') {
        return function* () {
          yield* iterKeys();
        };
      }

      if (prop === 'values') {
        return function* () {
          if (state.ordered?.idxToVal) {
            for (const [k, rawV] of orderEntryIter(state.ordered)) {
              yield wrapValue(k, rawV);
            }
          } else {
            for (const k of iterKeys()) {
              const rawV = hamtGet(state.map, k) as V;
              yield wrapValue(k, rawV);
            }
          }
        };
      }

      if (prop === 'forEach') {
        return (cb: (value: V, key: K, map: Map<K, V>) => void, thisArg?: any) => {
          if (state.ordered?.idxToVal) {
            for (const [k, rawV] of orderEntryIter(state.ordered)) {
              cb.call(thisArg, wrapValue(k, rawV), k, proxy);
            }
          } else {
            for (const k of iterKeys()) {
              const rawV = hamtGet(state.map, k) as V;
              cb.call(thisArg, wrapValue(k, rawV), k, proxy);
            }
          }
        };
      }

      if (prop === 'toJSON') {
        return () => {
          const obj: any = {};
          if (state.ordered?.idxToVal) {
            for (const [k, v] of orderEntryIter(state.ordered)) {
              obj[String(k)] = v;
            }
          } else {
            for (const [k, v] of hamtToEntries(state.map) as [any, any][]) {
              obj[String(k)] = v;
            }
          }
          return obj;
        };
      }

      return Reflect.get(target, prop, receiver);
    },
  });

  MAP_STATE_ENV.set(proxy, state);
  return proxy;
}

export function produceMap<K, V>(
  base: Map<K, V>,
  recipe: (draft: Map<K, V>) => void
): Map<K, V> {
  let baseMap: HMap<K, V>;
  let baseOrdered: OrderIndex<K> | null = null;
  const baseState = MAP_STATE_ENV.get(base as any);
  if (baseState) {
    baseMap = baseState.map;
    baseOrdered = baseState.ordered || null;
  } else {
    baseMap = hamtFromMap(base);
  }

  const draftOwner: Owner = {};
  const draftState: HMapState<K, V> = {
    map: baseMap,
    isDraft: true,
    owner: draftOwner,
    modified: false,
    ordered: baseOrdered,
  };

  const draft = createMapProxy<K, V>(draftState);
  recipe(draft);

  if (draftState.valueProxies && draftState.valueProxies.size > 0) {
    for (const [key, nestedProxy] of draftState.valueProxies) {
      const finalVal = extractNestedValue(nestedProxy);
      const current = hamtGet(draftState.map, key);
      if (current !== finalVal) {
        draftState.map = hamtSet(
          draftState.map,
          draftOwner,
          key,
          finalVal as V
        );
        draftState.modified = true;
      }
    }
  }

  if (!draftState.modified) {
    return base;
  }

  const finalState: HMapState<K, V> = {
    map: draftState.map,
    isDraft: false,
    owner: undefined,
    modified: false,
    ordered: draftState.ordered,
  };

  return createMapProxy<K, V>(finalState);
}
