/**
 * HAMT - Hash Array Mapped Trie
 * Bitmap-indexed trie for Maps and Sets
 */

import { BITS, MASK } from './constants';
import { popcount } from './utils';
import type { Owner } from './types';

// Hash caches
const OBJ_HASH = new WeakMap<object, number>();
let OBJ_SEQ = 1;
const SYM_HASH = new Map<symbol, number>();
let SYM_SEQ = 1;

// Types
export interface HLeaf<K, V> {
  kind: 'leaf';
  key: K;
  hash: number;
  value: V;
}

export interface HCollision<K, V> {
  kind: 'collision';
  entries: HLeaf<K, V>[];
}

export interface HNode<K, V> {
  kind: 'node';
  owner?: Owner;
  bitmap: number;
  children: HChild<K, V>[];
}

export type HChild<K, V> = HLeaf<K, V> | HCollision<K, V> | HNode<K, V>;

export interface HMap<K, V> {
  root: HChild<K, V> | null;
  size: number;
}

// Splitmix32 finalizer
function mix32(z: number): number {
  z = (z + 0x9e3779b9) | 0;
  z ^= z >>> 16;
  z = Math.imul(z, 0x85ebca6b);
  z ^= z >>> 13;
  z = Math.imul(z, 0xc2b2ae35);
  z ^= z >>> 16;
  return z >>> 0;
}

// Murmur3 32-bit hash for strings
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

  h ^= key.length;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export function hashKey(key: any): number {
  switch (typeof key) {
    case 'string':
      return murmur3(key);
    case 'number': {
      const n = Object.is(key, -0) ? 0 : key;
      return mix32((n | 0) ^ Math.imul((n * 4294967296) | 0, 0x9e3779b1));
    }
    case 'boolean':
      return key ? 0x27d4eb2d : 0x165667b1;
    case 'bigint': {
      let h = 0;
      const s = key.toString();
      for (let i = 0; i < s.length; i += 4) {
        const chunk = s.slice(i, i + 4);
        let v = 0;
        for (let j = 0; j < chunk.length; j++) {
          v = (v << 8) | chunk.charCodeAt(j);
        }
        h = mix32(h ^ v);
      }
      return h;
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

export function keyEquals(a: any, b: any): boolean {
  if (typeof a === 'number' && typeof b === 'number') {
    if (a === 0 && b === 0) return true;
  }
  return Object.is(a, b);
}

export function hamtEmpty<K, V>(): HMap<K, V> {
  return { root: null, size: 0 };
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
      const bit = 1 << idx1;
      const child = mergeLeaves(leaf1, leaf2, owner, s + BITS);
      return {
        kind: 'node',
        owner,
        bitmap: bit,
        children: [child],
      };
    } else {
      const bit1 = 1 << idx1;
      const bit2 = 1 << idx2;
      const bitmap = bit1 | bit2;
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

  // node.kind === 'node'
  const n = node;
  const idx = (hash >>> shift) & MASK;
  const bit = 1 << idx;
  const hasSlot = (n.bitmap & bit) !== 0;
  const packedIdx = popcount(n.bitmap & (bit - 1));

  if (!hasSlot) {
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
    if (newEntries.length === 1) {
      return { node: newEntries[0], removed: true };
    }
    return {
      node: { kind: 'collision', entries: newEntries },
      removed: true,
    };
  }

  // node.kind === 'node'
  const n = node;
  const idx = (hash >>> shift) & MASK;
  const bit = 1 << idx;
  if ((n.bitmap & bit) === 0) {
    return { node, removed: false };
  }

  const packedIdx = popcount(n.bitmap & (bit - 1));
  const child = n.children[packedIdx];

  const res = hamtRemove(child, owner, hash, key, shift + BITS);
  if (!res.removed) return { node, removed: false };

  if (res.node === null) {
    const newBitmap = n.bitmap ^ bit;
    if (newBitmap === 0) {
      return { node: null, removed: true };
    }
    const newChildren = n.children.slice();
    newChildren.splice(packedIdx, 1);

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

  const editable = ensureEditableHNode(n, owner);
  editable.children[packedIdx] = res.node;
  return { node: editable, removed: true };
}

export function hamtGet<K, V>(map: HMap<K, V>, key: K): V | undefined {
  const root = map.root;
  if (!root) return undefined;

  if (root.kind === 'leaf') {
    return keyEquals(root.key, key) ? root.value : undefined;
  }

  const hash = hashKey(key);
  let node = root as HChild<K, V>;
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
    const idx = (hash >>> shift) & MASK;
    const bit = 1 << idx;
    if ((node.bitmap & bit) === 0) return undefined;
    const packedIdx = popcount(node.bitmap & (bit - 1));
    node = node.children[packedIdx];
    shift += BITS;
  }

  return undefined;
}

export function hamtHas<K, V>(map: HMap<K, V>, key: K): boolean {
  const root = map.root;
  if (!root) return false;

  if (root.kind === 'leaf') {
    return keyEquals(root.key, key);
  }

  const hash = hashKey(key);
  let node = root as HChild<K, V>;
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
    const idx = (hash >>> shift) & MASK;
    const bit = 1 << idx;
    if ((node.bitmap & bit) === 0) return false;
    const packedIdx = popcount(node.bitmap & (bit - 1));
    node = node.children[packedIdx];
    shift += BITS;
  }

  return false;
}

export function hamtSet<K, V>(map: HMap<K, V>, owner: Owner, key: K, value: V): HMap<K, V> {
  const hash = hashKey(key);
  const res = hamtInsert(map.root, owner, hash, key, value, 0);
  if (!res.changed) return map;
  return {
    root: res.node,
    size: map.size + (res.added ? 1 : 0),
  };
}

export function hamtDelete<K, V>(map: HMap<K, V>, owner: Owner, key: K): HMap<K, V> {
  if (!map.root) return map;
  const hash = hashKey(key);
  const res = hamtRemove(map.root, owner, hash, key, 0);
  if (!res.removed) return map;
  return {
    root: res.node,
    size: map.size - 1,
  };
}

export function hamtFromMap<K, V>(m: Map<K, V>): HMap<K, V> {
  let map = hamtEmpty<K, V>();
  const owner: Owner = {};
  for (const [k, v] of m) {
    map = hamtSet(map, owner, k, v);
  }
  return map;
}

export function* hamtIter<K, V>(map: HMap<K, V>): IterableIterator<[K, V]> {
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
      const children = node.children;
      for (let i = children.length - 1; i >= 0; i--) {
        stack.push(children[i]);
      }
    }
  }
}

export function hamtToEntries<K, V>(map: HMap<K, V>): [K, V][] {
  return [...hamtIter(map)];
}
