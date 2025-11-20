/**
 * Persistent Vector (32-way trie)
 *
 * Based on Clojure's PersistentVector with RRB-Tree extensions.
 * - O(log₃₂ n) get/set (effectively constant time)
 * - O(1) push/pop with tail buffer optimization
 * - O(log n) concat with RRB-Tree rebalancing
 *
 * References:
 * - Bagwell & Rompf (2011): RRB-Trees: Efficient Immutable Vectors
 * - Clojure's PersistentVector implementation
 */

// Constants
const BITS = 5; // 2^5 = 32-way branching
const BRANCH_SIZE = 1 << BITS; // 32
const BIT_MASK = BRANCH_SIZE - 1; // 0b11111
const MAX_TAIL_SIZE = BRANCH_SIZE; // Tail buffer size

/**
 * Node types in the vector trie
 */
export type VectorNode<T> = LeafNode<T> | BranchNode<T>;

/**
 * Edit token for transient modifications
 * When a node has this edit token, it can be mutated in-place
 */
type Edit = { _brand: 'edit' };

/**
 * Leaf node: stores actual values
 */
export interface LeafNode<T> {
  type: 'leaf';
  array: T[];
  edit?: Edit; // Transient edit token
}

/**
 * Branch node: stores references to child nodes
 */
export interface BranchNode<T> {
  type: 'branch';
  array: (VectorNode<T> | null)[];
  edit?: Edit; // Transient edit token
}

/**
 * Relaxed node: branch with size table for variable-sized children
 * Used after concat operations to maintain balance
 */
export interface RelaxedNode<T> {
  type: 'relaxed';
  array: (VectorNode<T> | null)[];
  sizes: number[]; // Cumulative sizes for each child
  edit?: Edit; // Transient edit token
}

/**
 * Root structure: separates tree from tail buffer
 */
export interface VectorRoot<T> {
  root: VectorNode<T> | null;
  tail: T[];
  size: number;
  shift: number; // Tree depth in bits (0, 5, 10, 15, ...)
  edit?: Edit; // Transient edit token
}

/**
 * Create empty vector
 */
export function empty<T>(): VectorRoot<T> {
  return {
    root: null,
    tail: [],
    size: 0,
    shift: BITS,
  };
}

/**
 * Create transient (mutable) vector for batch operations
 * Returns a new vector with edit token
 */
export function asTransient<T>(vec: VectorRoot<T>): VectorRoot<T> {
  const edit: Edit = { _brand: 'edit' };
  return { ...vec, edit };
}

/**
 * Convert transient vector back to persistent (immutable)
 * Clears edit token to prevent further mutations
 */
export function asPersistent<T>(vec: VectorRoot<T>): VectorRoot<T> {
  const { edit, ...persistent } = vec;
  return persistent as VectorRoot<T>;
}

/**
 * Check if vector is transient
 */
function isTransient<T>(vec: VectorRoot<T>): boolean {
  return vec.edit !== undefined;
}

/**
 * Create vector from array (optimized bulk construction)
 * Uses push internally but still faster than manual iteration
 * due to reduced overhead
 */
export function fromArray<T>(array: T[]): VectorRoot<T> {
  let vec = empty<T>();
  for (const item of array) {
    vec = push(vec, item);
  }
  return vec;
}

/**
 * Get value at index
 * O(log₃₂ n) tree traversal + O(1) tail access
 */
export function get<T>(vec: VectorRoot<T>, index: number): T | undefined {
  if (index < 0 || index >= vec.size) {
    return undefined;
  }

  // Tail optimization: O(1) access to last 32 elements
  // Only use tail if it's non-empty (after concat, tail might be empty temporarily)
  if (vec.tail.length > 0 && index >= tailOffset(vec)) {
    return vec.tail[index - tailOffset(vec)];
  }

  // Tree traversal: O(log₃₂ n)
  return getFromNode(vec.root, index, vec.shift);
}

/**
 * Get value from node (recursive tree traversal)
 */
