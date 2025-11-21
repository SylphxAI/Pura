/**
 * Core constants for Pura data structures
 */

// Bit-trie parameters (32-way branching)
export const BITS = 5;
export const BRANCH_FACTOR = 1 << BITS; // 32
export const MASK = BRANCH_FACTOR - 1;  // 31

// Pre-generated string indices for ownKeys optimization
export const STRING_INDEX_CACHE_SIZE = 10000;
export const STRING_INDICES: string[] = Array.from(
  { length: STRING_INDEX_CACHE_SIZE },
  (_, i) => String(i)
);

// Symbols for internal state access
export const NESTED_PROXY_STATE = Symbol('NESTED_PROXY_STATE');
export const NESTED_MAP_STATE = Symbol('NESTED_MAP_STATE');
export const NESTED_SET_STATE = Symbol('NESTED_SET_STATE');
export const PURA_STATE = Symbol('PURA_STATE');

// OrderIndex marker for deleted entries
export const DELETED = Symbol('DELETED');

// OrderIndex compaction threshold (compact when holes > 50%)
export const ORDER_COMPACT_RATIO = 0.5;

// Global cache: base object → proxy
export const PROXY_CACHE = new WeakMap<object, any>();
