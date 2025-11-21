/**
 * Pura v4.5 Diamond – Vec + Object + HAMT Map + HAMT Set
 *
 * - pura([])        → Bit-trie persistent vector proxy
 * - pura({})        → Deep Immer-style object proxy
 * - pura(new Map)   → HAMT-style persistent Map proxy
 * - pura(new Set)   → HAMT-style persistent Set proxy
 * - produce(...)    → 同一 API 操作四種結構
 */

import {
  NESTED_PROXY_STATE,
  NESTED_MAP_STATE,
  NESTED_SET_STATE,
  PROXY_CACHE,
  vecFromArray,
  vecToArray,
  vecIter,
  hamtGet,
  hamtFromMap,
  hamtIter,
  orderFromBase,
  orderFromSetBase,
  orderIter,
  orderEntryIter,
  createNestedProxy,
  isProxyModified,
  extractNestedValue,
  type NestedProxyState,
  type NestedMapState,
  type NestedSetState,
  createArrayProxy,
  produceArray,
  ARRAY_STATE_ENV,
  createMapProxy,
  produceMap,
  MAP_STATE_ENV,
  createSetProxy,
  produceSet,
  hamtFromSet,
  hamtToSetValues,
  SET_STATE_ENV,
} from './internal';

// =====================================================
// Object produce (root object)
// =====================================================

function produceObject<T extends object>(
  base: T,
  recipe: (draft: T) => void
): T {
  const maybeNested = (base as any)[NESTED_PROXY_STATE] as
    | NestedProxyState<T>
    | undefined;

  const plainBase = maybeNested
    ? (maybeNested.copy || maybeNested.base)
    : base;

  let modified = false;
  const draft = createNestedProxy(plainBase, () => {
    modified = true;
  }) as T;

  recipe(draft);

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
    const top = MAP_STATE_ENV.get(value as any);
    if (top) {
      if (top.ordered) {
        const out = new Map();
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

    const nested = (value as any)[NESTED_MAP_STATE] as NestedMapState<any, any> | undefined;
    if (nested) return (nested.copy || nested.base) as any as T;

    return value;
  }

  if (value instanceof Set) {
    const top = SET_STATE_ENV.get(value as any);
    if (top) {
      const s = new Set<T>();
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
