/**
 * Nested Proxy - Immer-style draft proxies for deep object mutations
 */

import { NESTED_PROXY_STATE, NESTED_MAP_STATE, NESTED_SET_STATE, PROXY_CACHE } from './constants';

export { NESTED_PROXY_STATE, NESTED_MAP_STATE, NESTED_SET_STATE };

export interface NestedProxyState<T> {
  base: T;
  copy: T | undefined;
  childProxies: Map<string | symbol, any>;
}

export interface NestedMapState<K, V> {
  base: Map<K, V>;
  copy: Map<K, V> | undefined;
  modified: boolean;
}

export interface NestedSetState<T> {
  base: Set<T>;
  copy: Set<T> | undefined;
  modified: boolean;
}

export function createNestedMapProxy<K, V>(
  base: Map<K, V>,
  onMutate: () => void
): Map<K, V> {
  let copy: Map<K, V> | undefined;
  let modified = false;

  const getCopy = (): Map<K, V> => {
    if (!copy) {
      copy = new Map(base);
      onMutate();
    }
    return copy;
  };

  const target = new Map<K, V>();
  return new Proxy(target, {
    get(_, prop) {
      if (prop === NESTED_MAP_STATE) {
        return { base, copy, modified } as NestedMapState<K, V>;
      }
      if (prop === 'size') return (copy || base).size;

      if (prop === 'get') {
        return (key: K) => (copy || base).get(key);
      }
      if (prop === 'has') {
        return (key: K) => (copy || base).has(key);
      }
      if (prop === 'set') {
        return (key: K, value: V) => {
          const c = getCopy();
          c.set(key, value);
          modified = true;
          return target;
        };
      }
      if (prop === 'delete') {
        return (key: K) => {
          const c = getCopy();
          const result = c.delete(key);
          if (result) modified = true;
          return result;
        };
      }
      if (prop === 'clear') {
        return () => {
          const c = getCopy();
          c.clear();
          modified = true;
        };
      }
      if (prop === Symbol.iterator || prop === 'entries') {
        return function* () {
          for (const e of (copy || base)) yield e;
        };
      }
      if (prop === 'keys') {
        return function* () {
          for (const [k] of (copy || base)) yield k;
        };
      }
      if (prop === 'values') {
        return function* () {
          for (const [, v] of (copy || base)) yield v;
        };
      }
      if (prop === 'forEach') {
        return (cb: (v: V, k: K, m: Map<K, V>) => void, thisArg?: any) => {
          (copy || base).forEach((v, k) => cb.call(thisArg, v, k, target));
        };
      }
      return undefined;
    },
  }) as Map<K, V>;
}

export function createNestedSetProxy<T>(
  base: Set<T>,
  onMutate: () => void
): Set<T> {
  let copy: Set<T> | undefined;
  let modified = false;

  const getCopy = (): Set<T> => {
    if (!copy) {
      copy = new Set(base);
      onMutate();
    }
    return copy;
  };

  const target = new Set<T>();
  return new Proxy(target, {
    get(_, prop) {
      if (prop === NESTED_SET_STATE) {
        return { base, copy, modified } as NestedSetState<T>;
      }
      if (prop === 'size') return (copy || base).size;

      if (prop === 'has') {
        return (value: T) => (copy || base).has(value);
      }
      if (prop === 'add') {
        return (value: T) => {
          const c = getCopy();
          const before = c.size;
          c.add(value);
          if (c.size !== before) modified = true;
          return target;
        };
      }
      if (prop === 'delete') {
        return (value: T) => {
          const c = getCopy();
          const result = c.delete(value);
          if (result) modified = true;
          return result;
        };
      }
      if (prop === 'clear') {
        return () => {
          const c = getCopy();
          c.clear();
          modified = true;
        };
      }
      if (prop === Symbol.iterator || prop === 'values' || prop === 'keys') {
        return function* () {
          for (const v of (copy || base)) yield v;
        };
      }
      if (prop === 'entries') {
        return function* () {
          for (const v of (copy || base)) yield [v, v] as [T, T];
        };
      }
      if (prop === 'forEach') {
        return (cb: (v: T, v2: T, s: Set<T>) => void, thisArg?: any) => {
          (copy || base).forEach((v) => cb.call(thisArg, v, v, target));
        };
      }
      return undefined;
    },
  }) as Set<T>;
}

