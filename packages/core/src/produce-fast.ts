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
 * Mutation tree node for optimized batch application
 */
interface MutationTreeNode {
  value?: any;
  action?: 'set' | 'delete';
  children?: Map<string | number, MutationTreeNode>;
}

/**
 * Build mutation tree from mutations list
 * Merges multiple mutations on same path automatically
 */
function buildMutationTree(base: any, mutations: ObjectMutation[]): MutationTreeNode {
  const root: MutationTreeNode = { children: new Map() };

  for (const mutation of mutations) {
    let node = root;
    const path = mutation.path;

    // Navigate to the target node, creating nodes as needed
    for (let i = 0; i < path.length; i++) {
      const key = path[i];
      if (!node.children) {
        node.children = new Map();
      }

      if (!node.children.has(key)) {
        node.children.set(key, { children: new Map() });
      }

      node = node.children.get(key)!;
    }

    // Apply mutation at this node
    switch (mutation.type) {
      case 'set':
        node.value = mutation.value;
        node.action = 'set';
        node.children = undefined; // Leaf node - override any nested changes
        break;
      case 'update': {
        const currentValue = getIn(base, path);
        node.value = mutation.updater(currentValue);
        node.action = 'set';
        node.children = undefined;
        break;
      }
      case 'delete':
        node.action = 'delete';
        node.children = undefined;
        break;
      case 'merge': {
        const currentValue = getIn(base, path);
        node.value = { ...currentValue, ...mutation.value };
        node.action = 'set';
        node.children = undefined;
        break;
      }
    }
  }

  return root;
}

/**
 * Apply mutation tree to object (single traversal)
 * Uses structural sharing - unchanged parts reference original
 */
function applyMutationTree<T>(base: T, tree: MutationTreeNode): T {
  // Leaf node - return value directly
  if (!tree.children || tree.children.size === 0) {
    if (tree.action === 'delete') {
      return undefined as any;
    }
    if (tree.action === 'set') {
      return tree.value;
    }
    return base;
  }

  // Branch node - recursively build object
  if (Array.isArray(base)) {
    const result = [...base];
    let modified = false;

    for (const [key, childTree] of tree.children) {
      const index = key as number;
      const oldValue = result[index];
      const newValue = applyMutationTree(oldValue, childTree);

      if (newValue !== oldValue) {
        if (childTree.action === 'delete') {
          delete result[index];
        } else {
          result[index] = newValue;
        }
        modified = true;
      }
    }

    if (!modified) return base;

    // Filter out deleted items (compact array)
    return result.filter((_, i) => i in result) as any;
  }

  // Object - use spread for better performance
  const changes: Record<string | number, any> = {};
  const deletes = new Set<string | number>();
  let hasChanges = false;

  for (const [key, childTree] of tree.children) {
    if (childTree.action === 'delete') {
      deletes.add(key);
      hasChanges = true;
    } else {
      const oldValue = (base as any)[key];
      const newValue = applyMutationTree(oldValue, childTree);

      if (newValue !== oldValue) {
        changes[key] = newValue;
        hasChanges = true;
      }
    }
  }

  if (!hasChanges) return base;

  // Build result object
  if (deletes.size === 0) {
    // No deletes - simple spread
    return { ...base, ...changes } as T;
  }

  // Has deletes - filter keys
  const result: any = {};
  for (const key in base) {
    if (!deletes.has(key)) {
      result[key] = key in changes ? changes[key] : (base as any)[key];
    }
  }
  for (const key in changes) {
    if (!(key in (base as object))) {
      result[key] = changes[key];
    }
  }

  return result as T;
}

/**
 * Direct construction approach - build result without intermediate tree
 * Optimized for small-to-medium mutation counts (2-20)
 */
