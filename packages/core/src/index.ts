/**
 * Pura v4.5 Diamond – Vec + Object + HAMT Map + HAMT Set
 *
 * - pura([])        → Bit-trie persistent vector proxy
 * - pura({})        → Deep Immer-style object proxy
 * - pura(new Map)   → HAMT-style persistent Map proxy
 * - pura(new Set)   → HAMT-style persistent Set proxy
 * - produce(...)    → 同一 API 操作四種結構
 */

const BITS = 5;
const BRANCH_FACTOR = 1 << BITS;
const MASK = BRANCH_FACTOR - 1;

// Popcount helper for CHAMP bitmap operations
function popcount(x: number): number {
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

type Owner = object | undefined;

// =====================================================
// Nested Object Proxy (for objects & nested values)
// =====================================================

const NESTED_PROXY_STATE = Symbol('NESTED_PROXY_STATE');
const NESTED_MAP_STATE = Symbol('NESTED_MAP_STATE');
const NESTED_SET_STATE = Symbol('NESTED_SET_STATE');

// Global cache: base object → proxy
// This ensures the same underlying object always returns the same proxy
const PROXY_CACHE = new WeakMap<object, any>();

interface NestedProxyState<T> {
  base: T;
  copy: T | undefined;
  childProxies: Map<string | symbol, any>;
}

interface NestedMapState<K, V> {
  base: Map<K, V>;
  copy: Map<K, V> | undefined;
  modified: boolean;
}

interface NestedSetState<T> {
  base: Set<T>;
  copy: Set<T> | undefined;
  modified: boolean;
}

// Create a draft Map proxy for use inside nested object proxies
function createNestedMapProxy<K, V>(
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

// Create a draft Set proxy for use inside nested object proxies
function createNestedSetProxy<T>(
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

function createNestedProxy<T extends object>(
  base: T,
  onMutate: () => void
): T {
  // If base is frozen/sealed, create a mutable copy for the proxy target
  // This avoids Proxy invariant violations on set
  const proxyTarget = (Object.isFrozen(base) || Object.isSealed(base))
    ? (Array.isArray(base) ? [...base] as T : { ...base })
    : base;

  let copy: T | undefined;
  const childProxies = new Map<string | symbol, any>();

  const getCopy = (): T => {
    if (!copy) {
      // Spread creates a new mutable object even if base was frozen
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
        // Skip proxying non-mutable special objects
        if (value instanceof Date || value instanceof RegExp ||
            value instanceof Error || value instanceof Promise ||
            ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
          return value;
        }

        if (!childProxies.has(prop)) {
          // Handle Map - create a draft proxy
          if (value instanceof Map) {
            const mapDraft = createNestedMapProxy(value as Map<any, any>, () => {
              getCopy();
            });
            childProxies.set(prop, mapDraft);
          }
          // Handle Set - create a draft proxy
          else if (value instanceof Set) {
            const setDraft = createNestedSetProxy(value as Set<any>, () => {
              getCopy();
            });
            childProxies.set(prop, setDraft);
          }
          // Handle regular objects
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
          'push',
          'pop',
          'shift',
          'unshift',
          'splice',
          'sort',
          'reverse',
          'fill',
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

// Check if a proxy was actually modified (recursive)
function isProxyModified(proxy: any): boolean {
  if (proxy === null || typeof proxy !== 'object') return false;

  const mapState = (proxy as any)[NESTED_MAP_STATE];
  if (mapState) return !!mapState.copy;

  const setState = (proxy as any)[NESTED_SET_STATE];
  if (setState) return !!setState.copy;

  const nestedState = (proxy as any)[NESTED_PROXY_STATE];
  if (!nestedState) return false;

  // If we have a direct copy, it's modified
  if (nestedState.copy) return true;

  // Recursively check if any child is modified
  for (const childProxy of nestedState.childProxies.values()) {
    if (isProxyModified(childProxy)) return true;
  }

  return false;
}

function extractNestedValue<T>(proxy: T): T {
  if (proxy === null || typeof proxy !== 'object') return proxy;

  // Handle nested Map proxy
  const mapState = (proxy as any)[NESTED_MAP_STATE] as NestedMapState<any, any> | undefined;
  if (mapState) {
    return (mapState.copy || mapState.base) as T;
  }

  // Handle nested Set proxy
  const setState = (proxy as any)[NESTED_SET_STATE] as NestedSetState<any> | undefined;
  if (setState) {
    return (setState.copy || setState.base) as T;
  }

  const state = (proxy as any)[NESTED_PROXY_STATE] as
    | NestedProxyState<T>
    | undefined;
  if (!state) return proxy;

  // Check if any child was actually modified (recursively)
  let hasModifiedChild = false;
  const modifiedChildren = new Map<string | symbol, any>();

  for (const [key, childProxy] of state.childProxies) {
    if (isProxyModified(childProxy)) {
      hasModifiedChild = true;
      modifiedChildren.set(key, extractNestedValue(childProxy));
    }
  }

  // If no copy and no modified children, return original base
  if (!state.copy && !hasModifiedChild) {
    return state.base;
  }

  let result = state.copy || state.base;

  // Only create a copy if we have modified children but no existing copy
  if (hasModifiedChild && !state.copy) {
    result = Array.isArray(result)
      ? ([...result] as T)
      : ({ ...(result as any) } as T);
  }

  // Apply only the modified children
  for (const [key, finalChild] of modifiedChildren) {
    (result as any)[key] = finalChild;
  }

  return result;
}

// =====================================================
// Vec (Bit-trie Persistent Vector for Arrays)
// =====================================================

interface Node<T> {
  owner?: Owner;
  arr: any[];
}

interface Vec<T> {
  count: number;
  shift: number;
  root: Node<T>;
  tail: T[];
  treeCount: number; // count - tail.length
}

function emptyNode<T>(): Node<T> {
  return { arr: [] };
}

function emptyVec<T>(): Vec<T> {
  return {
    count: 0,
    shift: BITS,
    root: emptyNode<T>(),
    tail: [],
    treeCount: 0,
  };
}

function ensureEditableNode<T>(node: Node<T>, owner: Owner): Node<T> {
  if (owner && node.owner === owner) return node;
  return {
    owner,
    arr: node.arr.slice(),
  };
}

function newPath<T>(owner: Owner, level: number, node: Node<T>): Node<T> {
  if (level === 0) return node;
  let cur: Node<T> = node;
  while (level > 0) {
    cur = { owner, arr: [cur] };
    level -= BITS;
  }
  return cur;
}

function pushTail<T>(
  owner: Owner,
  level: number,
  parent: Node<T>,
  count: number,
  tailNode: Node<T>
): Node<T> {
  const ret = ensureEditableNode(parent, owner);
  const subidx = ((count - 1) >>> level) & MASK;

  if (level === BITS) {
    ret.arr[subidx] = tailNode;
    return ret;
  } else {
    const child = ret.arr[subidx] as Node<T> | undefined;
    if (child) {
      ret.arr[subidx] = pushTail(owner, level - BITS, child, count, tailNode);
    } else {
      ret.arr[subidx] = newPath(owner, level - BITS, tailNode);
    }
    return ret;
  }
}

function vecPush<T>(vec: Vec<T>, owner: Owner, val: T): Vec<T> {
  const { count, shift, root, tail, treeCount } = vec;

  if (tail.length < BRANCH_FACTOR) {
    if (owner) {
      tail.push(val);
      return { count: count + 1, shift, root, tail, treeCount };
    } else {
      return {
        count: count + 1,
        shift,
        root,
        tail: [...tail, val],
        treeCount,
      };
    }
  }

  const tailNode: Node<T> = { owner, arr: tail };
  const newTail: T[] = [val];
  const newTreeCount = treeCount + BRANCH_FACTOR;

  if ((treeCount >>> shift) >= BRANCH_FACTOR) {
    const newRoot: Node<T> = {
      owner,
      arr: [root, newPath(owner, shift, tailNode)],
    };
    return {
      count: count + 1,
      shift: shift + BITS,
      root: newRoot,
      tail: newTail,
      treeCount: newTreeCount,
    };
  }

  const newRoot = pushTail(owner, shift, root, count, tailNode);
  return {
    count: count + 1,
    shift,
    root: newRoot,
    tail: newTail,
    treeCount: newTreeCount,
  };
}

function vecAssoc<T>(vec: Vec<T>, owner: Owner, index: number, val: T): Vec<T> {
  const { count, shift, root, tail, treeCount } = vec;
  if (index < 0 || index >= count) {
    throw new RangeError('Index out of bounds');
  }

  if (index >= treeCount) {
    const tailIdx = index - treeCount;
    if (owner) {
      tail[tailIdx] = val;
      return vec;
    }
    const newTail = tail.slice();
    newTail[tailIdx] = val;
    return { count, shift, root, tail: newTail, treeCount };
  }

  const doAssoc = (level: number, node: Node<T>): Node<T> => {
    const ret = ensureEditableNode(node, owner);
    if (level === 0) {
      ret.arr[index & MASK] = val;
      return ret;
    }
    const subidx = (index >>> level) & MASK;
    ret.arr[subidx] = doAssoc(level - BITS, ret.arr[subidx] as Node<T>);
    return ret;
  };

  const newRoot = doAssoc(shift, root);
  return { count, shift, root: newRoot, tail, treeCount };
}

function popTailFromTree<T>(
  owner: Owner,
  level: number,
  node: Node<T>,
  count: number
): { newNode: Node<T> | null; poppedLeaf: T[] } {
  const subidx = ((count - 1) >>> level) & MASK;

  if (level === BITS) {
    const leaf = node.arr[subidx] as Node<T>;
    const poppedLeaf = leaf.arr as T[];

    const newNode = ensureEditableNode(node, owner);
    newNode.arr = newNode.arr.slice(0, subidx);

    if (newNode.arr.length === 0) {
      return { newNode: null, poppedLeaf };
    }
    return { newNode, poppedLeaf };
  }

  const child = node.arr[subidx] as Node<T>;
  const result = popTailFromTree(owner, level - BITS, child, count);

  const newNode = ensureEditableNode(node, owner);

  if (result.newNode === null) {
    newNode.arr = newNode.arr.slice(0, subidx);
  } else {
    newNode.arr = newNode.arr.slice();
    newNode.arr[subidx] = result.newNode;
  }

  if (newNode.arr.length === 0) {
    return { newNode: null, poppedLeaf: result.poppedLeaf };
  }
  return { newNode, poppedLeaf: result.poppedLeaf };
}

function vecPop<T>(vec: Vec<T>, owner: Owner): { vec: Vec<T>; val: T | undefined } {
  const { count, root, tail, shift, treeCount } = vec;
  if (count === 0) return { vec, val: undefined };

  if (count === 1) {
    return { vec: emptyVec<T>(), val: tail[0] };
  }

  if (tail.length > 0) {
    const val = tail[tail.length - 1];
    if (owner) {
      tail.pop();
      return { vec: { count: count - 1, shift, root, tail, treeCount }, val };
    } else {
      return {
        vec: {
          count: count - 1,
          shift,
          root,
          tail: tail.slice(0, -1),
          treeCount,
        },
        val,
      };
    }
  }

  const { newNode, poppedLeaf } = popTailFromTree(owner, shift, root, treeCount);
  const newTail = owner ? poppedLeaf : poppedLeaf.slice();
  const val = newTail.pop();

  let newRoot = newNode || emptyNode<T>();
  let newShift = shift;

  if (newRoot.arr.length === 1 && shift > BITS) {
    newRoot = newRoot.arr[0] as Node<T>;
    newShift = shift - BITS;
  }

  const newTreeCount = treeCount - BRANCH_FACTOR;

  return {
    vec: {
      count: count - 1,
      shift: newShift,
      root: newRoot,
      tail: newTail,
      treeCount: newTreeCount,
    },
    val,
  };
}

function vecGet<T>(vec: Vec<T>, index: number): T | undefined {
  const { count, shift, root, tail, treeCount } = vec;
  if (index < 0 || index >= count) return undefined;

  if (index >= treeCount) {
    return tail[index - treeCount];
  }

  switch (shift) {
    case BITS: {
      const leaf = root.arr[index >>> BITS] as Node<T>;
      return leaf.arr[index & MASK] as T;
    }
    case BITS * 2: {
      const node1 = root.arr[index >>> (BITS * 2)] as Node<T>;
      const leaf = node1.arr[(index >>> BITS) & MASK] as Node<T>;
      return leaf.arr[index & MASK] as T;
    }
    case BITS * 3: {
      const node1 = root.arr[index >>> (BITS * 3)] as Node<T>;
      const node2 = node1.arr[(index >>> (BITS * 2)) & MASK] as Node<T>;
      const leaf = node2.arr[(index >>> BITS) & MASK] as Node<T>;
      return leaf.arr[index & MASK] as T;
    }
    default: {
      let node: Node<T> = root;
      let level = shift;
      while (level > 0) {
        node = node.arr[(index >>> level) & MASK] as Node<T>;
        level -= BITS;
      }
      return node.arr[index & MASK] as T;
    }
  }
}

function vecFromArray<T>(arr: T[]): Vec<T> {
  let vec = emptyVec<T>();
  const owner: Owner = {};
  for (let i = 0; i < arr.length; i++) {
    vec = vecPush(vec, owner, arr[i]!);
  }
  return vec;
}

function vecToArray<T>(vec: Vec<T>): T[] {
  const { count, shift, root, tail, treeCount } = vec;
  const arr = new Array<T>(count);
  let idx = 0;

  const step = (level: number, node: Node<T>) => {
    if (level === 0) {
      const leaf = node.arr as T[];
      for (let i = 0; i < leaf.length && idx < treeCount; i++) {
        arr[idx++] = leaf[i]!;
      }
    } else {
      const children = node.arr as Node<T>[];
      for (let i = 0; i < children.length && idx < treeCount; i++) {
        step(level - BITS, children[i]!);
      }
    }
  };

  if (treeCount > 0) {
    step(shift, root);
  }

  for (let i = 0; i < tail.length; i++) {
    arr[idx++] = tail[i]!;
  }

  return arr;
}

// =====================================================
// Array Proxy State & Handler
// =====================================================

interface PuraArrayState<T> {
  vec: Vec<T>;
  isDraft: boolean;
  owner?: Owner;
  modified: boolean;
  fallback?: T[];
  proxies?: Map<number, any>;
  cachedLeaf?: T[];
  cachedLeafStart?: number;
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

  const proxy = new Proxy([] as T[], {
    get(target, prop, receiver) {
      if (state.fallback) {
        const val = Reflect.get(state.fallback, prop, receiver);
        if (typeof val === 'function') return val.bind(state.fallback);
        return val;
      }

      if (prop === '__PURA_STATE__') return state;
      if (prop === 'length') return state.vec.count;

      if (typeof prop === 'string') {
        const idx = Number(prop);
        if (!Number.isNaN(idx)) {
          if (idx >= 0 && idx < state.vec.count) {
            const cachedProxy = state.proxies?.get(idx);
            if (cachedProxy) return cachedProxy;

            const value = vecGetCached(state, idx);

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
          return () => vecToArray(state.vec);

        case Symbol.iterator:
          return function* () {
            const v = state.vec;
            for (let i = 0; i < v.count; i++) {
              const val = vecGet(v, i)!;
              if (state.isDraft && val !== null && typeof val === 'object') {
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
            }
          };

        case 'map':
        case 'filter':
        case 'slice':
        case 'concat':
        case 'reduce':
        case 'forEach':
        case 'some':
        case 'every':
        case 'includes':
        case 'indexOf':
        case 'join':
        case 'find':
        case 'findIndex':
          return (...args: any[]) => {
            const arr = vecToArray(state.vec) as any;
            const fn = arr[prop as keyof any];
            return fn.apply(arr, args);
          };

        case 'splice':
        case 'sort':
        case 'reverse':
        case 'shift':
        case 'unshift':
        case 'fill':
          return (...args: any[]) => {
            // eslint-disable-next-line no-console
            console.warn(`Pura: De-optimizing for ${String(prop)}`);
            state.fallback = vecToArray(state.vec);
            state.modified = true;
            const fb: any = state.fallback;
            return fb[prop as keyof any](...args);
          };
      }

      return Reflect.get(target, prop, receiver);
    },

    set(target, prop, value, receiver) {
      if (state.fallback) {
        state.modified = true;
        return Reflect.set(state.fallback, prop, value, receiver);
      }

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
        // Expand: fallback to native array
        console.warn('Pura: De-optimizing for length expansion');
        state.fallback = vecToArray(state.vec);
        state.modified = true;
        (state.fallback as any).length = newLen;
        return true;
      }

      if (typeof prop === 'string') {
        const idx = Number(prop);
        if (!Number.isNaN(idx)) {
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
      if (state.fallback) return Reflect.ownKeys(state.fallback);
      const keys: (string | symbol)[] = [];
      for (let i = 0; i < state.vec.count; i++) {
        keys.push(String(i));
      }
      keys.push('length');
      return keys;
    },

    getOwnPropertyDescriptor(target, prop) {
      if (state.fallback) {
        return Reflect.getOwnPropertyDescriptor(state.fallback, prop);
      }
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
      if (state.fallback) return prop in state.fallback;
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
  let baseVec: Vec<T>;
  const baseState = ARRAY_STATE_ENV.get(base);
  if (baseState) {
    baseVec = baseState.fallback
      ? vecFromArray(baseState.fallback)
      : baseState.vec;
  } else {
    baseVec = vecFromArray(base);
  }

  const draftOwner: Owner = {};
  const draftVec: Vec<T> = {
    count: baseVec.count,
    shift: baseVec.shift,
    root: baseVec.root,
    tail: baseVec.tail.slice(),
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

  if (!draftState.modified && !draftState.fallback) {
    return base;
  }

  const finalVec: Vec<T> = draftState.fallback
    ? vecFromArray(draftState.fallback)
    : draftState.vec;

  const finalState: PuraArrayState<T> = {
    vec: finalVec,
    isDraft: false,
    owner: undefined,
    modified: false,
  };

  return createArrayProxy<T>(finalState);
}

// =====================================================
// HAMT Core (Map & Set 共用)
// =====================================================

interface HLeaf<K, V> {
  kind: 'leaf';
  key: K;
  hash: number;
  value: V;
}

interface HCollision<K, V> {
  kind: 'collision';
  entries: HLeaf<K, V>[];
}

interface HNode<K, V> {
  kind: 'node';
  owner?: Owner;
  bitmap: number;          // 32-bit bitmap indicating which slots are used
  children: HChild<K, V>[]; // packed array, length === popcount(bitmap)
}

type HChild<K, V> = HLeaf<K, V> | HCollision<K, V> | HNode<K, V>;

interface HMap<K, V> {
  root: HChild<K, V> | null;
  size: number;
}

function hamtEmpty<K, V>(): HMap<K, V> {
  return { root: null, size: 0 };
}

// Identity hash caches for object and symbol keys
const OBJ_HASH = new WeakMap<object, number>();
let OBJ_SEQ = 1;
const SYM_HASH = new Map<symbol, number>();
let SYM_SEQ = 1;

// Murmur3 32-bit hash for strings (better distribution than simple multiply-add)
function murmur3(key: string, seed = 0): number {
  let h = seed ^ key.length;
  let k: number;
  let i = 0;

  while (i + 4 <= key.length) {
    k =
      (key.charCodeAt(i) & 0xff) |
      ((key.charCodeAt(i + 1) & 0xff) << 8) |
      ((key.charCodeAt(i + 2) & 0xff) << 16) |
      ((key.charCodeAt(i + 3) & 0xff) << 24);
    i += 4;
    k = Math.imul(k, 0xcc9e2d51);
    k = (k << 15) | (k >>> 17);
    k = Math.imul(k, 0x1b873593);
    h ^= k;
    h = (h << 13) | (h >>> 19);
    h = (Math.imul(h, 5) + 0xe6546b64) | 0;
  }

  // tail
  k = 0;
  switch (key.length & 3) {
    case 3:
      k ^= (key.charCodeAt(i + 2) & 0xff) << 16;
    // falls through
    case 2:
      k ^= (key.charCodeAt(i + 1) & 0xff) << 8;
    // falls through
    case 1:
      k ^= key.charCodeAt(i) & 0xff;
      k = Math.imul(k, 0xcc9e2d51);
      k = (k << 15) | (k >>> 17);
      k = Math.imul(k, 0x1b873593);
      h ^= k;
  }

  // fmix
  h ^= key.length;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

function hashKey(key: any): number {
  switch (typeof key) {
    case 'string':
      return murmur3(key);
    case 'number': {
      const n = Object.is(key, -0) ? 0 : key;
      // Simple hash for numbers - combine integer and fractional parts
      const h = (Math.imul(n | 0, 0x85ebca6b) ^ Math.imul((n * 4294967296) | 0, 0xc2b2ae35)) | 0;
      return h >>> 0;
    }
    case 'boolean':
      return key ? 0x27d4eb2d : 0x165667b1;
    case 'bigint': {
      const s = key.toString();
      let h = 0;
      for (let i = 0; i < s.length; i++) {
        h = (h * 33 + s.charCodeAt(i)) | 0;
      }
      return h >>> 0;
    }
    case 'symbol': {
      let id = SYM_HASH.get(key);
      if (id === undefined) {
        id = SYM_SEQ++;
        SYM_HASH.set(key, id);
      }
      return (id * 0x9e3779b1) >>> 0;
    }
    case 'object':
      if (key === null) return 0x811c9dc5;
      {
        let id = OBJ_HASH.get(key);
        if (id === undefined) {
          id = OBJ_SEQ++;
          OBJ_HASH.set(key, id);
        }
        return (id * 0x85ebca77) >>> 0;
      }
    default:
      return 0x9747b28c;
  }
}

function keyEquals(a: any, b: any): boolean {
  // Handle -0 same as 0 for Map/Set semantics (SameValueZero)
  if (typeof a === 'number' && typeof b === 'number') {
    if (a === 0 && b === 0) return true;
  }
  return Object.is(a, b);
}

function ensureEditableHNode<K, V>(node: HNode<K, V>, owner: Owner): HNode<K, V> {
  if (owner && node.owner === owner) return node;
  return {
    kind: 'node',
    owner,
    bitmap: node.bitmap,
    children: node.children.slice(),
  };
}

function mergeLeaves<K, V>(
  leaf1: HLeaf<K, V>,
  leaf2: HLeaf<K, V>,
  owner: Owner,
  shift: number
): HNode<K, V> {
  let s = shift;

  while (true) {
    const idx1 = (leaf1.hash >>> s) & MASK;
    const idx2 = (leaf2.hash >>> s) & MASK;

    if (idx1 === idx2) {
      // Same slot - need deeper node
      const bit = 1 << idx1;
      const child = mergeLeaves(leaf1, leaf2, owner, s + BITS);
      return {
        kind: 'node',
        owner,
        bitmap: bit,
        children: [child],
      };
    } else {
      // Different slots - create node with both leaves
      const bit1 = 1 << idx1;
      const bit2 = 1 << idx2;
      const bitmap = bit1 | bit2;
      // Children ordered by bit position (lower index first)
      const children = idx1 < idx2 ? [leaf1, leaf2] : [leaf2, leaf1];
      return {
        kind: 'node',
        owner,
        bitmap,
        children,
      };
    }
  }
}

function hamtInsert<K, V>(
  node: HChild<K, V> | null,
  owner: Owner,
  hash: number,
  key: K,
  value: V,
  shift: number
): { node: HChild<K, V>; added: boolean; changed: boolean } {
  if (!node) {
    return {
      node: { kind: 'leaf', key, hash, value },
      added: true,
      changed: true,
    };
  }

  if (node.kind === 'leaf') {
    const leaf = node;
    if (leaf.hash === hash && keyEquals(leaf.key, key)) {
      if (leaf.value === value) {
        return { node: leaf, added: false, changed: false };
      }
      return {
        node: { kind: 'leaf', key, hash, value },
        added: false,
        changed: true,
      };
    }

    if (leaf.hash === hash && !keyEquals(leaf.key, key)) {
      const entries: HLeaf<K, V>[] = [leaf, { kind: 'leaf', key, hash, value }];
      return {
        node: { kind: 'collision', entries },
        added: true,
        changed: true,
      };
    }

    const newLeaf: HLeaf<K, V> = { kind: 'leaf', key, hash, value };
    const merged = mergeLeaves(leaf, newLeaf, owner, shift);
    return { node: merged, added: true, changed: true };
  }

  if (node.kind === 'collision') {
    const entries = node.entries;
    let idx = -1;
    for (let i = 0; i < entries.length; i++) {
      if (keyEquals(entries[i].key, key)) {
        idx = i;
        break;
      }
    }

    if (idx >= 0) {
      const existing = entries[idx];
      if (existing.value === value) {
        return { node, added: false, changed: false };
      }
      const newEntries = entries.slice();
      newEntries[idx] = { kind: 'leaf', key, hash, value };
      return {
        node: { kind: 'collision', entries: newEntries },
        added: false,
        changed: true,
      };
    } else {
      const newEntries = entries.slice();
      newEntries.push({ kind: 'leaf', key, hash, value });
      return {
        node: { kind: 'collision', entries: newEntries },
        added: true,
        changed: true,
      };
    }
  }

  // node.kind === 'node' (CHAMP bitmap-indexed)
  const n = node;
  const idx = (hash >>> shift) & MASK;
  const bit = 1 << idx;
  const hasSlot = (n.bitmap & bit) !== 0;
  const packedIdx = popcount(n.bitmap & (bit - 1));

  if (!hasSlot) {
    // Slot is empty - insert new leaf
    const newLeaf: HLeaf<K, V> = { kind: 'leaf', key, hash, value };
    const newChildren = n.children.slice();
    newChildren.splice(packedIdx, 0, newLeaf);
    return {
      node: {
        kind: 'node',
        owner,
        bitmap: n.bitmap | bit,
        children: newChildren,
      },
      added: true,
      changed: true,
    };
  }

  // Slot exists - recurse
  const child = n.children[packedIdx];
  const res = hamtInsert(child, owner, hash, key, value, shift + BITS);
  if (!res.changed && !res.added) {
    return { node, added: false, changed: false };
  }

  const editable = ensureEditableHNode(n, owner);
  editable.children[packedIdx] = res.node;
  return {
    node: editable,
    added: res.added,
    changed: true,
  };
}

function hamtRemove<K, V>(
  node: HChild<K, V> | null,
  owner: Owner,
  hash: number,
  key: K,
  shift: number
): { node: HChild<K, V> | null; removed: boolean } {
  if (!node) return { node, removed: false };

  if (node.kind === 'leaf') {
    const leaf = node;
    if (leaf.hash === hash && keyEquals(leaf.key, key)) {
      return { node: null, removed: true };
    }
    return { node, removed: false };
  }

  if (node.kind === 'collision') {
    const entries = node.entries;
    let idx = -1;
    for (let i = 0; i < entries.length; i++) {
      if (keyEquals(entries[i].key, key)) {
        idx = i;
        break;
      }
    }
    if (idx === -1) return { node, removed: false };
    if (entries.length === 1) {
      return { node: null, removed: true };
    }
    const newEntries = entries.slice();
    newEntries.splice(idx, 1);
    // Compress to leaf if only one entry remains
    if (newEntries.length === 1) {
      return { node: newEntries[0], removed: true };
    }
    return {
      node: { kind: 'collision', entries: newEntries },
      removed: true,
    };
  }

  // node.kind === 'node' (CHAMP bitmap-indexed)
  const n = node;
  const idx = (hash >>> shift) & MASK;
  const bit = 1 << idx;
  if ((n.bitmap & bit) === 0) {
    // Slot doesn't exist
    return { node, removed: false };
  }

  const packedIdx = popcount(n.bitmap & (bit - 1));
  const child = n.children[packedIdx];

  const res = hamtRemove(child, owner, hash, key, shift + BITS);
  if (!res.removed) return { node, removed: false };

  if (res.node === null) {
    // Child was removed entirely
    const newBitmap = n.bitmap ^ bit; // Clear the bit
    if (newBitmap === 0) {
      // Node is now empty
      return { node: null, removed: true };
    }
    const newChildren = n.children.slice();
    newChildren.splice(packedIdx, 1);

    // Compress: if only one child remains and it's a leaf/collision, promote it
    if (newChildren.length === 1 && newChildren[0].kind !== 'node') {
      return { node: newChildren[0], removed: true };
    }

    return {
      node: {
        kind: 'node',
        owner,
        bitmap: newBitmap,
        children: newChildren,
      },
      removed: true,
    };
  }

  // Child was updated (not removed)
  const editable = ensureEditableHNode(n, owner);
  editable.children[packedIdx] = res.node;
  return { node: editable, removed: true };
}

function hamtGet<K, V>(map: HMap<K, V>, key: K): V | undefined {
  if (!map.root) return undefined;
  const hash = hashKey(key);
  let node = map.root as HChild<K, V>;
  let shift = 0;

  while (node) {
    if (node.kind === 'leaf') {
      return node.hash === hash && keyEquals(node.key, key)
        ? node.value
        : undefined;
    }
    if (node.kind === 'collision') {
      for (const leaf of node.entries) {
        if (keyEquals(leaf.key, key)) return leaf.value;
      }
      return undefined;
    }
    // CHAMP bitmap-indexed node
    const idx = (hash >>> shift) & MASK;
    const bit = 1 << idx;
    if ((node.bitmap & bit) === 0) return undefined;
    const packedIdx = popcount(node.bitmap & (bit - 1));
    node = node.children[packedIdx];
    shift += BITS;
  }

  return undefined;
}

// Proper has check - returns true even if value is undefined
function hamtHas<K, V>(map: HMap<K, V>, key: K): boolean {
  if (!map.root) return false;
  const hash = hashKey(key);
  let node = map.root as HChild<K, V>;
  let shift = 0;

  while (node) {
    if (node.kind === 'leaf') {
      return node.hash === hash && keyEquals(node.key, key);
    }
    if (node.kind === 'collision') {
      for (const leaf of node.entries) {
        if (keyEquals(leaf.key, key)) return true;
      }
      return false;
    }
    // CHAMP bitmap-indexed node
    const idx = (hash >>> shift) & MASK;
    const bit = 1 << idx;
    if ((node.bitmap & bit) === 0) return false;
    const packedIdx = popcount(node.bitmap & (bit - 1));
    node = node.children[packedIdx];
    shift += BITS;
  }

  return false;
}

function hamtSet<K, V>(map: HMap<K, V>, owner: Owner, key: K, value: V): HMap<K, V> {
  const hash = hashKey(key);
  const res = hamtInsert(map.root, owner, hash, key, value, 0);
  if (!res.changed) return map;
  return {
    root: res.node,
    size: map.size + (res.added ? 1 : 0),
  };
}

function hamtDelete<K, V>(map: HMap<K, V>, owner: Owner, key: K): HMap<K, V> {
  if (!map.root) return map;
  const hash = hashKey(key);
  const res = hamtRemove(map.root, owner, hash, key, 0);
  if (!res.removed) return map;
  return {
    root: res.node,
    size: map.size - 1,
  };
}

function hamtFromMap<K, V>(m: Map<K, V>): HMap<K, V> {
  let map = hamtEmpty<K, V>();
  const owner: Owner = {};
  for (const [k, v] of m) {
    map = hamtSet(map, owner, k, v);
  }
  return map;
}

// Generator-based iterator: O(1) space, no intermediate array
function* hamtIter<K, V>(map: HMap<K, V>): IterableIterator<[K, V]> {
  const root = map.root;
  if (!root) return;

  const stack: HChild<K, V>[] = [root];
  while (stack.length) {
    const node = stack.pop()!;
    if (node.kind === 'leaf') {
      yield [node.key, node.value];
    } else if (node.kind === 'collision') {
      for (const leaf of node.entries) {
        yield [leaf.key, leaf.value];
      }
    } else {
      // CHAMP: packed array, push all children in reverse order
      const children = node.children;
      for (let i = children.length - 1; i >= 0; i--) {
        stack.push(children[i]);
      }
    }
  }
}

// Array-based (for compatibility with existing code that needs array)
function hamtToEntries<K, V>(map: HMap<K, V>): [K, V][] {
  return [...hamtIter(map)];
}

// =====================================================
// OrderIndex for insertion order preservation
// =====================================================

interface OrderIndex<K> {
  next: number;
  keyToIdx: HMap<K, number>;
  idxToKey: HMap<number, K>;
}

function orderEmpty<K>(): OrderIndex<K> {
  return { next: 0, keyToIdx: hamtEmpty(), idxToKey: hamtEmpty() };
}

function orderFromBase<K, V>(base: Map<K, V>): OrderIndex<K> {
  let keyToIdx = hamtEmpty<K, number>();
  let idxToKey = hamtEmpty<number, K>();
  let i = 0;
  const owner: Owner = {};
  for (const k of base.keys()) {
    keyToIdx = hamtSet(keyToIdx, owner, k, i);
    idxToKey = hamtSet(idxToKey, owner, i, k);
    i++;
  }
  return { next: i, keyToIdx, idxToKey };
}

function orderAppend<K>(ord: OrderIndex<K>, owner: Owner, key: K): OrderIndex<K> {
  const idx = ord.next;
  return {
    next: idx + 1,
    keyToIdx: hamtSet(ord.keyToIdx, owner, key, idx),
    idxToKey: hamtSet(ord.idxToKey, owner, idx, key),
  };
}

function orderDelete<K>(ord: OrderIndex<K>, owner: Owner, key: K): OrderIndex<K> {
  const idx = hamtGet(ord.keyToIdx, key);
  if (idx === undefined) return ord;
  return {
    next: ord.next,
    keyToIdx: hamtDelete(ord.keyToIdx, owner, key),
    idxToKey: hamtDelete(ord.idxToKey, owner, idx),
  };
}

function* orderIter<K>(ord: OrderIndex<K>): IterableIterator<K> {
  for (let i = 0; i < ord.next; i++) {
    const k = hamtGet(ord.idxToKey, i);
    if (k !== undefined) yield k;
  }
}

function orderFromSetBase<T>(base: Set<T>): OrderIndex<T> {
  let keyToIdx = hamtEmpty<T, number>();
  let idxToKey = hamtEmpty<number, T>();
  let i = 0;
  const owner: Owner = {};
  for (const v of base) {
    keyToIdx = hamtSet(keyToIdx, owner, v, i);
    idxToKey = hamtSet(idxToKey, owner, i, v);
    i++;
  }
  return { next: i, keyToIdx, idxToKey };
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
  ordered?: OrderIndex<K> | null;  // null = unordered, OrderIndex = ordered
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
          // Update order if ordered and new key
          if (!had && state.ordered) {
            state.ordered = orderAppend(state.ordered, state.owner, key);
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

      // Helper: get keys in order (insertion order if ordered, hash order otherwise)
      const iterKeys = function* (): IterableIterator<K> {
        if (state.ordered) {
          yield* orderIter(state.ordered);
        } else {
          for (const [k] of hamtIter(state.map)) {
            yield k;
          }
        }
      };

      // Helper: wrap value in proxy if draft mode
      const wrapValue = (k: K, rawV: V): V => {
        let v = rawV as any;
        if (state.isDraft && v !== null && typeof v === 'object') {
          let p = state.valueProxies!.get(k);
          if (!p) {
            if (v instanceof Map) {
              p = createNestedMapProxy(v, () => { state.modified = true; });
            } else if (v instanceof Set) {
              p = createNestedSetProxy(v, () => { state.modified = true; });
            } else {
              p = createNestedProxy(v, () => { state.modified = true; });
            }
            state.valueProxies!.set(k, p);
          }
          v = p;
        }
        return v;
      };

      if (prop === Symbol.iterator || prop === 'entries') {
        return function* () {
          for (const k of iterKeys()) {
            const rawV = hamtGet(state.map, k) as V;
            yield [k, wrapValue(k, rawV)] as [K, V];
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
          for (const k of iterKeys()) {
            const rawV = hamtGet(state.map, k) as V;
            yield wrapValue(k, rawV);
          }
        };
      }

      if (prop === 'forEach') {
        return (cb: (value: V, key: K, map: Map<K, V>) => void, thisArg?: any) => {
          for (const k of iterKeys()) {
            const rawV = hamtGet(state.map, k) as V;
            cb.call(thisArg, wrapValue(k, rawV), k, proxy);
          }
        };
      }

      if (prop === 'toJSON') {
        return () => {
          const obj: any = {};
          for (const [k, v] of hamtToEntries(state.map) as [any, any][]) {
            obj[String(k)] = v;
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
    if (state.fallback) return state.fallback as any as T;
    return vecToArray(state.vec) as any as T;
  }

  if (value instanceof Map) {
    // Top-level HAMT Map
    const top = MAP_STATE_ENV.get(value as any);
    if (top) {
      // Preserve insertion order if ordered
      if (top.ordered) {
        const out = new Map();
        for (const k of orderIter(top.ordered)) {
          out.set(k, hamtGet(top.map, k));
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
