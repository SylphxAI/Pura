/**
 * IMap: Persistent Map built on HAMT
 *
 * Provides a familiar Map-like API with immutability and structural sharing.
 */

import * as HAMT from './hamt';
import type { Map as IMapInterface } from './types';

type HAMTNode<K, V> = ReturnType<typeof HAMT.set<K, V>>;

/**
 * Edit token type (imported from HAMT)
 */
type Edit = { _brand: 'edit' };

/**
 * Immutable Persistent Map
 */
export class IMap<K = any, V = any> implements IMapInterface<K, V> {
  private _hash?: number; // Cached hash code
  private constructor(
    private readonly root: HAMTNode<K, V>,
    public readonly size: number,
    private readonly edit?: Edit
  ) {}

  /**
   * Create an empty map
   */
  static empty<K, V>(): IMap<K, V> {
    return new IMap<K, V>(null, 0);
  }

  /**
   * Create a map from entries
   */
  static of<K, V>(entries: Record<string, V> | Iterable<[K, V]>): IMap<K, V> {
    let map = IMap.empty<K, V>();

    if (Symbol.iterator in Object(entries)) {
      // Iterable
      for (const [key, value] of entries as Iterable<[K, V]>) {
        map = map.set(key, value);
      }
    } else {
      // Object
      for (const [key, value] of Object.entries(entries as Record<string, V>)) {
        map = map.set(key as K, value);
      }
    }

    return map;
  }

  /**
   * Create from existing entries (alias for `of`)
   */
  static from<K, V>(entries: Record<string, V> | Iterable<[K, V]>): IMap<K, V> {
    return IMap.of(entries);
  }

  /**
   * Create a mutable builder for efficient batch operations
   *
   * Builder uses native JavaScript Map internally for maximum performance,
   * then converts to persistent structure once.
   *
   * @example
   * const map = IMap.builder<string, number>()
   *   .set('a', 1).set('b', 2).set('c', 3)
   *   .build();
   */
  static builder<K, V>(): IMapBuilder<K, V> {
    return new IMapBuilder<K, V>();
  }

  /**
   * Get value by key
   * O(log₃₂ n) ≈ O(1)
   */
  get(key: K): V | undefined {
    return HAMT.get(this.root, key, HAMT.hash(key));
  }

  /**
   * Check if key exists
   * O(log₃₂ n) ≈ O(1)
   */
  has(key: K): boolean {
    return this.get(key) !== undefined;
  }

  /**
   * Set value for key (returns new map)
   * O(log₃₂ n) with structural sharing
   */
  set(key: K, value: V): IMap<K, V> {
    const keyHash = HAMT.hash(key);
    const oldValue = HAMT.get(this.root, key, keyHash);

    // If value unchanged, return same map (structural sharing)
    if (oldValue === value) {
      return this;
    }

    const edit = this.edit;
    const newRoot = edit
      ? HAMT.setMut(this.root, key, value, keyHash, edit)
      : HAMT.set(this.root, key, value, keyHash);

    // Calculate new size
    const newSize = oldValue === undefined ? this.size + 1 : this.size;

    if (edit) {
      // Transient: mutate in-place
      (this as any).root = newRoot;
      (this as any).size = newSize;
      return this;
    } else {
      // Persistent: return new map
      return new IMap(newRoot, newSize);
    }
  }

  /**
   * Delete key (returns new map)
   * O(log₃₂ n) with node compression
   */
  delete(key: K): IMap<K, V> {
    const keyHash = HAMT.hash(key);
    const oldValue = HAMT.get(this.root, key, keyHash);

    // Key not present: return same map
    if (oldValue === undefined) {
      return this;
    }

    const newRoot = HAMT.remove(this.root, key, keyHash);
    return new IMap(newRoot, this.size - 1);
  }

  /**
   * Map over values (returns new map)
   */
  map<V2>(fn: (value: V, key: K) => V2): IMap<K, V2> {
    let result = IMap.empty<K, V2>();
    for (const [key, value] of this.entries()) {
      result = result.set(key, fn(value, key));
    }
    return result;
  }

  /**
   * Filter entries (returns new map)
   */
  filter(fn: (value: V, key: K) => boolean): IMap<K, V> {
    let result = IMap.empty<K, V>();
    for (const [key, value] of this.entries()) {
      if (fn(value, key)) {
        result = result.set(key, value);
      }
    }
    return result;
  }

  /**
   * Convert to plain object
   */
  toObject(): Record<string, V> {
    const result: Record<string, V> = {};
    for (const [key, value] of this.entries()) {
      result[String(key)] = value;
    }
    return result;
  }

  /**
   * Iterate over keys
   */
  *keys(): Iterator<K> {
    for (const [key] of this.entries()) {
      yield key;
    }
  }

  /**
   * Iterate over values
   */
  *values(): Iterator<V> {
    for (const [, value] of this.entries()) {
      yield value;
    }
  }

