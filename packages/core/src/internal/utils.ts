/**
 * Utility functions for Pura data structures
 */

import { STRING_INDEX_CACHE_SIZE, STRING_INDICES } from './constants';

/**
 * Get cached string index for fast ownKeys
 */
export function getStringIndex(i: number): string {
  return i < STRING_INDEX_CACHE_SIZE ? STRING_INDICES[i]! : String(i);
}

/**
 * Popcount (hamming weight) for CHAMP bitmap operations
 * Returns number of set bits in a 32-bit integer
 */
export function popcount(x: number): number {
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

/**
 * MurmurHash3 32-bit string hash
 */
export function murmur3(key: string, seed = 0): number {
  const c1 = 0xcc9e2d51;
  const c2 = 0x1b873593;
  let h1 = seed;
  const len = key.length;
  const roundedEnd = len & ~1;

  for (let i = 0; i < roundedEnd; i += 2) {
    let k1 = key.charCodeAt(i) | (key.charCodeAt(i + 1) << 16);
    k1 = Math.imul(k1, c1);
    k1 = (k1 << 15) | (k1 >>> 17);
    k1 = Math.imul(k1, c2);
    h1 ^= k1;
    h1 = (h1 << 13) | (h1 >>> 19);
    h1 = (Math.imul(h1, 5) + 0xe6546b64) | 0;
  }

  if (len & 1) {
    let k1 = key.charCodeAt(roundedEnd);
    k1 = Math.imul(k1, c1);
    k1 = (k1 << 15) | (k1 >>> 17);
    k1 = Math.imul(k1, c2);
    h1 ^= k1;
  }

  h1 ^= len;
  return mix32(h1) >>> 0;
}

/**
 * MurmurHash3 finalizer - mix bits thoroughly
 */
export function mix32(z: number): number {
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
  return z ^ (z >>> 16);
}

// Hash caches for objects and symbols
const OBJ_HASH = new WeakMap<object, number>();
const SYM_HASH = new Map<symbol, number>();
let nextHash = 1;

/**
 * Hash any key type for HAMT
 */
export function hashKey(key: any): number {
  if (key === null) return 0;
  if (key === undefined) return 1;

  const t = typeof key;
  if (t === 'number') {
    if (Number.isInteger(key) && key >= 0 && key < 0x7fffffff) {
      return mix32(key) >>> 0;
    }
    return murmur3(String(key));
  }
  if (t === 'string') return murmur3(key);
  if (t === 'boolean') return key ? 3 : 2;
  if (t === 'bigint') return murmur3(key.toString());
  if (t === 'symbol') {
    let h = SYM_HASH.get(key);
    if (h === undefined) {
      h = nextHash++;
      SYM_HASH.set(key, h);
    }
    return mix32(h) >>> 0;
  }
  if (t === 'object' || t === 'function') {
    let h = OBJ_HASH.get(key);
    if (h === undefined) {
      h = nextHash++;
      OBJ_HASH.set(key, h);
    }
    return mix32(h) >>> 0;
  }
  return 0;
}

/**
 * Compare two keys for equality (structural for primitives, reference for objects)
 */
export function keyEquals(a: any, b: any): boolean {
  return a === b || (Number.isNaN(a) && Number.isNaN(b));
}
