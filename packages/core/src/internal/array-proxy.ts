/**
 * Array Proxy - Persistent vector with Array-like interface
 */

import type { Owner, Node, Vec } from './types';
import {
  BITS,
  MASK,
  getStringIndex,
  emptyVec,
  vecPush,
  vecPop,
  vecGet,
  vecAssoc,
  vecFromArray,
  vecToArray,
  vecIter,
  vecConcat,
  vecSlice,
  createNestedProxy,
  createNestedMapProxy,
  createNestedSetProxy,
  extractNestedValue,
} from './index';

export interface PuraArrayState<T> {
  vec: Vec<T>;
  isDraft: boolean;
  owner?: Owner;
  modified: boolean;
  proxies?: Map<number, any>;
  cachedLeaf?: T[];
  cachedLeafStart?: number;
  methodCache?: Map<string | symbol, Function>;
}

export const ARRAY_STATE_ENV = new WeakMap<any[], PuraArrayState<any>>();

function vecGetCached<T>(state: PuraArrayState<T>, index: number): T | undefined {
  const { vec } = state;
  const { count, treeCount } = vec;
  if (index < 0 || index >= count) return undefined;

  if (index >= treeCount) {
    return vec.tail[index - treeCount];
  }

  const leafStart = index & ~MASK;

  if (state.cachedLeaf && state.cachedLeafStart === leafStart) {
    return state.cachedLeaf[index & MASK];
  }

  const { shift, root } = vec;
  let node: Node<T> = root;
  let level = shift;

  while (level > 0) {
    node = node.arr[(index >>> level) & MASK] as Node<T>;
    level -= BITS;
  }

  state.cachedLeaf = node.arr as T[];
  state.cachedLeafStart = leafStart;

  return node.arr[index & MASK] as T;
}