export function createNestedProxy<T extends object>(
  base: T,
  onMutate: () => void
): T {
  const proxyTarget = (Object.isFrozen(base) || Object.isSealed(base))
    ? (Array.isArray(base) ? [...base] as T : { ...base })
    : base;

  let copy: T | undefined;
  const childProxies = new Map<string | symbol, any>();

  const getCopy = (): T => {
    if (!copy) {
      copy = Array.isArray(base) ? ([...base] as T) : { ...base };
      onMutate();
    }
    return copy;
  };

  return new Proxy(proxyTarget, {
    get(target, prop, receiver) {
      if (prop === NESTED_PROXY_STATE) {
        return { base, copy, childProxies } as NestedProxyState<T>;
      }

      const source = copy || base;
      const value = Reflect.get(source, prop, receiver);

      if (value !== null && typeof value === 'object') {
        if (value instanceof Date || value instanceof RegExp ||
            value instanceof Error || value instanceof Promise ||
            ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
          return value;
        }

        if (!childProxies.has(prop)) {
          if (value instanceof Map) {
            const mapDraft = createNestedMapProxy(value as Map<any, any>, () => {
              getCopy();
            });
            childProxies.set(prop, mapDraft);
          }
          else if (value instanceof Set) {
            const setDraft = createNestedSetProxy(value as Set<any>, () => {
              getCopy();
            });
            childProxies.set(prop, setDraft);
          }
          else {
            childProxies.set(
              prop,
              createNestedProxy(value as object, () => {
                getCopy();
              })
            );
          }
        }
        return childProxies.get(prop);
      }

      if (typeof value === 'function') {
        const mutatingMethods = [
          'push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse', 'fill',
        ];
        if (mutatingMethods.includes(prop as string)) {
          return (...args: any[]) => {
            const c = getCopy();
            return (c as any)[prop](...args);
          };
        }
        return value.bind(source);
      }

      return value;
    },

    set(target, prop, value) {
      const c = getCopy();
      childProxies.delete(prop);
      (c as any)[prop] = value;
      return true;
    },

    deleteProperty(target, prop) {
      const c = getCopy();
      childProxies.delete(prop);
      return Reflect.deleteProperty(c, prop);
    },

    ownKeys() {
      return Reflect.ownKeys(copy || base);
    },

    getOwnPropertyDescriptor(target, prop) {
      return Reflect.getOwnPropertyDescriptor(copy || base, prop);
    },

    has(target, prop) {
      return prop in (copy || base);
    },
  }) as T;
}

export function isProxyModified(proxy: any): boolean {
  if (proxy === null || typeof proxy !== 'object') return false;

  const mapState = (proxy as any)[NESTED_MAP_STATE];
  if (mapState) return !!mapState.copy;

  const setState = (proxy as any)[NESTED_SET_STATE];
  if (setState) return !!setState.copy;

  const nestedState = (proxy as any)[NESTED_PROXY_STATE];
  if (!nestedState) return false;

  if (nestedState.copy) return true;

  for (const childProxy of nestedState.childProxies.values()) {
    if (isProxyModified(childProxy)) return true;
  }

  return false;
}

export function extractNestedValue<T>(proxy: T): T {
  if (proxy === null || typeof proxy !== 'object') return proxy;

  const mapState = (proxy as any)[NESTED_MAP_STATE] as NestedMapState<any, any> | undefined;
  if (mapState) {
    return (mapState.copy || mapState.base) as T;
  }

  const setState = (proxy as any)[NESTED_SET_STATE] as NestedSetState<any> | undefined;
  if (setState) {
    return (setState.copy || setState.base) as T;
  }

  const state = (proxy as any)[NESTED_PROXY_STATE] as NestedProxyState<T> | undefined;
  if (!state) return proxy;

  let hasModifiedChild = false;
  const modifiedChildren = new Map<string | symbol, any>();

  for (const [key, childProxy] of state.childProxies) {
    if (isProxyModified(childProxy)) {
      hasModifiedChild = true;
      modifiedChildren.set(key, extractNestedValue(childProxy));
    }
  }

  if (!state.copy && !hasModifiedChild) {
    return state.base;
  }

  let result = state.copy || state.base;

  if (hasModifiedChild && !state.copy) {
    result = Array.isArray(result)
      ? ([...result] as T)
      : ({ ...(result as any) } as T);
  }

  for (const [key, finalChild] of modifiedChildren) {
    (result as any)[key] = finalChild;
  }

  return result;
}
