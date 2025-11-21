/**
 * Pura v4.5 Diamond – Vec + Object + HAMT Map + HAMT Set
 *
 * - pura([])        → Bit-trie persistent vector proxy
 * - pura({})        → Deep Immer-style object proxy
 * - pura(new Map)   → HAMT-style persistent Map proxy
 * - pura(new Set)   → HAMT-style persistent Set proxy
 * - produce(...)    → 同一 API 操作四種結構
 */

// Internal modules
import {
  BITS,
  MASK,
  STRING_INDEX_CACHE_SIZE,
  STRING_INDICES,
  NESTED_PROXY_STATE,
  NESTED_MAP_STATE,
  NESTED_SET_STATE,
  PROXY_CACHE,
  getStringIndex,
  type Owner,
  type Node,
  type Vec,
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
  orderAppend,
  orderAppendWithValue,
  orderUpdateValue,
  orderDelete,
  orderIter,
  orderEntryIter,
  orderFromSetBase,
  type OrderIndex,
  createNestedProxy,
  createNestedMapProxy,
  createNestedSetProxy,
  isProxyModified,
  extractNestedValue,
  type NestedProxyState,
  type NestedMapState,
  type NestedSetState,
} from './internal';

// =====================================================
// Array Proxy State & Handler
// =====================================================

interface PuraArrayState<T> {
  vec: Vec<T>;
  isDraft: boolean;
  owner?: Owner;
  modified: boolean;
  proxies?: Map<number, any>;
  cachedLeaf?: T[];
  cachedLeafStart?: number;
  // Cached method closures to avoid re-allocation on each access
  methodCache?: Map<string | symbol, Function>;
}

const ARRAY_STATE_ENV = new WeakMap<any[], PuraArrayState<any>>();

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