export function createArrayProxy<T>(state: PuraArrayState<T>): T[] {
  if (state.isDraft) {
    state.proxies = new Map();
  }
  if (!state.isDraft) {
    state.methodCache = new Map();
  }

  const proxy = new Proxy([] as T[], {
    get(target, prop, receiver) {
      if (prop === '__PURA_STATE__') return state;
      if (prop === 'length') return state.vec.count;

      if (typeof prop === 'string') {
        const c0 = prop.charCodeAt(0);
        if (c0 >= 48 && c0 <= 57) {
          const len = prop.length;
          let idx = c0 - 48;
          for (let j = 1; j < len; j++) {
            const c = prop.charCodeAt(j);
            if (c < 48 || c > 57) { idx = -1; break; }
            idx = idx * 10 + (c - 48);
          }
          if (idx >= 0 && idx < state.vec.count) {
            const cachedProxy = state.proxies?.get(idx);
            if (cachedProxy) return cachedProxy;

            const { vec } = state;
            let value: T | undefined;
            if (idx >= vec.treeCount) {
              value = vec.tail[idx - vec.treeCount];
            } else {
              value = vecGetCached(state, idx);
            }

            if (state.isDraft && value !== null && typeof value === 'object') {
              let nestedProxy: any;
              if (value instanceof Map) {
                nestedProxy = createNestedMapProxy(value as Map<any, any>, () => {
                  state.modified = true;
                });
              } else if (value instanceof Set) {
                nestedProxy = createNestedSetProxy(value as Set<any>, () => {
                  state.modified = true;
                });
              } else {
                nestedProxy = createNestedProxy(value as object, () => {
                  state.modified = true;
                });
              }
              state.proxies!.set(idx, nestedProxy);
              return nestedProxy;
            }

            return value;
          }
        }
      }

      const getCachedMethod = (key: string | symbol, factory: () => Function): Function => {
        if (!state.methodCache) return factory();
        let fn = state.methodCache.get(key);
        if (!fn) {
          fn = factory();
          state.methodCache.set(key, fn);
        }
        return fn;
      };

      switch (prop) {
        case 'push':
          return (...items: T[]) => {
            for (const item of items) {
              state.vec = vecPush(state.vec, state.owner, item);
            }
            state.modified = true;
            state.cachedLeaf = undefined;
            return state.vec.count;
          };

        case 'pop':
          return () => {
            const res = vecPop(state.vec, state.owner);
            state.vec = res.vec;
            if (res.val !== undefined) {
              state.modified = true;
              state.cachedLeaf = undefined;
            }
            return res.val;
          };

        case 'toJSON':
          return getCachedMethod('toJSON', () => () => vecToArray(state.vec));

        case 'toString':
          return () => {
            let result = '';
            let first = true;
            for (const v of vecIter(state.vec)) {
              if (!first) result += ',';
              first = false;
              result += v == null ? '' : String(v);
            }
            return result;
          };

        case 'toLocaleString':
          return (...args: any[]) => {
            let result = '';
            let first = true;
            for (const v of vecIter(state.vec)) {
              if (!first) result += ',';
              first = false;
              if (v != null && typeof (v as any).toLocaleString === 'function') {
                result += (v as any).toLocaleString(...args);
              } else {
                result += v == null ? '' : String(v);
              }
            }
            return result;
          };

        case Symbol.iterator:
          return function* () {
            const v = state.vec;
            if (!state.isDraft) {
              yield* vecIter(v);
            } else {
              let i = 0;
              for (const val of vecIter(v)) {
                if (val !== null && typeof val === 'object') {
                  let nested = state.proxies?.get(i);
                  if (!nested) {
                    if (val instanceof Map) {
                      nested = createNestedMapProxy(val as Map<any, any>, () => { state.modified = true; });
                    } else if (val instanceof Set) {
                      nested = createNestedSetProxy(val as Set<any>, () => { state.modified = true; });
                    } else {
                      nested = createNestedProxy(val, () => { state.modified = true; });
                    }
                    state.proxies!.set(i, nested);
                  }
                  yield nested;
                } else {
                  yield val;
                }
                i++;
              }
            }
          };

        case 'map':
          return (fn: (v: T, i: number, a: T[]) => any, thisArg?: any) => {
            const result: any[] = [];
            let i = 0;
            for (const v of vecIter(state.vec)) {
              result.push(fn.call(thisArg, v, i++, proxy));
            }
            return result;
          };

        case 'filter':
          return (fn: (v: T, i: number, a: T[]) => boolean, thisArg?: any) => {
            const result: T[] = [];
            let i = 0;
            for (const v of vecIter(state.vec)) {
              if (fn.call(thisArg, v, i++, proxy)) {
                result.push(v);
              }
            }
            return result;
          };

        case 'reduce':
          return (...reduceArgs: any[]) => {
            const fn = reduceArgs[0] as (acc: any, v: T, i: number, a: T[]) => any;
            let acc: any;
            let i = 0;
            let started = reduceArgs.length > 1;
            if (started) acc = reduceArgs[1];
            for (const v of vecIter(state.vec)) {
              if (!started) {
                acc = v;
                started = true;
              } else {
                acc = fn(acc, v, i, proxy);
              }
              i++;
            }
            return acc;
          };

        case 'forEach':
          return (fn: (v: T, i: number, a: T[]) => void, thisArg?: any) => {
            let i = 0;
            for (const v of vecIter(state.vec)) {
              fn.call(thisArg, v, i++, proxy);
            }
          };

        case 'some':
          return (fn: (v: T, i: number, a: T[]) => boolean, thisArg?: any) => {
            let i = 0;
            for (const v of vecIter(state.vec)) {
              if (fn.call(thisArg, v, i++, proxy)) return true;
            }
            return false;
          };

        case 'every':
          return (fn: (v: T, i: number, a: T[]) => boolean, thisArg?: any) => {
            let i = 0;
            for (const v of vecIter(state.vec)) {
              if (!fn.call(thisArg, v, i++, proxy)) return false;
            }
            return true;
          };

        case 'find':
          return (fn: (v: T, i: number, a: T[]) => boolean, thisArg?: any) => {
            let i = 0;
            for (const v of vecIter(state.vec)) {
              if (fn.call(thisArg, v, i++, proxy)) return v;
            }
            return undefined;
          };

        case 'findIndex':
          return (fn: (v: T, i: number, a: T[]) => boolean, thisArg?: any) => {
            let i = 0;
            for (const v of vecIter(state.vec)) {
              if (fn.call(thisArg, v, i, proxy)) return i;
              i++;
            }
            return -1;
          };

        case 'includes':
          return (search: T, fromIndex?: number) => {
            let i = 0;
            const start = fromIndex ?? 0;
            for (const v of vecIter(state.vec)) {
              if (i >= start && (v === search || (Number.isNaN(search) && Number.isNaN(v as any)))) {
                return true;
              }
              i++;
            }
            return false;
          };

        case 'indexOf':
          return (search: T, fromIndex?: number) => {
            let i = 0;
            const start = fromIndex ?? 0;
            for (const v of vecIter(state.vec)) {
              if (i >= start && v === search) return i;
              i++;
            }
            return -1;
          };

        case 'lastIndexOf':
          return (search: T, fromIndex?: number) => {
            const len = state.vec.count;
            const start = fromIndex === undefined ? len - 1 : Math.min(fromIndex, len - 1);
            let lastMatch = -1;
            let i = 0;
            for (const v of vecIter(state.vec)) {
              if (i <= start && v === search) lastMatch = i;
              i++;
            }
            return lastMatch;
          };

        case 'at':
          return (index: number) => {
            const len = state.vec.count;
            const idx = index < 0 ? len + index : index;
            if (idx < 0 || idx >= len) return undefined;
            return vecGetCached(state, idx);
          };

        case 'keys':
          return function* () {
            for (let i = 0; i < state.vec.count; i++) yield i;
          };

        case 'values':
          return function* () {
            yield* vecIter(state.vec);
          };

        case 'entries':
          return function* () {
            let i = 0;
            for (const v of vecIter(state.vec)) {
              yield [i++, v] as [number, T];
            }
          };

        case 'slice':
          return (start?: number, end?: number) => {
            const len = state.vec.count;
            let s = start === undefined ? 0 : start < 0 ? Math.max(len + start, 0) : Math.min(start, len);
            let e = end === undefined ? len : end < 0 ? Math.max(len + end, 0) : Math.min(end, len);
            if (s >= e) return [];
            const resultLen = e - s;
            const result = new Array(resultLen);
            for (let i = 0; i < resultLen; i++) {
              result[i] = vecGetCached(state, s + i);
            }
            return result;
          };

        case 'join':
          return (separator?: string) => {
            const sep = separator === undefined ? ',' : separator;
            let result = '';
            let first = true;
            for (const v of vecIter(state.vec)) {
              if (!first) result += sep;
              first = false;
              result += v == null ? '' : String(v);
            }
            return result;
          };

        case 'concat':
          return (...args: any[]) => {
            const result: T[] = [];
            for (const v of vecIter(state.vec)) {
              result.push(v);
            }
            for (const arg of args) {
              if (Array.isArray(arg)) {
                const argState = ARRAY_STATE_ENV.get(arg);
                if (argState) {
                  for (const v of vecIter(argState.vec)) {
                    result.push(v);
                  }
                } else {
                  for (const v of arg) {
                    result.push(v);
                  }
                }
              } else {
                result.push(arg);
              }
            }
            return result;
          };

        case 'flat':
          return (depth = 1) => {
            const result: any[] = [];
            const flatten = (arr: Iterable<any>, d: number) => {
              for (const v of arr) {
                if (d > 0 && Array.isArray(v)) {
                  const vState = ARRAY_STATE_ENV.get(v);
                  if (vState) {
                    flatten(vecIter(vState.vec), d - 1);
                  } else {
                    flatten(v, d - 1);
                  }
                } else {
                  result.push(v);
                }
              }
            };
            flatten(vecIter(state.vec), depth);
            return result;
          };

        case 'flatMap':
          return (fn: (v: T, i: number, a: T[]) => any, thisArg?: any) => {
            const result: any[] = [];
            let i = 0;
            for (const v of vecIter(state.vec)) {
              const mapped = fn.call(thisArg, v, i++, proxy);
              if (Array.isArray(mapped)) {
                const mState = ARRAY_STATE_ENV.get(mapped);
                if (mState) {
                  for (const m of vecIter(mState.vec)) {
                    result.push(m);
                  }
                } else {
                  for (const m of mapped) {
                    result.push(m);
                  }
                }
              } else {
                result.push(mapped);
              }
            }
            return result;
          };

        case 'reduceRight':
          return (...reduceArgs: any[]) => {
            const fn = reduceArgs[0] as (acc: any, v: T, i: number, a: T[]) => any;
            const len = state.vec.count;
            const values: T[] = [];
            for (const v of vecIter(state.vec)) {
              values.push(v);
            }
            let acc: any;
            let started = reduceArgs.length > 1;
            if (started) acc = reduceArgs[1];
            for (let i = len - 1; i >= 0; i--) {
              const v = values[i];
              if (!started) {
                acc = v;
                started = true;
              } else {
                acc = fn(acc, v, i, proxy);
              }
            }
            return acc;
          };

        case 'findLast':
          return (fn: (v: T, i: number, a: T[]) => boolean, thisArg?: any) => {
            const values: T[] = [];
            for (const v of vecIter(state.vec)) {
              values.push(v);
            }
            for (let i = values.length - 1; i >= 0; i--) {
              if (fn.call(thisArg, values[i], i, proxy)) return values[i];
            }
            return undefined;
          };

        case 'findLastIndex':
          return (fn: (v: T, i: number, a: T[]) => boolean, thisArg?: any) => {
            const values: T[] = [];
            for (const v of vecIter(state.vec)) {
              values.push(v);
            }
            for (let i = values.length - 1; i >= 0; i--) {
              if (fn.call(thisArg, values[i], i, proxy)) return i;
            }
            return -1;
          };

        case 'toReversed':
          return () => {
            const result: T[] = [];
            for (const v of vecIter(state.vec)) {
              result.push(v);
            }
            result.reverse();
            return result;
          };

        case 'toSorted':
          return (compareFn?: (a: T, b: T) => number) => {
            const arr: T[] = [];
            for (const v of vecIter(state.vec)) {
              arr.push(v);
            }
            return arr.sort(compareFn);
          };

        case 'toSpliced':
          return (start: number, deleteCount?: number, ...items: T[]) => {
            const len = state.vec.count;
            const s = start < 0 ? Math.max(len + start, 0) : Math.min(start, len);
            const dc = deleteCount === undefined ? len - s : Math.max(0, deleteCount);
            const result: T[] = [];
            for (let i = 0; i < s; i++) {
              result.push(vecGetCached(state, i) as T);
            }
            for (const item of items) {
              result.push(item);
            }
            for (let i = s + dc; i < len; i++) {
              result.push(vecGetCached(state, i) as T);
            }
            return result;
          };

        case 'with':
          return (index: number, value: T) => {
            const len = state.vec.count;
            const idx = index < 0 ? len + index : index;
            if (idx < 0 || idx >= len) throw new RangeError('Invalid index');
            const result: T[] = [];
            for (const v of vecIter(state.vec)) {
              result.push(v);
            }
            result[idx] = value;
            return result;
          };

        case 'fill':
          return (value: T, start?: number, end?: number) => {
            const len = state.vec.count;
            const s = start === undefined ? 0 : start < 0 ? Math.max(len + start, 0) : Math.min(start, len);
            const e = end === undefined ? len : end < 0 ? Math.max(len + end, 0) : Math.min(end, len);
            for (let i = s; i < e; i++) {
              state.vec = vecAssoc(state.vec, state.owner, i, value);
            }
            if (s < e) {
              state.modified = true;
              state.cachedLeaf = undefined;
            }
            return proxy;
          };

        case 'copyWithin':
          return (target: number, start?: number, end?: number) => {
            const len = state.vec.count;
            let t = target < 0 ? Math.max(len + target, 0) : Math.min(target, len);
            const s = start === undefined ? 0 : start < 0 ? Math.max(len + start, 0) : Math.min(start, len);
            const e = end === undefined ? len : end < 0 ? Math.max(len + end, 0) : Math.min(end, len);
            const count = Math.min(e - s, len - t);
            for (let i = 0; i < count; i++) {
              const v = vecGet(state.vec, s + i);
              state.vec = vecAssoc(state.vec, state.owner, t + i, v as T);
            }
            if (count > 0) {
              state.modified = true;
              state.cachedLeaf = undefined;
            }
            return proxy;
          };

        case 'shift':
          return () => {
            if (state.vec.count === 0) return undefined;
            const first = vecGetCached(state, 0);
            state.vec = vecSlice(state.vec, state.owner, 1, state.vec.count);
            state.modified = true;
            state.cachedLeaf = undefined;
            state.proxies?.clear();
            return first;
          };

        case 'unshift':
          return (...items: T[]) => {
            if (items.length === 0) return state.vec.count;
            const owner: Owner = {};
            let prefixVec = emptyVec<T>();
            for (const item of items) {
              prefixVec = vecPush(prefixVec, owner, item);
            }
            state.vec = vecConcat(prefixVec, state.vec, owner);
            state.modified = true;
            state.cachedLeaf = undefined;
            state.proxies?.clear();
            return state.vec.count;
          };

        case 'splice':
          return (start: number, deleteCount?: number, ...items: T[]) => {
            const len = state.vec.count;
            const s = start < 0 ? Math.max(len + start, 0) : Math.min(start, len);
            const dc = deleteCount === undefined ? len - s : Math.max(0, Math.min(deleteCount, len - s));

            const deleted: T[] = [];
            for (let i = 0; i < dc; i++) {
              deleted.push(vecGetCached(state, s + i) as T);
            }

            const owner: Owner = {};
            const left = s > 0 ? vecSlice(state.vec, owner, 0, s) : emptyVec<T>();
            const right = s + dc < len ? vecSlice(state.vec, owner, s + dc, len) : emptyVec<T>();

            let middle = emptyVec<T>();
            for (const item of items) {
              middle = vecPush(middle, owner, item);
            }

            let newVec = left;
            if (middle.count > 0) {
              newVec = vecConcat(newVec, middle, owner);
            }
            if (right.count > 0) {
              newVec = vecConcat(newVec, right, owner);
            }

            state.vec = newVec;
            state.modified = true;
            state.cachedLeaf = undefined;
            state.proxies?.clear();
            return deleted;
          };

        case 'reverse':
          return () => {
            const len = state.vec.count;
            if (len <= 1) return proxy;
            const values: T[] = [];
            for (const v of vecIter(state.vec)) {
              values.push(v);
            }
            values.reverse();
            let newVec = emptyVec<T>();
            const owner: Owner = {};
            for (const v of values) {
              newVec = vecPush(newVec, owner, v);
            }
            state.vec = newVec;
            state.modified = true;
            state.cachedLeaf = undefined;
            state.proxies?.clear();
            return proxy;
          };

        case 'sort':
          return (compareFn?: (a: T, b: T) => number) => {
            const arr: T[] = [];
            for (const v of vecIter(state.vec)) {
              arr.push(v);
            }
            arr.sort(compareFn);
            let newVec = emptyVec<T>();
            const owner: Owner = {};
            for (const v of arr) {
              newVec = vecPush(newVec, owner, v);
            }
            state.vec = newVec;
            state.modified = true;
            state.cachedLeaf = undefined;
            state.proxies?.clear();
            return proxy;
          };
      }

      return Reflect.get(target, prop, receiver);
    },

    set(target, prop, value, receiver) {
      if (prop === 'length') {
        const newLen = Number(value);
        if (!Number.isInteger(newLen) || newLen < 0) return false;
        if (newLen === state.vec.count) return true;
        if (newLen < state.vec.count) {
          while (state.vec.count > newLen) {
            const res = vecPop(state.vec, state.owner);
            state.vec = res.vec;
          }
          state.modified = true;
          state.cachedLeaf = undefined;
          state.proxies?.clear();
          return true;
        }
        while (state.vec.count < newLen) {
          state.vec = vecPush(state.vec, state.owner, undefined as unknown as T);
        }
        state.modified = true;
        state.cachedLeaf = undefined;
        return true;
      }

      if (typeof prop === 'string') {
        const c0 = prop.charCodeAt(0);
        if (c0 >= 48 && c0 <= 57) {
          const len = prop.length;
          let idx = c0 - 48;
          for (let j = 1; j < len; j++) {
            const c = prop.charCodeAt(j);
            if (c < 48 || c > 57) { idx = -1; break; }
            idx = idx * 10 + (c - 48);
          }
          if (idx >= 0) {
            if (idx < state.vec.count) {
              state.vec = vecAssoc(state.vec, state.owner, idx, value);
              state.modified = true;
              state.cachedLeaf = undefined;
              state.proxies?.delete(idx);
              return true;
            }
            if (idx === state.vec.count) {
              state.vec = vecPush(state.vec, state.owner, value);
              state.modified = true;
              state.cachedLeaf = undefined;
              return true;
            }
          }
        }
      }

      return false;
    },

    ownKeys() {
      const count = state.vec.count;
      const keys: (string | symbol)[] = new Array(count + 1);
      for (let i = 0; i < count; i++) {
        keys[i] = getStringIndex(i);
      }
      keys[count] = 'length';
      return keys;
    },

    getOwnPropertyDescriptor(target, prop) {
      if (prop === 'length') {
        return {
          value: state.vec.count,
          writable: true,
          enumerable: false,
          configurable: false,
        };
      }
      if (typeof prop === 'string') {
        const idx = Number(prop);
        if (!Number.isNaN(idx) && idx >= 0 && idx < state.vec.count) {
          return {
            value: vecGet(state.vec, idx),
            writable: true,
            enumerable: true,
            configurable: true,
          };
        }
      }
      return undefined;
    },

    has(target, prop) {
      if (prop === 'length') return true;
      if (typeof prop === 'string') {
        const idx = Number(prop);
        if (!Number.isNaN(idx)) return idx >= 0 && idx < state.vec.count;
      }
      return prop in target;
    },
  });

  ARRAY_STATE_ENV.set(proxy, state);
  return proxy;
}

