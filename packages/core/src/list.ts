/**
 * IList: Persistent List built on Vector Trie
 *
 * Provides a familiar Array-like API with immutability and structural sharing.
 * - O(log₃₂ n) ≈ O(1) for get/set
 * - O(1) amortized for push/pop
 * - O(log n) for concat (with RRB-Tree rebalancing)
 */

import * as Vector from './vector';
import type { List as IListInterface } from './types';
import { SMALL_LIST_THRESHOLD } from './list-small';

type VectorRoot<T> = ReturnType<typeof Vector.empty<T>>;

/**
 * Internal storage - either Vector Trie or flat array for small lists
 */
type ListStorage<T> =
  | { type: 'vector'; root: VectorRoot<T> }
  | { type: 'small'; array: readonly T[] };

/**
 * Immutable Persistent List
 *
 * Automatically uses optimized flat array storage for small lists (≤32 elements)
 * and persistent vector trie for larger lists.
 */
export class IList<T = any> implements IListInterface<T> {
  private _hash?: number; // Cached hash code
  private constructor(private readonly storage: ListStorage<T>) {}

  /**
   * Create an empty list
   */
  static empty<T>(): IList<T> {
    return new IList<T>({ type: 'small', array: Object.freeze([]) });
  }

  /**
   * Create a list from values
   */
  static of<T>(...items: T[]): IList<T> {
    return IList.fromArray(items);
  }

  /**
   * Create a list from an iterable
   */
  static from<T>(items: Iterable<T>): IList<T> {
    // Fast path for arrays
    if (Array.isArray(items)) {
      return IList.fromArray(items);
    }

    // For other iterables, collect to array first (much faster than incremental push)
    const array = Array.from(items);
    return IList.fromArray(array);
  }

  /**
   * Create a list from native array (optimized path)
   * @internal
   */
  private static fromArray<T>(items: T[]): IList<T> {
    // Small list optimization: use flat array for ≤32 elements
    if (items.length <= SMALL_LIST_THRESHOLD) {
      return new IList<T>({ type: 'small', array: Object.freeze([...items]) });
    }

    // Large list: use persistent vector trie
    const root = Vector.fromArray(items);
    return new IList<T>({ type: 'vector', root });
  }

  /**
   * Create a mutable builder for efficient batch operations
   *
   * Builder uses native JavaScript array internally for maximum performance,
   * then converts to persistent structure once.
   *
   * @example
   * const list = IList.builder<number>()
   *   .push(1).push(2).push(3)
   *   .build();
   */
  static builder<T>(): IListBuilder<T> {
    return new IListBuilder<T>();
  }

  /**
   * Get size of list
   */
  get size(): number {
    if (this.storage.type === 'small') {
      return this.storage.array.length;
    }
    return this.storage.root.size;
  }

  /**
   * Get value at index
   * O(1) for small lists, O(log₃₂ n) ≈ O(1) for large lists
   */
  get(index: number): T | undefined {
    if (this.storage.type === 'small') {
      return this.storage.array[index];
    }
    return Vector.get(this.storage.root, index);
  }

  /**
   * Check if index exists
   */
  has(index: number): boolean {
    return index >= 0 && index < this.size;
  }

  /**
   * Set value at index (returns new list)
   * O(n) for small lists (but n ≤ 32), O(log₃₂ n) for large lists
   */
  set(index: number, value: T): IList<T> {
    if (this.storage.type === 'small') {
      if (index < 0 || index >= this.storage.array.length) {
        throw new RangeError(`Index out of bounds: ${index}`);
      }
      const newArray = this.storage.array.slice();
      (newArray as T[])[index] = value;
      return new IList({ type: 'small', array: Object.freeze(newArray) });
    }

    const newRoot = Vector.set(this.storage.root, index, value);
    return new IList({ type: 'vector', root: newRoot });
  }

  /**
   * Push value to end (returns new list)
   * O(1) for small lists, O(1) amortized for large lists
   */
  push(value: T): IList<T> {
    if (this.storage.type === 'small') {
      const newArray = [...this.storage.array, value];

      // Check if we need to upgrade to vector
      if (newArray.length > SMALL_LIST_THRESHOLD) {
        const root = Vector.fromArray(newArray);
        return new IList({ type: 'vector', root });
      }

      return new IList({ type: 'small', array: Object.freeze(newArray) });
    }

    const newRoot = Vector.push(this.storage.root, value);
    return new IList({ type: 'vector', root: newRoot });
  }

  /**
   * Pop value from end (returns new list)
   * O(1) for small lists, O(1) amortized for large lists
   */
  pop(): IList<T> {
    if (this.storage.type === 'small') {
      const newArray = this.storage.array.slice(0, -1);
      return new IList({ type: 'small', array: Object.freeze(newArray) });
    }

    const newRoot = Vector.pop(this.storage.root);

    // Check if we should downgrade to small array
    if (newRoot.size <= SMALL_LIST_THRESHOLD) {
      const array = [];
      for (let i = 0; i < newRoot.size; i++) {
        array.push(Vector.get(newRoot, i)!);
      }
      return new IList({ type: 'small', array: Object.freeze(array) });
    }

    return new IList({ type: 'vector', root: newRoot });
  }

