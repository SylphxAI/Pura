/**
 * ProduceFast: Type-driven immutable mutation without proxy tracking
 *
 * Core approach:
 * - Type-based Helper inference (Array → ArrayHelper, Map → MapHelper, etc.)
 * - Path-to-type inference for Object paths
 * - Batch mutation application (single copy)
 * - No proxy tracking overhead
 *
 * Performance target: ~1.1-1.5x slower than native for single updates
 */

// ===== Type Utilities =====

/**
 * Recursion depth counter for PathArray
 */
type Prev = [never, 0, 1, 2, 3, 4, 5, ...0[]];

/**
 * Generate all valid paths for type T
 * Stops at Map/Set/Array boundaries
 */
type PathArray<T, D extends number = 5> =
  [D] extends [never]
    ? never
    : T extends Map<any, any> | Set<any> | Array<any>
      ? []  // Collections: path stops here
      : T extends object
        ? {
            [K in keyof T]:
              | [K]
              | (PathArray<T[K], Prev[D]> extends infer R
                  ? R extends [any, ...any[]]
                    ? [K, ...R]
                    : never
                  : never)
          }[keyof T]
        : never;

/**
 * Extract value type from path
 */
type PathValue<T, P extends readonly any[]> =
  P extends readonly [infer K, ...infer Rest]
    ? K extends keyof T
      ? Rest extends readonly []
        ? T[K]
        : PathValue<T[K], Rest>
      : never
    : T;

// ===== Helper Interfaces =====

/**
 * Array Helper: push, splice, filter, set, delete
 */
interface ArrayHelper<E> {
  set(index: number, value: E): void;
  delete(index: number): void;
  push(...items: E[]): void;
  splice(start: number, deleteCount?: number, ...items: E[]): void;
  filter(fn: (item: E, index: number) => boolean): void;
}

/**
 * Map Helper: set, delete, clear
 */
interface MapHelper<K, V> {
  set(key: K, value: V): void;
  delete(key: K): void;
  clear(): void;
}

/**
 * Set Helper: add, delete, clear
 */
interface SetHelper<V> {
  add(value: V): void;
  delete(value: V): void;
  clear(): void;
}

/**
 * Object Helper: path-based operations with type inference
 */
interface ObjectHelper<T> {
  set<P extends PathArray<T>>(
    path: P,
    value: PathValue<T, P>
  ): void;

  update<P extends PathArray<T>>(
    path: P,
    updater: (old: PathValue<T, P>) => PathValue<T, P>
  ): void;

  delete<P extends PathArray<T>>(path: P): void;

  merge<P extends PathArray<T>>(
    path: P,
    value: Partial<PathValue<T, P>>
  ): void;
}

/**
 * Type-based Helper inference
 */
type FastHelper<T> =
  T extends Array<infer E> ? ArrayHelper<E> :
  T extends Map<infer K, infer V> ? MapHelper<K, V> :
  T extends Set<infer V> ? SetHelper<V> :
  T extends object ? ObjectHelper<T> :
  never;

// ===== Mutation Types =====

type ArrayMutation<E> =
  | { type: 'set'; index: number; value: E }
  | { type: 'delete'; index: number }
  | { type: 'push'; items: E[] }
  | { type: 'splice'; start: number; deleteCount: number; items: E[] }
  | { type: 'filter'; fn: (item: E, index: number) => boolean };

type MapMutation<K, V> =
  | { type: 'set'; key: K; value: V }
  | { type: 'delete'; key: K }
  | { type: 'clear' };

type SetMutation<V> =
  | { type: 'add'; value: V }
  | { type: 'delete'; value: V }
  | { type: 'clear' };

type ObjectMutation =
  | { type: 'set'; path: readonly (string | number)[]; value: any }
  | { type: 'update'; path: readonly (string | number)[]; updater: (old: any) => any }
  | { type: 'delete'; path: readonly (string | number)[] }
  | { type: 'merge'; path: readonly (string | number)[]; value: any };

// ===== Array Implementation =====

function produceFastArray<E>(
  base: Array<E>,
  recipe: (helper: ArrayHelper<E>) => void
): Array<E> {
  const mutations: ArrayMutation<E>[] = [];

  const helper: ArrayHelper<E> = {
    set(index: number, value: E) {
      mutations.push({ type: 'set', index, value });
    },
    delete(index: number) {
      mutations.push({ type: 'delete', index });
    },
    push(...items: E[]) {
      mutations.push({ type: 'push', items });
    },
    splice(start: number, deleteCount: number = 0, ...items: E[]) {
      mutations.push({ type: 'splice', start, deleteCount, items });
    },
    filter(fn: (item: E, index: number) => boolean) {
      mutations.push({ type: 'filter', fn });
    }
  };

  recipe(helper);

  if (mutations.length === 0) return base;

  // Optimize: batch simple sets
  const hasComplexMutation = mutations.some(m =>
    m.type === 'splice' || m.type === 'filter' || m.type === 'delete'
  );

  if (!hasComplexMutation) {
    // Only sets and pushes - can optimize
    const result = base.slice();

    for (const mutation of mutations) {
      if (mutation.type === 'set') {
        result[mutation.index] = mutation.value;
      } else if (mutation.type === 'push') {
        result.push(...mutation.items);
      }
    }

    return result;
  }

  // Complex mutations - apply sequentially
  let result = base.slice();

  for (const mutation of mutations) {
    switch (mutation.type) {
      case 'set':
        result[mutation.index] = mutation.value;
        break;
      case 'delete':
        result.splice(mutation.index, 1);
        break;
      case 'push':
        result.push(...mutation.items);
        break;
      case 'splice':
        result.splice(mutation.start, mutation.deleteCount, ...mutation.items);
        break;
      case 'filter':
        result = result.filter(mutation.fn);
        break;
    }
  }

  return result;
}