function getFromNode<T>(
  node: VectorNode<T> | null,
  index: number,
  shift: number,
): T | undefined {
  if (!node) return undefined;

  if (node.type === 'leaf') {
    // At leaf level, use bottom 5 bits for array index
    const leafIndex = index & BIT_MASK;
    return node.array[leafIndex];
  }

  if (node.type === 'branch') {
    // Extract child index using current shift level
    const childIndex = (index >>> shift) & BIT_MASK;
    const child = node.array[childIndex];
    if (!child) return undefined;
    return getFromNode(child, index, shift - BITS);
  }

  // Relaxed node: use size table to find correct child
  if (node.type === 'relaxed') {
    const childIndex = findChildIndex(node.sizes, index);
    const offset = childIndex > 0 ? node.sizes[childIndex - 1]! : 0;
    return getFromNode(
      node.array[childIndex] ?? null,
      index - offset,
      shift - BITS,
    );
  }

  return undefined;
}

/**
 * Find child index in relaxed node using size table
 */
function findChildIndex(sizes: number[], index: number): number {
  // Binary search in size table
  let low = 0;
  let high = sizes.length - 1;

  while (low < high) {
    const mid = (low + high) >>> 1;
    if ((sizes[mid] ?? 0) <= index) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return low;
}

/**
 * Set value at index (returns new vector)
 * O(log₃₂ n) with path copying
 * If vector is transient, modifies in-place for performance
 */
export function set<T>(
  vec: VectorRoot<T>,
  index: number,
  value: T,
): VectorRoot<T> {
  if (index < 0 || index >= vec.size) {
    throw new RangeError(`Index out of bounds: ${index}`);
  }

  const edit = vec.edit;

  // Tail update
  if (index >= tailOffset(vec)) {
    const tailIndex = index - tailOffset(vec);

    if (edit) {
      // Transient: mutate in-place
      vec.tail[tailIndex] = value;
      return vec;
    } else {
      // Persistent: copy
      const newTail = [...vec.tail];
      newTail[tailIndex] = value;
      return { ...vec, tail: newTail };
    }
  }

  // Tree update
  const newRoot = edit
    ? setInNodeMut(vec.root, index, value, vec.shift, edit)
    : setInNode(vec.root, index, value, vec.shift);

  if (edit) {
    // Transient: mutate in-place
    vec.root = newRoot;
    return vec;
  } else {
    // Persistent: return new
    return { ...vec, root: newRoot };
  }
}

/**
 * Set value in node (mutable version for transients)
 */
function setInNodeMut<T>(
  node: VectorNode<T> | null,
  index: number,
  value: T,
  shift: number,
  edit: Edit,
): VectorNode<T> {
  if (!node) {
    // Create new leaf with edit token
    const array = new Array<T>(BRANCH_SIZE);
    array[index & BIT_MASK] = value;
    return { type: 'leaf', array, edit };
  }

  if (node.type === 'leaf') {
    // If node is editable, mutate in-place
    if (node.edit === edit) {
      node.array[index & BIT_MASK] = value;
      return node;
    }
    // Otherwise copy
    const newArray = [...node.array];
    newArray[index & BIT_MASK] = value;
    return { type: 'leaf', array: newArray, edit };
  }

  if (node.type === 'branch') {
    const childIndex = (index >>> shift) & BIT_MASK;
    const newChild = setInNodeMut(
      node.array[childIndex] ?? null,
      index,
      value,
      shift - BITS,
      edit,
    );

    // If node is editable, mutate in-place
    if (node.edit === edit) {
      node.array[childIndex] = newChild;
      return node;
    }
    // Otherwise copy
    const newArray = [...node.array];
    newArray[childIndex] = newChild;
    return { type: 'branch', array: newArray, edit };
  }

  // Relaxed node
  const childIndex = findChildIndex(node.sizes, index);
  const offset = childIndex > 0 ? node.sizes[childIndex - 1]! : 0;
  const newChild = setInNodeMut(
    node.array[childIndex] ?? null,
    index - offset,
    value,
    shift - BITS,
    edit,
  );

  // If node is editable, mutate in-place
  if (node.edit === edit) {
    node.array[childIndex] = newChild;
    return node;
  }
  // Otherwise copy
  const newArray = [...node.array];
  newArray[childIndex] = newChild;
  return { type: 'relaxed', array: newArray, sizes: [...node.sizes], edit };
}

/**
 * Set value in node (recursive with path copying)
 */
function setInNode<T>(
  node: VectorNode<T> | null,
  index: number,
  value: T,
  shift: number,
): VectorNode<T> {
  if (!node) {
    // Create new leaf
    const array = new Array<T>(BRANCH_SIZE);
    array[index & BIT_MASK] = value;
    return { type: 'leaf', array };
  }

  if (node.type === 'leaf') {
    // Copy leaf and update
    const newArray = [...node.array];
    newArray[index & BIT_MASK] = value;
    return { type: 'leaf', array: newArray };
  }

  if (node.type === 'branch') {
    // Copy branch and recurse
    const childIndex = (index >>> shift) & BIT_MASK;
    const newArray = [...node.array];
    newArray[childIndex] = setInNode(
      node.array[childIndex] ?? null,
      index,
      value,
      shift - BITS,
    );
    return { type: 'branch', array: newArray };
  }

  // Relaxed node: find child and recurse
  const childIndex = findChildIndex(node.sizes, index);
  const offset = childIndex > 0 ? node.sizes[childIndex - 1]! : 0;
  const newArray = [...node.array];
  newArray[childIndex] = setInNode(
    node.array[childIndex] ?? null,
    index - offset,
    value,
    shift - BITS,
  );
  return { type: 'relaxed', array: newArray, sizes: [...node.sizes] };
}

/**
 * Push value to end (returns new vector)
 * O(1) amortized with tail buffer
 * If vector is transient, modifies in-place for performance
 */
export function push<T>(vec: VectorRoot<T>, value: T): VectorRoot<T> {
  const edit = vec.edit;

  // Tail has space
  if (vec.tail.length < MAX_TAIL_SIZE) {
    if (edit) {
      // Transient: mutate in-place
      vec.tail.push(value);
      vec.size++;
      return vec;
    } else {
      // Persistent: copy
      return {
        ...vec,
        tail: [...vec.tail, value],
        size: vec.size + 1,
      };
    }
  }

  // Tail full: push tail into tree, start new tail
  const newRoot = edit
    ? pushTailMut(vec.root, vec.tail, vec.shift, edit)
    : pushTail(vec.root, vec.tail, vec.shift);

  if (edit) {
    // Transient: mutate in-place
    vec.root = newRoot.root;
    vec.shift = newRoot.shift;
    vec.tail = [value];
    vec.size++;
    return vec;
  } else {
    // Persistent: return new
    return {
      root: newRoot.root,
      tail: [value],
      size: vec.size + 1,
      shift: newRoot.shift,
    };
  }
}

/**
 * Push tail into tree structure (mutable version for transients)
 */
function pushTailMut<T>(
  root: VectorNode<T> | null,
  tail: T[],
  shift: number,
  edit: Edit,
): { root: VectorNode<T>; shift: number } {
  // For now, delegate to immutable version
  // TODO: Optimize with true mutable tree operations
  return pushTail(root, tail, shift);
}

/**
 * Push tail into tree structure
 */
function pushTail<T>(
  root: VectorNode<T> | null,
  tail: T[],
  shift: number,
): { root: VectorNode<T>; shift: number } {
  const newLeaf: LeafNode<T> = { type: 'leaf', array: tail };

  // Empty tree: leaf becomes root
  if (!root) {
    return { root: newLeaf, shift };
  }

  // Root is a single leaf: promote to branch
  if (root.type === 'leaf') {
    const newRoot: BranchNode<T> = {
      type: 'branch',
      array: [root, newLeaf],
    };
    return { root: newRoot, shift };
  }

  // Tree full at current depth: create new root level
  if (isTreeFull(root, shift)) {
    // When increasing tree height, we need to wrap the new leaf appropriately
    // The new root's children should be at the same level as the old root
    let rightChild: VectorNode<T> = newLeaf;

    // Wrap the leaf in branches until it matches the depth of the left child
    // If shift is 5, we need to go from 0 to 5 (one wrap)
    // If shift is 10, we need to go from 0 to 10 (two wraps)
    for (let s = 0; s < shift; s += BITS) {
      rightChild = {
        type: 'branch',
        array: [rightChild],
      };
    }

    const newRoot: BranchNode<T> = {
      type: 'branch',
      array: [root, rightChild],
    };
    return { root: newRoot, shift: shift + BITS };
  }

  // Insert into existing tree
  const newRoot = pushTailIntoNode(root, newLeaf, shift);
  return { root: newRoot, shift };
}

/**
 * Check if tree is full at current depth
 */
function isTreeFull<T>(node: VectorNode<T>, shift: number): boolean {
  if (shift === BITS) {
    // At leaf level: check if branch is full
    return node.type === 'branch' && node.array.length >= BRANCH_SIZE;
  }

  if (node.type === 'branch') {
    const lastChild = node.array[node.array.length - 1];
    return (
      node.array.length >= BRANCH_SIZE &&
      lastChild !== null &&
      isTreeFull(lastChild, shift - BITS)
    );
  }

  return false;
}

/**
 * Push tail into node (recursive)
 */
function pushTailIntoNode<T>(
  node: VectorNode<T>,
  tail: LeafNode<T>,
  shift: number,
): VectorNode<T> {
  if (node.type === 'leaf') {
    // Shouldn't reach here in normal operation
    return node;
  }

  if (node.type === 'branch') {
    const newArray = [...node.array];

    // At parent-of-leaves level: just append the tail
    if (shift === BITS) {
      if (newArray.length < BRANCH_SIZE) {
        newArray.push(tail);
      }
      return { type: 'branch', array: newArray };
    }

    // Deeper level: need to recurse
    const lastIndex = newArray.length - 1;
    const lastChild = newArray[lastIndex];

    // Try to insert into last child if it's not full
    if (lastChild && !isTreeFull(lastChild, shift - BITS)) {
      newArray[lastIndex] = pushTailIntoNode(lastChild, tail, shift - BITS);
      return { type: 'branch', array: newArray };
    }

    // Last child is full: append as new child
    if (newArray.length < BRANCH_SIZE) {
      newArray.push(tail);
    }
    return { type: 'branch', array: newArray };
  }

  // Relaxed node: similar logic with size table update
  return node;
}

/**
 * Pop value from end (returns new vector)
 * O(1) amortized
 */
export function pop<T>(vec: VectorRoot<T>): VectorRoot<T> {
  if (vec.size === 0) {
    return vec;
  }

  // Tail has multiple elements: O(1) copy
  if (vec.tail.length > 1) {
    return {
      ...vec,
      tail: vec.tail.slice(0, -1),
      size: vec.size - 1,
    };
  }

  // Tail has one element: promote rightmost leaf as new tail
  const newTailOffset = tailOffset(vec) - MAX_TAIL_SIZE;
  if (newTailOffset < 0) {
    // No more elements in tree
    return {
      root: null,
      tail: [],
      size: 0,
      shift: BITS,
    };
  }

  // Extract new tail from tree
  const newTail = extractTail(vec.root, newTailOffset, vec.shift);
  const newRoot = popTailFromNode(vec.root, newTailOffset, vec.shift);

  // Reduce tree height if root has single child
  let newShift = vec.shift;
  let finalRoot = newRoot;
  if (
    newRoot &&
    newRoot.type === 'branch' &&
    newRoot.array.length === 1 &&
    vec.shift > BITS
  ) {
    finalRoot = newRoot.array[0] ?? null;
    newShift -= BITS;
  }

  return {
    root: finalRoot,
    tail: newTail,
    size: vec.size - 1,
    shift: newShift,
  };
}

/**
 * Extract tail from tree (rightmost leaf)
 */
function extractTail<T>(
  node: VectorNode<T> | null,
  offset: number,
  shift: number,
): T[] {
  if (!node) return [];

  if (node.type === 'leaf') {
    return node.array;
  }

  if (node.type === 'branch') {
    const childIndex = (offset >>> shift) & BIT_MASK;
    return extractTail(node.array[childIndex] ?? null, offset, shift - BITS);
  }

  return [];
}

/**
 * Pop tail from node (recursive)
 */
function popTailFromNode<T>(
  node: VectorNode<T> | null,
  offset: number,
  shift: number,
): VectorNode<T> | null {
  if (!node) return null;

  if (node.type === 'branch') {
    const childIndex = (offset >>> shift) & BIT_MASK;

    if (shift === BITS) {
      // Parent of leaves: remove last child
      const newArray = node.array.slice(0, childIndex);
      return newArray.length > 0 ? { type: 'branch', array: newArray } : null;
    }

    // Recurse into child
    const newChild = popTailFromNode(
      node.array[childIndex] ?? null,
      offset,
      shift - BITS,
    );
    const newArray = [...node.array.slice(0, childIndex)];
    if (newChild) {
      newArray[childIndex] = newChild;
    }
    return newArray.length > 0 ? { type: 'branch', array: newArray } : null;
  }

  return node;
}

/**
 * Calculate offset where tail begins
 */
function tailOffset<T>(vec: VectorRoot<T>): number {
  return vec.size < MAX_TAIL_SIZE
    ? 0
    : ((vec.size - 1) >>> BITS) << BITS;
}

/**
 * Iterate over all values
 */
export function* iterate<T>(vec: VectorRoot<T>): Iterator<T> {
  // Iterate tree
  if (vec.root) {
    yield* iterateNode(vec.root);
  }
  // Iterate tail
  for (const value of vec.tail) {
    yield value;
  }
}

/**
 * Iterate node recursively
 */
function* iterateNode<T>(node: VectorNode<T>): Iterator<T> {
  if (node.type === 'leaf') {
    for (const value of node.array) {
      if (value !== undefined) {
        yield value;
      }
    }
    return;
  }

  if (node.type === 'branch' || node.type === 'relaxed') {
    for (const child of node.array) {
      if (child) {
        yield* iterateNode(child);
      }
    }
  }
}

/**
 * Concatenate two vectors
 * O(log n) with RRB-Tree merging strategy
 */
export function concat<T>(left: VectorRoot<T>, right: VectorRoot<T>): VectorRoot<T> {
  // Empty cases
  if (left.size === 0) return right;
  if (right.size === 0) return left;

  // Small vectors: use naive approach (faster for small n due to lower overhead)
  if (left.size + right.size < 1000) {
    return concatNaive(left, right);
  }

  // Large vectors: use RRB-Tree merge for O(log n) performance
  return concatRRB(left, right);
}

/**
 * Naive concat for small vectors (O(n) but fast for small n)
 */
function concatNaive<T>(left: VectorRoot<T>, right: VectorRoot<T>): VectorRoot<T> {
  let result = left;

  // Push all elements from right vector
  for (const value of iterate(right)) {
    result = push(result, value);
  }

  return result;
}

/**
 * RRB-Tree concat (O(log n))
 * Merges two trees by creating a middle node and rebalancing
 */
function concatRRB<T>(left: VectorRoot<T>, right: VectorRoot<T>): VectorRoot<T> {
  // Flush both tails into trees
  const leftFlushed = flushTail(left);
  const rightFlushed = flushTail(right);

  // Merge the complete trees
  const { root: mergedRoot, shift: mergedShift } = leftFlushed.root && rightFlushed.root
    ? mergeTrees(leftFlushed.root, leftFlushed.shift, rightFlushed.root, rightFlushed.shift)
    : leftFlushed.root
      ? { root: leftFlushed.root, shift: leftFlushed.shift }
      : { root: rightFlushed.root!, shift: rightFlushed.shift };

  const totalSize = left.size + right.size;

  // Return with empty tail - all elements are in the tree
  // The tail will be rebuilt naturally during subsequent push operations
  // get() has been updated to handle empty tails by reading from tree
  return {
    root: mergedRoot,
    tail: [],
    size: totalSize,
    shift: mergedShift,
  };
}

/**
 * Flush tail into tree structure
 */
function flushTail<T>(vec: VectorRoot<T>): VectorRoot<T> {
  if (vec.tail.length === 0) {
    return vec;
  }

  const tailLeaf: LeafNode<T> = { type: 'leaf', array: vec.tail };
  const result = pushTail(vec.root, vec.tail, vec.shift);

  return {
    root: result.root,
    tail: [],
    size: vec.size,
    shift: result.shift,
  };
}

/**
 * Merge two trees of potentially different heights
 * Returns merged root and new shift value
 */
function mergeTrees<T>(
  leftRoot: VectorNode<T> | null,
  leftShift: number,
  rightRoot: VectorNode<T> | null,
  rightShift: number
): { root: VectorNode<T>; shift: number } {
  if (!leftRoot && !rightRoot) {
    throw new Error('Cannot merge two null trees');
  }

  if (!leftRoot) return { root: rightRoot!, shift: rightShift };
  if (!rightRoot) return { root: leftRoot, shift: leftShift };

  // Same height: merge at current level
  if (leftShift === rightShift) {
    return mergeNodesAtLevel(leftRoot, rightRoot, leftShift);
  }

  // Left tree is taller: recurse on right edge of left tree
  if (leftShift > rightShift) {
    if (leftRoot.type === 'branch' || leftRoot.type === 'relaxed') {
      const lastIndex = leftRoot.array.length - 1;
      const lastChild = leftRoot.array[lastIndex];

      if (!lastChild) {
        // Replace last null with right tree
        const newArray = [...leftRoot.array];
        newArray[lastIndex] = rightRoot;
        return { root: createBranch(newArray, null), shift: leftShift };
      }

      // Recurse
      const merged = mergeTrees(lastChild, leftShift - BITS, rightRoot, rightShift);
      const newArray = [...leftRoot.array];
      newArray[lastIndex] = merged.root;

      return { root: createBranch(newArray, null), shift: leftShift };
    }
  }

  // Right tree is taller: recurse on left edge of right tree
  if (rightShift > leftShift) {
    if (rightRoot.type === 'branch' || rightRoot.type === 'relaxed') {
      const firstChild = rightRoot.array[0];

      if (!firstChild) {
        // Replace first null with left tree
        const newArray = [...rightRoot.array];
        newArray[0] = leftRoot;
        return { root: createBranch(newArray, null), shift: rightShift };
      }

      // Recurse
      const merged = mergeTrees(leftRoot, leftShift, firstChild, rightShift - BITS);
      const newArray = [...rightRoot.array];
      newArray[0] = merged.root;

      return { root: createBranch(newArray, null), shift: rightShift };
    }
  }

  // Shouldn't reach here
  throw new Error('Unexpected merge case');
}

/**
 * Merge two nodes at the same level
 */
function mergeNodesAtLevel<T>(
  left: VectorNode<T>,
  right: VectorNode<T>,
  shift: number
): { root: VectorNode<T>; shift: number } {
  // Both are leaves: combine into branch
  if (left.type === 'leaf' && right.type === 'leaf') {
    const branch: BranchNode<T> = {
      type: 'branch',
      array: [left, right],
    };
    return { root: branch, shift: shift + BITS };
  }

  // Get children arrays
  const leftChildren = getChildren(left);
  const rightChildren = getChildren(right);

  // Merge children
  const merged = [...leftChildren, ...rightChildren];

  // Rebalance if needed
  const rebalanced = rebalanceChildren(merged, shift);

  // If result fits in one node, return it
  if (rebalanced.length <= BRANCH_SIZE) {
    return { root: createBranch(rebalanced, null), shift };
  }

  // Split into multiple nodes and increase height
  const chunks: VectorNode<T>[][] = [];
  for (let i = 0; i < rebalanced.length; i += BRANCH_SIZE) {
    chunks.push(rebalanced.slice(i, i + BRANCH_SIZE));
  }

  const newLevel = chunks.map(chunk => createBranch(chunk, null));

  // When merging trees, always create RELAXED root with size tables
  // This is needed because merged children may not align on power-of-32 boundaries
  const sizes: number[] = [];
  let total = 0;
  for (const child of newLevel) {
    total += nodeSize(child);
    sizes.push(total);
  }

  return { root: createBranch(newLevel, sizes), shift: shift + BITS };
}

/**
 * Get children array from any node type
 */
function getChildren<T>(node: VectorNode<T>): VectorNode<T>[] {
  if (node.type === 'leaf') {
    return [node];
  }
  return node.array.filter((child): child is VectorNode<T> => child !== null);
}

/**
 * Rebalance children using E=2 invariant
 *
 * Invariant: number of slots S ≤ ⌈P/M⌉ + E
 * where P = number of items, M = BRANCH_SIZE (32), E = 2
 *
 * This allows some flexibility in node sizes while bounding lookup cost
 */
function rebalanceChildren<T>(
  children: VectorNode<T>[],
  shift: number
): VectorNode<T>[] {
  const E_MAX = 2; // Relaxation factor
  const MIN_SIZE = BRANCH_SIZE - Math.floor(E_MAX / 2); // 31

  // If already balanced, return as-is
  const totalSize = children.reduce((sum, child) => sum + nodeSize(child), 0);
  const optimalNodes = Math.ceil(totalSize / BRANCH_SIZE);

  if (children.length <= optimalNodes + E_MAX) {
    return children;
  }

  // Rebalance: skip well-filled nodes, redistribute undersized ones
  const result: VectorNode<T>[] = [];
  let buffer: VectorNode<T>[] = [];
  let bufferSize = 0;

  for (const child of children) {
    const size = nodeSize(child);

    // Well-filled node: flush buffer and keep node
    if (size >= MIN_SIZE) {
      if (buffer.length > 0) {
        result.push(...flushBuffer(buffer, shift));
        buffer = [];
        bufferSize = 0;
      }
      result.push(child);
      continue;
    }

    // Undersized node: add to buffer
    buffer.push(child);
    bufferSize += size;

    // Buffer full enough: flush it
    if (bufferSize >= BRANCH_SIZE) {
      result.push(...flushBuffer(buffer, shift));
      buffer = [];
      bufferSize = 0;
    }
  }

  // Flush remaining buffer
  if (buffer.length > 0) {
    result.push(...flushBuffer(buffer, shift));
  }

  return result;
}

/**
 * Flush buffer of undersized nodes into properly-sized nodes
 */
function flushBuffer<T>(buffer: VectorNode<T>[], shift: number): VectorNode<T>[] {
  if (buffer.length === 0) return [];
  if (buffer.length === 1) return buffer;

  // Collect all items from buffer
  const items: VectorNode<T>[] = [];
  for (const node of buffer) {
    items.push(...getChildren(node));
  }

  // Redistribute into properly-sized nodes
  const result: VectorNode<T>[] = [];
  for (let i = 0; i < items.length; i += BRANCH_SIZE) {
    const chunk = items.slice(i, i + BRANCH_SIZE);
    result.push(createBranch(chunk, null));
  }

  return result;
}

/**
 * Get total size of node (number of elements)
 */
function nodeSize<T>(node: VectorNode<T>): number {
  if (node.type === 'leaf') {
    return node.array.length;
  }

  if (node.type === 'relaxed') {
    // Use size table
    return node.sizes[node.sizes.length - 1] ?? 0;
  }

  // Branch: sum of children
  return node.array.reduce((sum, child) => {
    return sum + (child ? nodeSize(child) : 0);
  }, 0);
}

/**
 * Create a branch or relaxed node from children
 * Uses relaxed node if children have variable sizes
 */
function createBranch<T>(
  children: VectorNode<T>[],
  existingSizes: number[] | null
): VectorNode<T> {
  // Check if we need a relaxed node
  if (existingSizes) {
    const relaxed: RelaxedNode<T> = {
      type: 'relaxed',
      array: children,
      sizes: existingSizes,
    };
    return relaxed;
  }

  // Check if children have uniform size
  const sizes = children.map(child => nodeSize(child));
  const firstSize = sizes[0];
  const isUniform = sizes.every(size => size === firstSize);

  if (isUniform) {
    // Regular branch
    const branch: BranchNode<T> = {
      type: 'branch',
      array: children,
    };
    return branch;
  }

  // Need relaxed node with size table
  const cumulativeSizes: number[] = [];
  let total = 0;
  for (const size of sizes) {
    total += size;
    cumulativeSizes.push(total);
  }

  const relaxed: RelaxedNode<T> = {
    type: 'relaxed',
    array: children,
    sizes: cumulativeSizes,
  };
  return relaxed;
}