  /**
   * Iterate over entries
   */
  *entries(): Iterator<[K, V]> {
    yield* this.iterateNode(this.root);
  }

  /**
   * Make iterable (for...of)
   */
  [Symbol.iterator](): Iterator<[K, V]> {
    return this.entries();
  }

  /**
   * Internal: recursively iterate over HAMT nodes
   */
  private *iterateNode(node: HAMTNode<K, V>): Iterator<[K, V]> {
    if (!node) return;

    if (node.type === 'entry') {
      yield [node.key, node.value];
      return;
    }

    if (node.type === 'collision') {
      for (const entry of node.entries) {
        yield [entry.key, entry.value];
      }
      return;
    }

    // Node: recursively iterate children
    for (const child of node.children) {
      yield* this.iterateNode(child);
    }
  }

  /**
   * Convert to string (for debugging)
   */
  toString(): string {
    const entries = Array.from(this.entries())
      .map(([k, v]) => `${String(k)}: ${String(v)}`)
      .join(', ');
    return `IMap(${this.size}) { ${entries} }`;
  }

  /**
   * Deep equality check
   */
  equals(other: IMap<K, V>): boolean {
    if (this === other) return true;
    if (this.size !== other.size) return false;

    for (const [key, value] of this.entries()) {
      if (other.get(key) !== value) {
        return false;
      }
    }

    return true;
  }

  /**
   * Convert to transient (mutable) for efficient batch operations
   *
   * Transient maps allow in-place modifications for maximum performance.
   * Must call toPersistent() to convert back to immutable.
   *
   * @example
   * const map = IMap.empty<string, number>()
   *   .asTransient()
   *   .set('a', 1).set('b', 2).set('c', 3)
   *   .toPersistent();
   */
  asTransient(): IMap<K, V> {
    const { node, edit } = HAMT.asTransient(this.root);
    return new IMap(node, this.size, edit);
  }

  /**
   * Convert transient back to persistent (immutable)
   *
   * After calling this, the map becomes immutable again and
   * the transient version can no longer be used.
   */
  toPersistent(): IMap<K, V> {
    const persistentRoot = HAMT.asPersistent(this.root);
    return new IMap(persistentRoot, this.size);
  }

  /**
   * Get hash code for this map
   *
   * Cached for performance when used as Map key or Set element.
   * Hash is stable since map is immutable.
   */
  hashCode(): number {
    if (this._hash !== undefined) {
      return this._hash;
    }

    // Compute hash by combining key-value pair hashes
    let h = 0;
    for (const [key, value] of this) {
      // Hash the key
      const keyHash = typeof key === 'string'
        ? hashString(key)
        : typeof key === 'number'
        ? hashNumber(key)
        : typeof key === 'object' && key !== null && 'hashCode' in key && typeof key.hashCode === 'function'
        ? key.hashCode()
        : hashString(String(key));

      // Hash the value
      const valueHash = typeof value === 'string'
        ? hashString(value)
        : typeof value === 'number'
        ? hashNumber(value)
        : typeof value === 'object' && value !== null && 'hashCode' in value && typeof value.hashCode === 'function'
        ? value.hashCode()
        : hashString(String(value));

      // Combine key and value hashes (order-independent for map)
      h = (h + keyHash ^ valueHash) | 0;
    }

    // Cache and return
    this._hash = h >>> 0; // Convert to unsigned
    return this._hash;
  }
}

/**
 * Hash a string (FNV-1a variant)
 */
function hashString(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

/**
 * Hash a number
 */
function hashNumber(num: number): number {
  let h = num | 0;
  h = ((h >>> 16) ^ h) * 0x45d9f3b;
  h = ((h >>> 16) ^ h) * 0x45d9f3b;
  h = (h >>> 16) ^ h;
  return h >>> 0;
}

/**
 * Mutable builder for efficient batch map construction
 *
 * Uses native JavaScript Map internally for maximum performance,
 * then converts to persistent IMap once at the end.
 *
 * @example
 * const map = IMap.builder<string, number>()
 *   .set('a', 1)
 *   .set('b', 2)
 *   .set('c', 3)
 *   .build();
 *
 * // Much faster than:
 * let map = IMap.empty<string, number>();
 * map = map.set('a', 1);
 * map = map.set('b', 2);
 * map = map.set('c', 3);
 */
export class IMapBuilder<K, V> {
  private map: Map<K, V> = new Map();

  /**
   * Set value for key
   */
  set(key: K, value: V): this {
    this.map.set(key, value);
    return this;
  }

  /**
   * Set multiple entries
   */
  setAll(entries: Iterable<[K, V]>): this {
    for (const [key, value] of entries) {
      this.map.set(key, value);
    }
    return this;
  }

  /**
   * Delete key
   */
  delete(key: K): this {
    this.map.delete(key);
    return this;
  }

  /**
   * Get current size
   */
  get size(): number {
    return this.map.size;
  }

  /**
   * Build final immutable map
   */
  build(): IMap<K, V> {
    return IMap.from(this.map);
  }
}