function applyDirectConstruction<T extends object>(
  base: T,
  mutations: ObjectMutation[]
): T {
  // Group mutations by first key in path
  const groups = new Map<string | number, ObjectMutation[]>();
  const rootChanges: Record<string | number, any> = {};
  const rootDeletes = new Set<string | number>();

  for (const mutation of mutations) {
    const key = mutation.path[0];

    if (mutation.path.length === 1) {
      // Shallow mutation - apply directly at root
      switch (mutation.type) {
        case 'set':
          rootChanges[key] = mutation.value;
          rootDeletes.delete(key);
          break;
        case 'update':
          rootChanges[key] = mutation.updater((base as any)[key]);
          rootDeletes.delete(key);
          break;
        case 'delete':
          rootDeletes.add(key);
          delete rootChanges[key];
          break;
        case 'merge':
          rootChanges[key] = { ...(base as any)[key], ...mutation.value };
          rootDeletes.delete(key);
          break;
      }
    } else {
      // Deep mutation - group by first key
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      // Create new mutation with path shifted by 1
      const shiftedMutation: ObjectMutation = {
        ...mutation,
        path: mutation.path.slice(1)
      };
      groups.get(key)!.push(shiftedMutation);
    }
  }

  // Apply grouped deep mutations recursively
  for (const [key, group] of groups) {
    if (rootDeletes.has(key)) continue; // Skip if deleted

    const baseValue = (base as any)[key];
    const newValue = applyDirectConstruction(baseValue, group);

    if (newValue !== baseValue) {
      rootChanges[key] = newValue;
    }
  }

  // Build result
  if (rootDeletes.size === 0) {
    // No deletes - simple spread
    return { ...base, ...rootChanges } as T;
  }

  // Has deletes - filter keys
  const result: any = {};
  for (const key in base) {
    if (!rootDeletes.has(key)) {
      result[key] = key in rootChanges ? rootChanges[key] : (base as any)[key];
    }
  }
  for (const key in rootChanges) {
    if (!(key in base)) {
      result[key] = rootChanges[key];
    }
  }

  return result as T;
}

/**
 * Helper to get value from mutation (handles set/update/merge)
 */
function getMutationValue(mutation: ObjectMutation, base: any): any {
  switch (mutation.type) {
    case 'set':
      return mutation.value;
    case 'update':
      return mutation.updater((base as any)[mutation.path[0]]);
    case 'merge':
      return { ...(base as any)[mutation.path[0]], ...mutation.value };
    default:
      return undefined;
  }
}

/**
 * Optimized batch application of mutations with pattern-based specialization
 */
