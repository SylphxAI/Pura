/**
 * Internal modules barrel export
 */

// Constants
export {
  BITS,
  BRANCH_FACTOR,
  MASK,
  STRING_INDEX_CACHE_SIZE,
  STRING_INDICES,
  NESTED_PROXY_STATE,
  NESTED_MAP_STATE,
  NESTED_SET_STATE,
  PURA_STATE,
  DELETED,
  ORDER_COMPACT_RATIO,
  PROXY_CACHE,
} from './constants';

// Utils
export { getStringIndex, popcount } from './utils';

// Vec (RRB-Tree)
export {
  emptyVec,
  emptyNode,
  vecPush,
  vecPop,
  vecGet,
  vecAssoc,
  vecFromArray,
  vecToArray,
  vecIter,
  vecConcat,
  vecSlice,
  ensureEditableNode,
  isRelaxed,
  regularSubtreeSize,
  relaxedChildIndex,
} from './vec';

// HAMT
export {
  hamtEmpty,
  hamtGet,
  hamtHas,
  hamtSet,
  hamtDelete,
  hamtFromMap,
  hamtIter,
  hamtToEntries,
  hashKey,
  keyEquals,
  type HLeaf,
  type HCollision,
  type HNode,
  type HChild,
  type HMap,
} from './hamt';

// Order Index
export {
  orderEmpty,
  orderFromBase,
  orderAppend,
  orderAppendWithValue,
  orderUpdateValue,
  orderDelete,
  orderCompact,
  orderIter,
  orderEntryIter,
  orderFromSetBase,
  type OrderIndex,
} from './order';

// Nested Proxy
export {
  createNestedProxy,
  createNestedMapProxy,
  createNestedSetProxy,
  isProxyModified,
  extractNestedValue,
  type NestedProxyState,
  type NestedMapState,
  type NestedSetState,
} from './nested-proxy';

// Types
export type { Owner, Node, Vec } from './types';
