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

type VectorRoot<T> = ReturnType<typeof Vector.empty<T>>;

/**
 * Immutable Persistent List
 */
export class IList<T = any> implements IListInterface<T> {
  private constructor(private readonly root: VectorRoot<T>) {}

  /**
   * Create an empty list
   */
  static empty<T>(): IList<T> {
    return new IList<T>(Vector.empty<T>());
  }

  /**
   * Create a list from values
   */
  static of<T>(...items: T[]): IList<T> {
    let root = Vector.empty<T>();
    for (const item of items) {
      root = Vector.push(root, item);
    }
    return new IList<T>(root);
  }

  /**
   * Create a list from an iterable
   */
  static from<T>(items: Iterable<T>): IList<T> {
    let root = Vector.empty<T>();
    for (const item of items) {
      root = Vector.push(root, item);
    }
    return new IList<T>(root);
  }

  /**
   * Get size of list
   */
  get size(): number {
    return this.root.size;
  }

  /**
   * Get value at index
   * O(log₃₂ n) ≈ O(1)
   */
  get(index: number): T | undefined {
    return Vector.get(this.root, index);
  }

  /**
   * Check if index exists
   */
  has(index: number): boolean {
    return index >= 0 && index < this.root.size;
  }

  /**
   * Set value at index (returns new list)
   * O(log₃₂ n) with structural sharing
   */
  set(index: number, value: T): IList<T> {
    const newRoot = Vector.set(this.root, index, value);
    return new IList(newRoot);
  }

  /**
   * Push value to end (returns new list)
   * O(1) amortized
   */
  push(value: T): IList<T> {
    const newRoot = Vector.push(this.root, value);
    return new IList(newRoot);
  }

  /**
   * Pop value from end (returns new list)
   * O(1) amortized
   */
  pop(): IList<T> {
    const newRoot = Vector.pop(this.root);
    return new IList(newRoot);
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
    const result = Vector.concat(this.root, other.root);
    return new IList(result);
  }

  /**
   * Extract slice (returns new list)
   * O(n) currently
   */
  slice(start?: number, end?: number): IList<T> {
    // TODO: Optimize with tree slicing
    const actualStart = start ?? 0;
    const actualEnd = end ?? this.size;
    let result = Vector.empty<T>();

    for (let i = actualStart; i < actualEnd && i < this.size; i++) {
      const value = this.get(i);
      if (value !== undefined) {
        result = Vector.push(result, value);
      }
    }

    return new IList(result);
  }

  /**
   * Map over values (returns new list)
   */
  map<U>(fn: (value: T, index: number) => U): IList<U> {
    let result = Vector.empty<U>();
    let index = 0;
    for (const value of this) {
      result = Vector.push(result, fn(value, index++));
    }
    return new IList(result);
  }

  /**
   * Filter values (returns new list)
   */
  filter(fn: (value: T, index: number) => boolean): IList<T> {
    let result = Vector.empty<T>();
    let index = 0;
    for (const value of this) {
      if (fn(value, index++)) {
        result = Vector.push(result, value);
      }
    }
    return new IList(result);
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
    return Vector.iterate(this.root);
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
    let result = Vector.empty<T>();
    for (let i = this.size - 1; i >= 0; i--) {
      const value = this.get(i);
      if (value !== undefined) {
        result = Vector.push(result, value);
      }
    }
    return new IList(result);
  }

  /**
   * Sort list
   */
  sort(compareFn?: (a: T, b: T) => number): IList<T> {
    const sorted = this.toArray().sort(compareFn);
    return IList.from(sorted);
  }
}