// ===== Map Implementation =====

function produceFastMap<K, V>(
  base: Map<K, V>,
  recipe: (helper: MapHelper<K, V>) => void
): Map<K, V> {
  const mutations: MapMutation<K, V>[] = [];

  const helper: MapHelper<K, V> = {
    set(key: K, value: V) {
      mutations.push({ type: 'set', key, value });
    },
    delete(key: K) {
      mutations.push({ type: 'delete', key });
    },
    clear() {
      mutations.push({ type: 'clear' });
    }
  };

  recipe(helper);

  if (mutations.length === 0) return base;

  // Check if there's a clear operation
  const hasClear = mutations.some(m => m.type === 'clear');

  if (hasClear) {
    // Clear operation - start fresh
    const result = new Map<K, V>();
    let cleared = false;

    for (const mutation of mutations) {
      if (mutation.type === 'clear') {
        result.clear();
        cleared = true;
      } else if (mutation.type === 'set') {
        result.set(mutation.key, mutation.value);
      }
      // Ignore deletes before clear
    }

    return result;
  }

  // No clear - batch all operations
  const result = new Map(base);

  for (const mutation of mutations) {
    if (mutation.type === 'set') {
      result.set(mutation.key, mutation.value);
    } else if (mutation.type === 'delete') {
      result.delete(mutation.key);
    }
  }

  return result;
}

// ===== Set Implementation =====

function produceFastSet<V>(
  base: Set<V>,
  recipe: (helper: SetHelper<V>) => void
): Set<V> {
  const mutations: SetMutation<V>[] = [];

  const helper: SetHelper<V> = {
    add(value: V) {
      mutations.push({ type: 'add', value });
    },
    delete(value: V) {
      mutations.push({ type: 'delete', value });
    },
    clear() {
      mutations.push({ type: 'clear' });
    }
  };

  recipe(helper);

  if (mutations.length === 0) return base;

  // Check if there's a clear operation
  const hasClear = mutations.some(m => m.type === 'clear');

  if (hasClear) {
    // Clear operation - start fresh
    const result = new Set<V>();
    let cleared = false;

    for (const mutation of mutations) {
      if (mutation.type === 'clear') {
        result.clear();
        cleared = true;
      } else if (mutation.type === 'add') {
        result.add(mutation.value);
      }
      // Ignore deletes before clear
    }

    return result;
  }

  // No clear - batch all operations
  const result = new Set(base);

  for (const mutation of mutations) {
    if (mutation.type === 'add') {
      result.add(mutation.value);
    } else if (mutation.type === 'delete') {
      result.delete(mutation.value);
    }
  }

  return result;
}

// ===== Object Implementation =====

/**
 * Get value at path
 */
function getIn<T>(obj: T, path: readonly (string | number)[]): any {
  let current: any = obj;
  for (const key of path) {
    current = current[key];
  }
  return current;
}

/**
 * Immutably set value at path
 */
function setIn<T>(obj: T, path: readonly (string | number)[], value: any): T {
  if (path.length === 0) return value;

  const [first, ...rest] = path;

  if (Array.isArray(obj)) {
    const copy = [...obj];
    copy[first as number] = rest.length === 0 ? value : setIn(copy[first as number], rest, value);
    return copy as any;
  }

  return {
    ...obj,
    [first]: rest.length === 0 ? value : setIn((obj as any)[first], rest, value)
  } as T;
}

/**
 * Delete value at path
 */
function deleteIn<T>(obj: T, path: readonly (string | number)[]): T {
  if (path.length === 0) return obj;

  const [first, ...rest] = path;

  if (rest.length === 0) {
    if (Array.isArray(obj)) {
      const copy = [...obj];
      copy.splice(first as number, 1);
      return copy as any;
    }
    const copy = { ...obj };
    delete (copy as any)[first];
    return copy;
  }

  if (Array.isArray(obj)) {
    const copy = [...obj];
    copy[first as number] = deleteIn(copy[first as number], rest);
    return copy as any;
  }

  return {
    ...obj,
    [first]: deleteIn((obj as any)[first], rest)
  } as T;
}

/**
 * Optimized batch application of mutations
 */