function createArrayProxy<T>(state: PuraArrayState<T>): T[] {
  if (state.isDraft) {
    state.proxies = new Map();
  }
  // Initialize method cache for non-draft proxies (read-heavy)
  if (!state.isDraft) {
    state.methodCache = new Map();
  }

  const proxy = new Proxy([] as T[], {
    get(target, prop, receiver) {
      if (prop === '__PURA_STATE__') return state;
      if (prop === 'length') return state.vec.count;

      if (typeof prop === 'string') {
        // Fast path for common numeric indices (0-9999)
        const c0 = prop.charCodeAt(0);
        if (c0 >= 48 && c0 <= 57) { // '0' to '9'
          const len = prop.length;
          let idx = c0 - 48;
          // Parse manually for speed (avoids Number() overhead)
          for (let j = 1; j < len; j++) {
            const c = prop.charCodeAt(j);
            if (c < 48 || c > 57) { idx = -1; break; }
            idx = idx * 10 + (c - 48);
          }
          if (idx >= 0 && idx < state.vec.count) {
            const cachedProxy = state.proxies?.get(idx);
            if (cachedProxy) return cachedProxy;

            // Inline tail access (most common case - avoids function call overhead)
            const { vec } = state;
            let value: T | undefined;
            if (idx >= vec.treeCount) {
              // Direct tail access - O(1)
              value = vec.tail[idx - vec.treeCount];
            } else {
              // Tree access - use cached leaf
              value = vecGetCached(state, idx);
            }

            if (
              state.isDraft &&
              value !== null &&
              typeof value === 'object'
            ) {
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

      // Helper to cache method closures (only for non-draft, read-only methods)
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
            // Same as join(',')
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
              // Fast path: non-draft mode uses efficient tree traversal
              yield* vecIter(v);
            } else {
              // Draft mode: need index tracking for nested proxy caching
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
            // Need to iterate and track last match
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
            // Normalize indices like Array.prototype.slice
            let s = start === undefined ? 0 : start < 0 ? Math.max(len + start, 0) : Math.min(start, len);
            let e = end === undefined ? len : end < 0 ? Math.max(len + end, 0) : Math.min(end, len);
            if (s >= e) return [];
            const resultLen = e - s;
            const result = new Array(resultLen);
            // Use vecGetCached for sequential access with leaf caching
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
            // Build result array using iteration (no intermediate full copy)
            const result: T[] = [];
            for (const v of vecIter(state.vec)) {
              result.push(v);
            }
            for (const arg of args) {
              if (Array.isArray(arg)) {
                // If arg is a Pura array, use vecIter for efficiency
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
            // Collect O(n) then iterate backwards (vs O(n log n) random access)
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
            // Collect O(n) then iterate backwards (vs O(n log n) random access)
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
            // Collect O(n) then iterate backwards (vs O(n log n) random access)
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
            // Use O(n) forward iteration then reverse, instead of O(n log n) random access
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
            // Copy before start (use cache for sequential access)
            for (let i = 0; i < s; i++) {
              result.push(vecGetCached(state, i) as T);
            }
            // Insert items
            for (const item of items) {
              result.push(item);
            }
            // Copy after deleted portion (use cache for sequential access)
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
            // In draft mode, use vecAssoc for each position
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
            // Copy elements using vecGet and vecAssoc
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
            // Use O(log n) vecSlice instead of O(n) rebuild
            state.vec = vecSlice(state.vec, state.owner, 1, state.vec.count);
            state.modified = true;
            state.cachedLeaf = undefined;
            state.proxies?.clear();
            return first;
          };

        case 'unshift':
          return (...items: T[]) => {
            if (items.length === 0) return state.vec.count;
            // Build prefix vec then concat with existing - O(log n) instead of O(n)
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

            // Collect deleted items (use cache for sequential access)
            const deleted: T[] = [];
            for (let i = 0; i < dc; i++) {
              deleted.push(vecGetCached(state, s + i) as T);
            }

            // Use O(log n) vecSlice + vecConcat instead of O(n) rebuild
            const owner: Owner = {};
            const left = s > 0 ? vecSlice(state.vec, owner, 0, s) : emptyVec<T>();
            const right = s + dc < len ? vecSlice(state.vec, owner, s + dc, len) : emptyVec<T>();

            // Build middle section with inserted items
            let middle = emptyVec<T>();
            for (const item of items) {
              middle = vecPush(middle, owner, item);
            }

            // Concat: left + middle + right
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
            // Collect forward O(n) then reverse (vs O(n log n) backward vecGet)
            const values: T[] = [];
            for (const v of vecIter(state.vec)) {
              values.push(v);
            }
            values.reverse();
            // Rebuild vec from reversed array
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
            // Collect items, sort, rebuild
            const arr: T[] = [];
            for (const v of vecIter(state.vec)) {
              arr.push(v);
            }
            arr.sort(compareFn);
            // Rebuild vec
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
      // Handle length assignment
      if (prop === 'length') {
        const newLen = Number(value);
        if (!Number.isInteger(newLen) || newLen < 0) return false;
        if (newLen === state.vec.count) return true;
        if (newLen < state.vec.count) {
          // Truncate
          while (state.vec.count > newLen) {
            const res = vecPop(state.vec, state.owner);
            state.vec = res.vec;
          }
          state.modified = true;
          state.cachedLeaf = undefined;
          state.proxies?.clear();
          return true;
        }
        // Expand: push undefined values
        while (state.vec.count < newLen) {
          state.vec = vecPush(state.vec, state.owner, undefined as unknown as T);
        }
        state.modified = true;
        state.cachedLeaf = undefined;
        return true;
      }

      if (typeof prop === 'string') {
        // Fast path for numeric indices
        const c0 = prop.charCodeAt(0);
        if (c0 >= 48 && c0 <= 57) { // '0' to '9'
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

function produceArray<T>(base: T[], recipe: (draft: T[]) => void): T[] {
  const baseState = ARRAY_STATE_ENV.get(base);
  const baseVec = baseState ? baseState.vec : vecFromArray(base);

  const draftOwner: Owner = {};
  // Lazy tail copy - tail shared initially, copied on first mutation
  const draftVec: Vec<T> = {
    count: baseVec.count,
    shift: baseVec.shift,
    root: baseVec.root,
    tail: baseVec.tail,
    treeCount: baseVec.treeCount,
    // tailOwner not set - first mutation will copy and set ownership
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

// =====================================================
// HAMT Map Proxy
// =====================================================

interface HMapState<K, V> {
  map: HMap<K, V>;
  isDraft: boolean;
  owner?: Owner;
  modified: boolean;
  valueProxies?: Map<K, any>;
  ordered?: OrderIndex<K, V> | null;  // null = unordered, OrderIndex = ordered (with values for O(n) iteration)
}

const MAP_STATE_ENV = new WeakMap<any, HMapState<any, any>>();

function createMapProxy<K, V>(state: HMapState<K, V>): Map<K, V> {
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
          // Update order if ordered
          if (state.ordered) {
            if (had) {
              // Update value in OrderIndex for O(n) iteration
              state.ordered = orderUpdateValue(state.ordered, state.owner, key, value);
            } else {
              // Append new key-value pair
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

      // Helper: iterate keys in order
      const iterKeys = function* (): IterableIterator<K> {
        if (state.ordered) {
          yield* orderIter(state.ordered);
        } else {
          for (const [k] of hamtIter(state.map)) {
            yield k;
          }
        }
      };

      // Helper: wrap value in nested proxy if draft mode
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
          // O(n) iteration when idxToVal is available
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
          // O(n) iteration when idxToVal is available
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
          // O(n) iteration when idxToVal is available
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
          // O(n) with insertion order when idxToVal available
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

function produceMap<K, V>(
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

// =====================================================
// HAMT Set Proxy (基於 HMap<value, true>)
// =====================================================

interface HSetState<T> {
  map: HMap<T, true>;
  isDraft: boolean;
  owner?: Owner;
  modified: boolean;
  ordered?: OrderIndex<T> | null;
}

const SET_STATE_ENV = new WeakMap<any, HSetState<any>>();

function hamtFromSet<T>(s: Set<T>): HMap<T, true> {
  let map = hamtEmpty<T, true>();
  const owner: Owner = {};
  for (const v of s) {
    map = hamtSet(map, owner, v, true);
  }
  return map;
}

function hamtToSetValues<T>(map: HMap<T, true>): T[] {
  const entries = hamtToEntries(map) as [T, true][];
  return entries.map(([k]) => k);
}

function createSetProxy<T>(state: HSetState<T>): Set<T> {
  const target = new Set<T>();

  const proxy = new Proxy(target, {
    get(target, prop, receiver) {
      if (prop === '__PURA_SET_STATE__') return state;
      if (prop === 'size') return state.map.size;

      if (prop === 'has') {
        return (value: T): boolean => hamtHas(state.map, value);
      }

      if (prop === 'add') {
        return (value: T) => {
          const had = hamtHas(state.map, value);
          const newMap = hamtSet(state.map, state.owner, value, true);
          if (newMap !== state.map) {
            state.map = newMap;
            if (!had) {
              // Update order if ordered and new value
              if (state.ordered) {
                state.ordered = orderAppend(state.ordered, state.owner, value);
              }
              state.modified = true;
            }
          }
          return proxy;
        };
      }

      if (prop === 'delete') {
        return (value: T) => {
          const before = state.map.size;
          state.map = hamtDelete(state.map, state.owner, value);
          const removed = state.map.size !== before;
          if (removed) {
            if (state.ordered) {
              state.ordered = orderDelete(state.ordered, state.owner, value);
            }
            state.modified = true;
          }
          return removed;
        };
      }

      if (prop === 'clear') {
        return () => {
          if (state.map.size === 0) return;
          state.map = hamtEmpty<T, true>();
          if (state.ordered) {
            state.ordered = orderEmpty<T>();
          }
          state.modified = true;
        };
      }

      // Helper: iterate values in order
      const iterValues = function* (): IterableIterator<T> {
        if (state.ordered) {
          yield* orderIter(state.ordered);
        } else {
          for (const [v] of hamtIter(state.map)) {
            yield v;
          }
        }
      };

      if (prop === Symbol.iterator || prop === 'values' || prop === 'keys') {
        return function* () {
          yield* iterValues();
        };
      }

      if (prop === 'entries') {
        return function* () {
          for (const v of iterValues()) {
            yield [v, v] as [T, T];
          }
        };
      }

      if (prop === 'forEach') {
        return (cb: (value: T, value2: T, set: Set<T>) => void, thisArg?: any) => {
          for (const v of iterValues()) {
            cb.call(thisArg, v, v, proxy);
          }
        };
      }

      if (prop === 'toJSON') {
        return () => hamtToSetValues(state.map);
      }

      return Reflect.get(target, prop, receiver);
    },
  });

  SET_STATE_ENV.set(proxy, state);
  return proxy;
}

function produceSet<T>(
  base: Set<T>,
  recipe: (draft: Set<T>) => void
): Set<T> {
  let baseMap: HMap<T, true>;
  let baseOrdered: OrderIndex<T> | null = null;
  const baseState = SET_STATE_ENV.get(base as any);
  if (baseState) {
    baseMap = baseState.map;
    baseOrdered = baseState.ordered || null;
  } else {
    baseMap = hamtFromSet(base);
  }

  const draftOwner: Owner = {};
  const draftState: HSetState<T> = {
    map: baseMap,
    isDraft: true,
    owner: draftOwner,
    modified: false,
    ordered: baseOrdered,
  };

  const draft = createSetProxy<T>(draftState);
  recipe(draft);

  if (!draftState.modified) {
    return base;
  }

  const finalState: HSetState<T> = {
    map: draftState.map,
    isDraft: false,
    owner: undefined,
    modified: false,
    ordered: draftState.ordered,
  };

  return createSetProxy<T>(finalState);
}

// =====================================================
// Object produce (root object)
// =====================================================

function produceObject<T extends object>(
  base: T,
  recipe: (draft: T) => void
): T {
  // Get the plain object from the base (if it's a pura proxy)
  const maybeNested = (base as any)[NESTED_PROXY_STATE] as
    | NestedProxyState<T>
    | undefined;

  // IMPORTANT: We need to get the actual data, not a reference to be mutated
  // If base is a pura proxy, extract the current value
  // Otherwise use base directly (but we'll copy in createNestedProxy)
  const plainBase = maybeNested
    ? (maybeNested.copy || maybeNested.base)
    : base;

  let modified = false;
  const draft = createNestedProxy(plainBase, () => {
    modified = true;
  }) as T;

  recipe(draft);

  // Check if any modifications actually happened (recursively)
  if (!isProxyModified(draft)) {
    return base;
  }

  const result = extractNestedValue(draft) as T;
  return pura(result);
}

// =====================================================
// Public APIs
// =====================================================

/**
 * Create a Pura value.
 * - Array → bit-trie Vec proxy
 * - Object → deep COW proxy
 * - Map → HAMT-style persistent Map proxy
 * - Set → HAMT-style persistent Set proxy
 */
export function pura<T>(value: T): T {
  if (Array.isArray(value)) {
    const arr = value as any[];
    if (ARRAY_STATE_ENV.has(arr)) return value;

    const vec = vecFromArray(arr);
    return createArrayProxy<any>({
      vec,
      isDraft: false,
      owner: undefined,
      modified: false,
    }) as any as T;
  }

  if (value instanceof Map) {
    const m = value as Map<any, any>;
    if (MAP_STATE_ENV.has(m)) return value;
    const hamt = hamtFromMap(m);
    return createMapProxy({
      map: hamt,
      isDraft: false,
      owner: undefined,
      modified: false,
    }) as any as T;
  }

  if (value instanceof Set) {
    const s = value as Set<any>;
    if (SET_STATE_ENV.has(s)) return value;
    const hamt = hamtFromSet(s);
    return createSetProxy({
      map: hamt,
      isDraft: false,
      owner: undefined,
      modified: false,
    }) as any as T;
  }

  if (value !== null && typeof value === 'object') {
    const obj = value as any;
    if (obj[NESTED_PROXY_STATE]) return value;

    // Check cache for existing proxy
    if (PROXY_CACHE.has(obj)) {
      return PROXY_CACHE.get(obj) as T;
    }

    const proxy = createNestedProxy(obj, () => {}) as any as T;
    PROXY_CACHE.set(obj, proxy);
    return proxy;
  }

  return value;
}

/**
 * Create an ordered Pura Map that preserves insertion order.
 * Iteration (keys/values/entries/forEach) follows insertion order like native Map.
 * Trade-off: ~2x overhead for set/delete operations.
 */
export function puraOrderedMap<K, V>(m: Map<K, V>): Map<K, V> {
  if (MAP_STATE_ENV.has(m as any)) return m;
  const hamt = hamtFromMap(m);
  const ordered = orderFromBase(m);
  return createMapProxy({
    map: hamt,
    isDraft: false,
    owner: undefined,
    modified: false,
    ordered,
  });
}

/**
 * Create an ordered Pura Set that preserves insertion order.
 * Iteration (values/keys/entries/forEach) follows insertion order like native Set.
 * Trade-off: ~2x overhead for add/delete operations.
 */
export function puraOrderedSet<T>(s: Set<T>): Set<T> {
  if (SET_STATE_ENV.has(s as any)) return s;
  const hamt = hamtFromSet(s);
  const ordered = orderFromSetBase(s);
  return createSetProxy({
    map: hamt,
    isDraft: false,
    owner: undefined,
    modified: false,
    ordered,
  });
}

/**
 * Convert Pura value back to plain JS.
 * - Array → native array
 * - Map   → native Map
 * - Set   → native Set
 * - Object (nested proxy) → plain object
 */
export function unpura<T>(value: T): T {
  if (Array.isArray(value)) {
    const state = ARRAY_STATE_ENV.get(value as any[]);
    if (!state) return value;
    return vecToArray(state.vec) as any as T;
  }

  if (value instanceof Map) {
    // Top-level HAMT Map
    const top = MAP_STATE_ENV.get(value as any);
    if (top) {
      // Preserve insertion order if ordered
      if (top.ordered) {
        const out = new Map();
        // O(n) when idxToVal available
        if (top.ordered.idxToVal) {
          for (const [k, v] of orderEntryIter(top.ordered)) {
            out.set(k, v);
          }
        } else {
          for (const k of orderIter(top.ordered)) {
            out.set(k, hamtGet(top.map, k));
          }
        }
        return out as any as T;
      }
      return new Map(hamtIter(top.map)) as any as T;
    }

    // Nested Map proxy
    const nested = (value as any)[NESTED_MAP_STATE] as NestedMapState<any, any> | undefined;
    if (nested) return (nested.copy || nested.base) as any as T;

    return value;
  }

  if (value instanceof Set) {
    // Top-level HAMT Set
    const top = SET_STATE_ENV.get(value as any);
    if (top) {
      const s = new Set<T>();
      // Preserve insertion order if ordered
      if (top.ordered) {
        for (const k of orderIter(top.ordered)) {
          s.add(k as T);
        }
      } else {
        for (const [k] of hamtIter(top.map)) {
          s.add(k as T);
        }
      }
      return s as any as T;
    }

    // Nested Set proxy
    const nested = (value as any)[NESTED_SET_STATE] as NestedSetState<any> | undefined;
    if (nested) return (nested.copy || nested.base) as any as T;

    return value;
  }

  if (value !== null && typeof value === 'object') {
    const obj = value as any;
    if (obj[NESTED_PROXY_STATE]) {
      return extractNestedValue(obj);
    }
  }

  return value;
}

/**
 * Detect if value is managed by Pura (array / object / map / set).
 */
export function isPura<T>(value: T): boolean {
  if (Array.isArray(value)) {
    return ARRAY_STATE_ENV.has(value as any[]);
  }
  if (value instanceof Map) {
    return MAP_STATE_ENV.has(value as any);
  }
  if (value instanceof Set) {
    return SET_STATE_ENV.has(value as any);
  }
  if (value !== null && typeof value === 'object') {
    return Boolean((value as any)[NESTED_PROXY_STATE]);
  }
  return false;
}

/**
 * Re-wrap a value into optimized Pura representation.
 */
export function repura<T>(value: T): T {
  return pura(unpura(value));
}

/**
 * Immutable update with structural sharing.
 * - Array → Vec + transients
 * - Object → deep proxy
 * - Map → HAMT + transients
 * - Set → HAMT + transients
 */
export function produce<T>(base: T, recipe: (draft: T) => void): T {
  if (Array.isArray(base)) {
    return produceArray(base as any[], recipe as any) as any as T;
  }

  if (base instanceof Map) {
    return produceMap(base as any, recipe as any) as any as T;
  }

  if (base instanceof Set) {
    return produceSet(base as any, recipe as any) as any as T;
  }

  if (base !== null && typeof base === 'object') {
    return produceObject(base as any, recipe as any) as any as T;
  }

  recipe(base);
  return base;
}