export function produceArray<T>(base: T[], recipe: (draft: T[]) => void): T[] {
  const baseState = ARRAY_STATE_ENV.get(base);
  const baseVec = baseState ? baseState.vec : vecFromArray(base);

  const draftOwner: Owner = {};
  const draftVec: Vec<T> = {
    count: baseVec.count,
    shift: baseVec.shift,
    root: baseVec.root,
    tail: baseVec.tail,
    treeCount: baseVec.treeCount,
  };

  const draftState: PuraArrayState<T> = {
    vec: draftVec,
    isDraft: true,
    owner: draftOwner,
    modified: false,
  };

  const draft = createArrayProxy<T>(draftState);

  recipe(draft);

  if (draftState.proxies && draftState.proxies.size > 0) {
    for (const [idx, nestedProxy] of draftState.proxies) {
      const finalValue = extractNestedValue(nestedProxy);
      if (finalValue !== vecGet(draftState.vec, idx)) {
        draftState.vec = vecAssoc(
          draftState.vec,
          draftOwner,
          idx,
          finalValue as T
        );
        draftState.modified = true;
      }
    }
  }

  if (!draftState.modified) {
    return base;
  }

  const finalState: PuraArrayState<T> = {
    vec: draftState.vec,
    isDraft: false,
    owner: undefined,
    modified: false,
  };

  return createArrayProxy<T>(finalState);
}