  /**
   * Add value to beginning (returns new list)
   * O(n) - not optimized yet
   */
  unshift(value: T): IList<T> {
    // TODO: Optimize with left-handed tree or deque
    const newList = IList.of<T>(value);
    return newList.concat(this);
  }

  /**
   * Remove value from beginning (returns new list)
   * O(n) - not optimized yet
   */
  shift(): IList<T> {
    // TODO: Optimize with slice
    return this.slice(1);
  }

  /**
   * Concatenate two lists (returns new list)
   * O(log n) with RRB-Tree rebalancing
   */
  concat(other: IList<T>): IList<T> {
    // Both small - can stay small if combined size ≤ threshold
    if (this.storage.type === 'small' && other.storage.type === 'small') {
      const combined = [...this.storage.array, ...other.storage.array];
      if (combined.length <= SMALL_LIST_THRESHOLD) {
        return new IList({ type: 'small', array: Object.freeze(combined) });
      }
      // Combined size exceeds threshold - upgrade to vector
      const root = Vector.fromArray(combined);
      return new IList({ type: 'vector', root });
    }

    // Convert both to vector and concat
    const thisRoot = this.storage.type === 'small'
      ? Vector.fromArray([...this.storage.array])
      : this.storage.root;
    const otherRoot = other.storage.type === 'small'
      ? Vector.fromArray([...other.storage.array])
      : other.storage.root;

    const result = Vector.concat(thisRoot, otherRoot);
    return new IList({ type: 'vector', root: result });
  }

  /**
   * Extract slice (returns new list)
   * O(n) currently
   */
  slice(start?: number, end?: number): IList<T> {
    const actualStart = Math.max(0, start ?? 0);
    const actualEnd = Math.min(this.size, end ?? this.size);
    const sliceSize = Math.max(0, actualEnd - actualStart);

    // Fast path for small lists
    if (this.storage.type === 'small') {
      const sliced = this.storage.array.slice(actualStart, actualEnd);
      return new IList({ type: 'small', array: sliced });
    }

    // Build array for result
    const result: T[] = [];
    for (let i = actualStart; i < actualEnd && i < this.size; i++) {
      const value = this.get(i);
      if (value !== undefined) {
        result.push(value);
      }
    }

    // Choose storage type based on result size
    if (result.length <= SMALL_LIST_THRESHOLD) {
      return new IList({ type: 'small', array: Object.freeze(result) });
    }

    const root = Vector.fromArray(result);
    return new IList({ type: 'vector', root });
  }

  /**
   * Map over values (returns new list)
   */
  map<U>(fn: (value: T, index: number) => U): IList<U> {
    const result: U[] = [];
    let index = 0;
    for (const value of this) {
      result.push(fn(value, index++));
    }

    // Choose storage type based on result size
    if (result.length <= SMALL_LIST_THRESHOLD) {
      return new IList({ type: 'small', array: Object.freeze(result) });
    }

    const root = Vector.fromArray(result);
    return new IList({ type: 'vector', root });
  }

  /**
   * Filter values (returns new list)
   */
  filter(fn: (value: T, index: number) => boolean): IList<T> {
    const result: T[] = [];
    let index = 0;
    for (const value of this) {
      if (fn(value, index++)) {
        result.push(value);
      }
    }

    // Choose storage type based on result size
    if (result.length <= SMALL_LIST_THRESHOLD) {
      return new IList({ type: 'small', array: Object.freeze(result) });
    }

    const root = Vector.fromArray(result);
    return new IList({ type: 'vector', root });
  }

  /**
   * Reduce to single value
   */
  reduce<U>(fn: (acc: U, value: T, index: number) => U, initial: U): U {
    let acc = initial;
    let index = 0;
    for (const value of this) {
      acc = fn(acc, value, index++);
    }
    return acc;
  }

  /**
   * Convert to native array
   */
  toArray(): T[] {
    return Array.from(this);
  }

  /**
   * Make iterable (for...of)
   */
  [Symbol.iterator](): Iterator<T> {
    if (this.storage.type === 'small') {
      return this.storage.array[Symbol.iterator]();
    }
    return Vector.iterate(this.storage.root);
  }

  /**
   * Convert to string (for debugging)
   */
  toString(): string {
    const preview = this.size > 10
      ? `${Array.from(this.slice(0, 10)).join(', ')}...`
      : Array.from(this).join(', ');
    return `IList(${this.size}) [${preview}]`;
  }