function applyMutationsBatch<T extends object>(
  base: T,
  mutations: ObjectMutation[]
): T {
  if (mutations.length === 0) return base;

  // ===== Pattern 1: Single Mutation (Most Common) =====
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

  // ===== Pattern 2: 2 Shallow Mutations (Very Common) =====
  if (mutations.length === 2) {
    const [m1, m2] = mutations;

    // Check: both shallow, no deletes
    if (
      m1.path.length === 1 &&
      m2.path.length === 1 &&
      m1.type !== 'delete' &&
      m2.type !== 'delete'
    ) {
      // Inline: single spread with both changes
      return {
        ...base,
        [m1.path[0]]: getMutationValue(m1, base),
        [m2.path[0]]: getMutationValue(m2, base)
      } as T;
    }
  }

  // ===== Pattern 3: 3-6 All Shallow Mutations =====
  if (mutations.length <= 6) {
    const allShallow = mutations.every(m => m.path.length === 1);
    const noDeletes = mutations.every(m => m.type !== 'delete');

    if (allShallow && noDeletes) {
      // Build changes object inline
      const changes: Record<string | number, any> = {};

      for (const mutation of mutations) {
        const key = mutation.path[0];
        changes[key] = getMutationValue(mutation, base);
      }

      // Single spread operation
      return { ...base, ...changes } as T;
    }
  }

  // ===== Pattern 4: All Same Depth-2 Parent =====
  // Example: $.set(['profile', 'bio'], ...); $.set(['profile', 'avatar'], ...)
  if (mutations.length <= 10) {
    const allDepth2 = mutations.every(m => m.path.length === 2);

    if (allDepth2) {
      const firstParent = mutations[0].path[0];
      const sameParent = mutations.every(m => m.path[0] === firstParent);
      const noDeletes = mutations.every(m => m.type !== 'delete');

      if (sameParent && noDeletes) {
        // All mutations under same parent - optimize
        const parentValue = (base as any)[firstParent];
        const changes: Record<string | number, any> = {};

        for (const mutation of mutations) {
          const childKey = mutation.path[1];

          switch (mutation.type) {
            case 'set':
              changes[childKey] = mutation.value;
              break;
            case 'update':
              changes[childKey] = mutation.updater(parentValue[childKey]);
              break;
            case 'merge':
              changes[childKey] = { ...parentValue[childKey], ...mutation.value };
              break;
          }
        }

        // Single nested spread
        return {
          ...base,
          [firstParent]: {
            ...parentValue,
            ...changes
          }
        } as T;
      }
    }
  }

  // ===== Pattern 5: Mixed Shallow + Nested (Common in Real Usage) =====
  // Example: $.set(['name'], ...); $.set(['age'], ...); $.set(['profile', 'bio'], ...)
  // Also handles: $.set(['profile', 'settings', 'theme'], ...) with recursion
  if (mutations.length <= 8) {
    const noDeletes = mutations.every(m => m.type !== 'delete');

    if (noDeletes) {
      // Separate shallow and deep mutations
      const shallow: ObjectMutation[] = [];
      const deepByParent = new Map<string | number, ObjectMutation[]>();

      for (const mutation of mutations) {
        if (mutation.path.length === 1) {
          shallow.push(mutation);
        } else {
          const parent = mutation.path[0];
          if (!deepByParent.has(parent)) {
            deepByParent.set(parent, []);
          }
          deepByParent.get(parent)!.push(mutation);
        }
      }

      // If we have grouped deep mutations by parent (max 2 parents)
      if (deepByParent.size <= 2 && deepByParent.size > 0) {
        // Optimize: handle shallow directly, nested by parent
        const result: any = { ...base };

        // Apply shallow mutations inline
        for (const mutation of shallow) {
          result[mutation.path[0]] = getMutationValue(mutation, base);
        }

        // Apply deep mutations recursively by parent
        for (const [parent, muts] of deepByParent) {
          const parentValue = (base as any)[parent];

          // Recursively apply nested mutations by shifting paths
          const shiftedMuts: ObjectMutation[] = muts.map(m => ({
            ...m,
            path: m.path.slice(1)
          }));

          // Recursively apply (will hit Pattern 2/3/4 for simple cases)
          result[parent] = applyMutationsBatch(parentValue, shiftedMuts);
        }

        return result as T;
      }
    }
  }

  // ===== General Cases =====

  // Medium batch (4-20 mutations): use direct construction
  if (mutations.length <= 20) {
    return applyDirectConstruction(base, mutations);
  }

  // Large batch (20+ mutations): use mutation tree
  const tree = buildMutationTree(base, mutations);
  return applyMutationTree(base, tree);
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

// Import for pura detection (avoid circular dependency)
import { ARRAY_STATE_ENV, produceArray } from './internal/array-proxy';
import { MAP_STATE_ENV, produceMap } from './internal/map-proxy';
import { SET_STATE_ENV, produceSet } from './internal/set-proxy';

// ===== Pre-created Helper Prototypes (Performance Optimization) =====
// Helper objects are structurally identical for each type, only the draft changes.
// By pre-creating prototypes and using Object.create(), we avoid object allocation overhead.
// Fixed shape for V8 Hidden Class optimization (JIT-friendly)

interface ArrayHelperShape<T> {
  __draft: T[];
}

interface MapHelperShape<K, V> {
  __draft: Map<K, V>;
}

interface SetHelperShape<T> {
  __draft: Set<T>;
}

const arrayHelperProto = {
  set<T>(this: ArrayHelperShape<T>, index: number, value: T): void {
    this.__draft[index] = value;
  },
  delete<T>(this: ArrayHelperShape<T>, index: number): void {
    this.__draft.splice(index, 1);
  },
  push<T>(this: ArrayHelperShape<T>, ...items: T[]): void {
    this.__draft.push(...items);
  },
  splice<T>(this: ArrayHelperShape<T>, start: number, deleteCount: number = 0, ...items: T[]): void {
    this.__draft.splice(start, deleteCount, ...items);
  },
  filter<T>(this: ArrayHelperShape<T>, fn: (item: T, index: number) => boolean): void {
    const toKeep: T[] = [];
    for (let i = 0; i < this.__draft.length; i++) {
      if (fn(this.__draft[i], i)) toKeep.push(this.__draft[i]);
    }
    this.__draft.length = 0;
    this.__draft.push(...toKeep);
  }
};

const mapHelperProto = {
  set<K, V>(this: MapHelperShape<K, V>, key: K, value: V): void {
    this.__draft.set(key, value);
  },
  delete<K, V>(this: MapHelperShape<K, V>, key: K): void {
    this.__draft.delete(key);
  },
  clear<K, V>(this: MapHelperShape<K, V>): void {
    this.__draft.clear();
  }
};

const setHelperProto = {
  add<T>(this: SetHelperShape<T>, value: T): void {
    this.__draft.add(value);
  },
  delete<T>(this: SetHelperShape<T>, value: T): void {
    this.__draft.delete(value);
  },
  clear<T>(this: SetHelperShape<T>): void {
    this.__draft.clear();
  }
};

/**
 * ProduceFast: Immutable mutation without proxy tracking
 *
 * Usage:
 * - Array: produceFast(arr, $ => { $.push(1); $.set(0, 2); })
 * - Map: produceFast(map, $ => { $.set('key', 'value'); })
 * - Set: produceFast(set, $ => { $.add('item'); })
 * - Object: produceFast(obj, $ => { $.set(['user', 'name'], 'Alice'); })
 *
 * Performance optimization:
 * - For pura tree structures (arrays/maps/sets >= threshold), delegates to produce()
 * - For native structures, uses mutation-collection API (faster for small collections)
 */
export function produceFast<T>(
  base: T,
  recipe: (helper: FastHelper<T>) => void
): T {
  // Check if it's pura tree → delegate to produceArray/Map/Set for optimal performance
  if (Array.isArray(base) && ARRAY_STATE_ENV.has(base as unknown[])) {
    // Pura array: use produceArray with pre-created helper prototype
    // Fixed shape ensures V8 Hidden Class optimization (JIT-friendly)
    return produceArray(base, <U>(draft: U[]) => {
      const helper = Object.create(arrayHelperProto) as ArrayHelperShape<U>;
      helper.__draft = draft;
      recipe(helper as unknown as FastHelper<T>);
    }) as T;
  }

  if (base instanceof Map && MAP_STATE_ENV.has(base)) {
    // Pura map: use produceMap with pre-created helper prototype
    return produceMap(base, <K, V>(draft: Map<K, V>) => {
      const helper = Object.create(mapHelperProto) as MapHelperShape<K, V>;
      helper.__draft = draft;
      recipe(helper as unknown as FastHelper<T>);
    }) as T;
  }

  if (base instanceof Set && SET_STATE_ENV.has(base)) {
    // Pura set: use produceSet with pre-created helper prototype
    return produceSet(base, <U>(draft: Set<U>) => {
      const helper = Object.create(setHelperProto) as SetHelperShape<U>;
      helper.__draft = draft;
      recipe(helper as unknown as FastHelper<T>);
    }) as T;
  }

  // Native structures: use fast path (mutation-collection)
  if (Array.isArray(base)) {
    type ElementType = T extends Array<infer E> ? E : never;
    return produceFastArray<ElementType>(
      base as Array<ElementType>,
      recipe as (helper: ArrayHelper<ElementType>) => void
    ) as T;
  }

  if (base instanceof Map) {
    type KeyType = T extends Map<infer K, infer V> ? K : never;
    type ValueType = T extends Map<infer K, infer V> ? V : never;
    return produceFastMap<KeyType, ValueType>(
      base as Map<KeyType, ValueType>,
      recipe as (helper: MapHelper<KeyType, ValueType>) => void
    ) as T;
  }

  if (base instanceof Set) {
    type ValueType = T extends Set<infer V> ? V : never;
    return produceFastSet<ValueType>(
      base as Set<ValueType>,
      recipe as (helper: SetHelper<ValueType>) => void
    ) as T;
  }

  if (base !== null && typeof base === 'object') {
    type ObjectType = T extends object ? T : never;
    return produceFastObject<ObjectType>(
      base as ObjectType,
      recipe as (helper: ObjectHelper<ObjectType>) => void
    ) as T;
  }

  return base;
}