function applyMutationsBatch<T extends object>(
  base: T,
  mutations: ObjectMutation[]
): T {
  if (mutations.length === 0) return base;

  // Fast path: single mutation
  if (mutations.length === 1) {
    const mutation = mutations[0];
    switch (mutation.type) {
      case 'set':
        return setIn(base, mutation.path, mutation.value);
      case 'update': {
        const oldValue = getIn(base, mutation.path);
        const newValue = mutation.updater(oldValue);
        return setIn(base, mutation.path, newValue);
      }
      case 'delete':
        return deleteIn(base, mutation.path);
      case 'merge': {
        const currentValue = getIn(base, mutation.path);
        const merged = { ...currentValue, ...mutation.value };
        return setIn(base, mutation.path, merged);
      }
    }
  }

  // Check if all mutations are shallow (path length 1)
  const allShallow = mutations.every(m => m.path.length === 1);

  if (allShallow) {
    // Check if there are any deletes
    const hasDeletes = mutations.some(m => m.type === 'delete');

    if (!hasDeletes) {
      // No deletes - can use simple spread
      const changes: Record<string | number, any> = {};

      for (const mutation of mutations) {
        const key = mutation.path[0];
        switch (mutation.type) {
          case 'set':
            changes[key] = mutation.value;
            break;
          case 'update':
            changes[key] = mutation.updater((base as any)[key]);
            break;
          case 'merge':
            changes[key] = { ...(base as any)[key], ...mutation.value };
            break;
        }
      }

      // Single spread operation
      return { ...base, ...changes } as T;
    }

    // Has deletes - need to filter
    const changes: Record<string | number, any> = {};
    const deletes = new Set<string | number>();

    for (const mutation of mutations) {
      const key = mutation.path[0];
      switch (mutation.type) {
        case 'set':
          changes[key] = mutation.value;
          deletes.delete(key);
          break;
        case 'update':
          changes[key] = mutation.updater((base as any)[key]);
          deletes.delete(key);
          break;
        case 'delete':
          deletes.add(key);
          delete changes[key];
          break;
        case 'merge':
          changes[key] = { ...(base as any)[key], ...mutation.value };
          deletes.delete(key);
          break;
      }
    }

    // Apply all changes in one pass
    const result: any = {};
    for (const key in base) {
      if (!deletes.has(key)) {
        result[key] = key in changes ? changes[key] : (base as any)[key];
      }
    }
    for (const key in changes) {
      if (!(key in base)) {
        result[key] = changes[key];
      }
    }

    return result as T;
  }

  // Deep mutations - apply sequentially (for now)
  // TODO: Optimize deep mutation batching
  let result = base;

  for (const mutation of mutations) {
    switch (mutation.type) {
      case 'set':
        result = setIn(result, mutation.path, mutation.value);
        break;
      case 'update': {
        const oldValue = getIn(result, mutation.path);
        const newValue = mutation.updater(oldValue);
        result = setIn(result, mutation.path, newValue);
        break;
      }
      case 'delete':
        result = deleteIn(result, mutation.path);
        break;
      case 'merge': {
        const currentValue = getIn(result, mutation.path);
        const merged = { ...currentValue, ...mutation.value };
        result = setIn(result, mutation.path, merged);
        break;
      }
    }
  }

  return result;
}

function produceFastObject<T extends object>(
  base: T,
  recipe: (helper: ObjectHelper<T>) => void
): T {
  const mutations: ObjectMutation[] = [];

  const helper: ObjectHelper<T> = {
    set(path: any, value: any) {
      mutations.push({ type: 'set', path, value });
    },
    update(path: any, updater: any) {
      mutations.push({ type: 'update', path, updater });
    },
    delete(path: any) {
      mutations.push({ type: 'delete', path });
    },
    merge(path: any, value: any) {
      mutations.push({ type: 'merge', path, value });
    }
  };

  recipe(helper);

  return applyMutationsBatch(base, mutations);
}

// ===== Main ProduceFast Function =====

/**
 * ProduceFast: Immutable mutation without proxy tracking
 *
 * Usage:
 * - Array: produceFast(arr, $ => { $.push(1); $.set(0, 2); })
 * - Map: produceFast(map, $ => { $.set('key', 'value'); })
 * - Set: produceFast(set, $ => { $.add('item'); })
 * - Object: produceFast(obj, $ => { $.set(['user', 'name'], 'Alice'); })
 */
export function produceFast<T>(
  base: T,
  recipe: (helper: FastHelper<T>) => void
): T {
  // Runtime type detection
  if (Array.isArray(base)) {
    return produceFastArray(base as any, recipe as any) as any;
  }

  if (base instanceof Map) {
    return produceFastMap(base as any, recipe as any) as any;
  }

  if (base instanceof Set) {
    return produceFastSet(base as any, recipe as any) as any;
  }

  if (base !== null && typeof base === 'object') {
    return produceFastObject(base as object, recipe as any) as any;
  }

  return base;
}