  /**
   * Deep equality check
   */
  equals(other: IList<T>): boolean {
    if (this === other) return true;
    if (this.size !== other.size) return false;

    for (let i = 0; i < this.size; i++) {
      if (this.get(i) !== other.get(i)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get first element
   */
  first(): T | undefined {
    return this.get(0);
  }

  /**
   * Get last element
   */
  last(): T | undefined {
    return this.get(this.size - 1);
  }

  /**
   * Find index of value
   */
  indexOf(value: T): number {
    for (let i = 0; i < this.size; i++) {
      if (this.get(i) === value) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Check if list includes value
   */
  includes(value: T): boolean {
    return this.indexOf(value) !== -1;
  }

  /**
   * Find value matching predicate
   */
  find(fn: (value: T, index: number) => boolean): T | undefined {
    let index = 0;
    for (const value of this) {
      if (fn(value, index++)) {
        return value;
      }
    }
    return undefined;
  }

  /**
   * Check if any value matches predicate
   */
  some(fn: (value: T, index: number) => boolean): boolean {
    return this.find(fn) !== undefined;
  }

  /**
   * Check if all values match predicate
   */
  every(fn: (value: T, index: number) => boolean): boolean {
    let index = 0;
    for (const value of this) {
      if (!fn(value, index++)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Reverse list order
   */
  reverse(): IList<T> {
    const result: T[] = [];
    for (let i = this.size - 1; i >= 0; i--) {
      const value = this.get(i);
      if (value !== undefined) {
        result.push(value);
      }
    }

    // Choose storage type based on result size
    if (result.length <= SMALL_LIST_THRESHOLD) {
      return new IList({ type: 'small', array: Object.freeze(result) });
    }

    const root = Vector.fromArray(result);
    return new IList({ type: 'vector', root });
  }

  /**
   * Sort list
   */
  sort(compareFn?: (a: T, b: T) => number): IList<T> {
    const sorted = this.toArray().sort(compareFn);
    return IList.from(sorted);
  }

  /**
   * Convert to transient (mutable) for efficient batch operations
   *
   * Transient lists allow in-place modifications for maximum performance.
   * Must call toPersistent() to convert back to immutable.
   *
   * @example
   * const list = IList.empty<number>()
   *   .asTransient()
   *   .push(1).push(2).push(3)
   *   .toPersistent();
   */
  asTransient(): IList<T> {
    // For small lists, convert to vector first (transient is for large batch ops)
    if (this.storage.type === 'small') {
      const root = Vector.fromArray([...this.storage.array]);
      const transientRoot = Vector.asTransient(root);
      return new IList({ type: 'vector', root: transientRoot });
    }

    const transientRoot = Vector.asTransient(this.storage.root);
    return new IList({ type: 'vector', root: transientRoot });
  }

  /**
   * Convert transient back to persistent (immutable)
   *
   * After calling this, the list becomes immutable again and
   * the transient version can no longer be used.
   */
  toPersistent(): IList<T> {
    // Small lists are already persistent
    if (this.storage.type === 'small') {
      return this;
    }

    const persistentRoot = Vector.asPersistent(this.storage.root);

    // Check if result should downgrade to small
    if (persistentRoot.size <= SMALL_LIST_THRESHOLD) {
      const array = [];
      for (let i = 0; i < persistentRoot.size; i++) {
        array.push(Vector.get(persistentRoot, i)!);
      }
      return new IList({ type: 'small', array: Object.freeze(array) });
    }

    return new IList({ type: 'vector', root: persistentRoot });
  }

  /**
   * Get hash code for this list
   *
   * Cached for performance when used as Map key or Set element.
   * Hash is stable since list is immutable.
   */
  hashCode(): number {
    if (this._hash !== undefined) {
      return this._hash;
    }

    // Compute hash by combining element hashes
    let h = 0;
    for (const value of this) {
      // Mix in this element's hash
      const elemHash = typeof value === 'string'
        ? hashString(value)
        : typeof value === 'number'
        ? hashNumber(value)
        : typeof value === 'object' && value !== null && 'hashCode' in value && typeof value.hashCode === 'function'
        ? value.hashCode()
        : hashString(String(value));

      // Combine hashes (similar to Java's List.hashCode)
      h = (31 * h + elemHash) | 0;
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
 * Mutable builder for efficient batch list construction
 *
 * Uses native JavaScript array internally for maximum performance,
 * then converts to persistent IList once at the end.
 *
 * @example
 * const list = IList.builder<number>()
 *   .push(1)
 *   .push(2)
 *   .push(3)
 *   .build();
 *
 * // Much faster than:
 * let list = IList.empty<number>();
 * list = list.push(1);
 * list = list.push(2);
 * list = list.push(3);
 */
export class IListBuilder<T> {
  private array: T[] = [];

  /**
   * Push value to end
   */
  push(value: T): this {
    this.array.push(value);
    return this;
  }

  /**
   * Push multiple values
   */
  pushAll(values: Iterable<T>): this {
    for (const value of values) {
      this.array.push(value);
    }
    return this;
  }

  /**
   * Set value at index
   */
  set(index: number, value: T): this {
    if (index < 0 || index >= this.array.length) {
      throw new RangeError(`Index out of bounds: ${index}`);
    }
    this.array[index] = value;
    return this;
  }

  /**
   * Get current size
   */
  get size(): number {
    return this.array.length;
  }

  /**
   * Build final immutable list
   */
  build(): IList<T> {
    return IList.from(this.array);
  }
}
