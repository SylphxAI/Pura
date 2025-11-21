/**
 * HAMT (Hash Array Mapped Trie) Implementation
 *
 * A persistent hash map with O(log₃₂ n) operations (effectively O(1) for practical sizes).
 *
 * Key innovations:
 * - 32-way branching (5-bit partitioning) for cache-friendly lookups
 * - Bitmap compression: only store occupied slots
 * - Structural sharing: unchanged nodes reused across versions
 * - Path copying: only O(log n) nodes copied on modification
 *
 * Structure:
 * ```
 * Root (level 0: bits 0-4 of hash)
 *   ├─> Node (level 1: bits 5-9)
 *   │     ├─> Node (level 2: bits 10-14)
 *   │     │     └─> Entry (key, value)
 *   │     └─> Entry (key, value)
 *   └─> Entry (key, value)
 * ```
 *
 * Maximum depth: ~6-7 levels for millions of entries (32^6 = 1 billion)
 */

// Constants
const BITS = 5;                    // 5 bits per level
const BRANCH_FACTOR = 1 << BITS;   // 32-way branching
const MASK = BRANCH_FACTOR - 1;    // 0x1f (0b11111)
const MAX_DEPTH = 7;               // ~1 billion entries

/**
 * Hash function for keys
 * Uses simple but effective hash for strings/numbers
 * Supports hashCode() method for custom objects (IList, IMap, etc.)
 */
export function hash(key: unknown): number {
  if (typeof key === 'string') {
    return hashString(key);
  }
  if (typeof key === 'number') {
    return hashNumber(key);
  }
  // For objects with hashCode() method (IList, IMap), use that
  if (typeof key === 'object' && key !== null && 'hashCode' in key && typeof key.hashCode === 'function') {
    return key.hashCode();
  }
  // Fallback: convert to string and hash
  return hashString(String(key));
}

function hashString(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return h >>> 0; // Convert to unsigned 32-bit
}

function hashNumber(num: number): number {
  // Mix bits for better distribution
  let h = num | 0;
  h = ((h >>> 16) ^ h) * 0x45d9f3b;
  h = ((h >>> 16) ^ h) * 0x45d9f3b;
  h = (h >>> 16) ^ h;
  return h >>> 0;
}

/**
 * Count number of 1s in a 32-bit integer (population count)
 * Used to find array index from bitmap
 */
function popcount(bitmap: number): number {
  // Brian Kernighan's algorithm
  let count = 0;
  while (bitmap) {
    bitmap &= bitmap - 1; // Clear lowest set bit
    count++;
  }
  return count;
}

/**
 * Edit token for transient modifications
 * When a node has this edit token, it can be mutated in-place
 */
type Edit = { _brand: 'edit' };

/**
 * Entry: leaf node containing actual key-value pair
 */
interface Entry<K, V> {
  type: 'entry';
  key: K;
  value: V;
  hash: number;
  edit?: Edit;
}

/**
 * Collision: multiple entries with same hash (rare)
 */
interface Collision<K, V> {
  type: 'collision';
  hash: number;
  entries: Entry<K, V>[];
  edit?: Edit;
}

/**
 * Node: internal node with up to 32 children
 * Uses bitmap to compress sparse arrays
 */
interface Node<K, V> {
  type: 'node';
  bitmap: number;                    // 32-bit: which slots are occupied
  children: Array<Node<K, V> | Entry<K, V> | Collision<K, V>>;
  edit?: Edit;
}

/**
 * Root node or empty
 */
type HAMTNode<K, V> = Node<K, V> | Entry<K, V> | Collision<K, V> | null;

/**
 * Get the 5-bit index at a given level
 */
function getIndex(hash: number, shift: number): number {
  return (hash >>> shift) & MASK;
}

/**
 * Get array index from bitmap and hash index
 */
function getArrayIndex(bitmap: number, index: number): number {
  const bit = 1 << index;
  return popcount(bitmap & (bit - 1));
}

/**
 * Check if bit is set in bitmap
 */
function hasBit(bitmap: number, index: number): boolean {
  return (bitmap & (1 << index)) !== 0;
}

/**
 * Set bit in bitmap
 */
function setBit(bitmap: number, index: number): number {
  return bitmap | (1 << index);
}

/**
 * Clear bit in bitmap
 */
function clearBit(bitmap: number, index: number): number {
  return bitmap & ~(1 << index);
}

/**
 * Create a new entry
 */
function createEntry<K, V>(key: K, value: V, keyHash: number): Entry<K, V> {
  return { type: 'entry', key, value, hash: keyHash };
}

/**
 * Create a new node
 */
function createNode<K, V>(
  bitmap: number,
  children: Array<Node<K, V> | Entry<K, V> | Collision<K, V>>
): Node<K, V> {
  return { type: 'node', bitmap, children };
}

/**
 * Get value from HAMT
 * O(log₃₂ n) = O(1) for practical sizes
 */
export function get<K, V>(
  node: HAMTNode<K, V>,
  key: K,
  keyHash: number,
  shift: number = 0
): V | undefined {
  if (!node) {
    return undefined;
  }

  if (node.type === 'entry') {
    return node.key === key ? node.value : undefined;
  }

  if (node.type === 'collision') {
    const entry = node.entries.find(e => e.key === key);
    return entry?.value;
  }

  // Node: traverse down
  const index = getIndex(keyHash, shift);
  if (!hasBit(node.bitmap, index)) {
    return undefined; // Bit not set = key not present
  }

  const arrayIndex = getArrayIndex(node.bitmap, index);
  return get(node.children[arrayIndex]!, key, keyHash, shift + BITS);
}

/**
 * Set value in HAMT (returns new root)
 * O(log₃₂ n) with path copying
 */
export function set<K, V>(
  node: HAMTNode<K, V>,
  key: K,
  value: V,
  keyHash: number,
  shift: number = 0
): HAMTNode<K, V> {
  if (!node) {
    return createEntry(key, value, keyHash);
  }

  if (node.type === 'entry') {
    // Same key: replace value
    if (node.key === key) {
      return createEntry(key, value, keyHash);
    }

    // Hash collision: create collision node or expand
    if (node.hash === keyHash) {
      return {
        type: 'collision',
        hash: keyHash,
        entries: [node, createEntry(key, value, keyHash)],
      };
    }

    // Different hash: expand into node
    return expandEntries(node, createEntry(key, value, keyHash), shift);
  }

  if (node.type === 'collision') {
    // Hash collision: append or replace
    const existingIndex = node.entries.findIndex(e => e.key === key);
    if (existingIndex >= 0) {
      // Replace
      const newEntries = [...node.entries];
      newEntries[existingIndex] = createEntry(key, value, keyHash);
      return { ...node, entries: newEntries };
    }
    // Append
    return { ...node, entries: [...node.entries, createEntry(key, value, keyHash)] };
  }

  // Node: traverse down and copy path
  const index = getIndex(keyHash, shift);
  const arrayIndex = getArrayIndex(node.bitmap, index);

  if (hasBit(node.bitmap, index)) {
    // Update existing child
    const oldChild = node.children[arrayIndex]!;
    const newChild = set(oldChild, key, value, keyHash, shift + BITS);

    // Structural sharing: only copy if changed
    if (newChild === oldChild) {
      return node;
    }

    const newChildren = [...node.children];
    newChildren[arrayIndex] = newChild;
    return createNode(node.bitmap, newChildren);
  }

  // Insert new child
  const newChild = createEntry(key, value, keyHash);
  const newChildren = [
    ...node.children.slice(0, arrayIndex),
    newChild,
    ...node.children.slice(arrayIndex),
  ];
  const newBitmap = setBit(node.bitmap, index);
  return createNode(newBitmap, newChildren);
}

/**
 * Expand two entries into a node
 */
function expandEntries<K, V>(
  entry1: Entry<K, V>,
  entry2: Entry<K, V>,
  shift: number
): Node<K, V> {
  const index1 = getIndex(entry1.hash, shift);
  const index2 = getIndex(entry2.hash, shift);

  if (index1 === index2) {
    // Still colliding: go deeper
    const child = expandEntries(entry1, entry2, shift + BITS);
    return createNode(1 << index1, [child]);
  }

  // No collision: create node with both entries
  const [first, second] = index1 < index2 ? [entry1, entry2] : [entry2, entry1];
  const bitmap = setBit(setBit(0, index1), index2);
  return createNode(bitmap, [first, second]);
}

/**
 * Delete key from HAMT (returns new root)
 * O(log₃₂ n) with path copying and node compression
 */
export function remove<K, V>(
  node: HAMTNode<K, V>,
  key: K,
  keyHash: number,
  shift: number = 0
): HAMTNode<K, V> {
  if (!node) {
    return null;
  }

  if (node.type === 'entry') {
    return node.key === key ? null : node;
  }

  if (node.type === 'collision') {
    const newEntries = node.entries.filter(e => e.key !== key);
    if (newEntries.length === node.entries.length) {
      return node; // Key not found
    }
    if (newEntries.length === 0) {
      return null; // All entries removed
    }
    if (newEntries.length === 1) {
      return newEntries[0]!; // Collapse to single entry
    }
    return { ...node, entries: newEntries };
  }

  // Node: traverse down
  const index = getIndex(keyHash, shift);
  if (!hasBit(node.bitmap, index)) {
    return node; // Key not present
  }

  const arrayIndex = getArrayIndex(node.bitmap, index);
  const oldChild = node.children[arrayIndex]!;
  const newChild = remove(oldChild, key, keyHash, shift + BITS);

  // Child unchanged
  if (newChild === oldChild) {
    return node;
  }

  // Child removed: compress node
  if (!newChild) {
    const newChildren = [
      ...node.children.slice(0, arrayIndex),
      ...node.children.slice(arrayIndex + 1),
    ];
    const newBitmap = clearBit(node.bitmap, index);

    // Collapse if only one child remains
    if (newChildren.length === 1 && newChildren[0]!.type === 'entry') {
      return newChildren[0]!;
    }

    return createNode(newBitmap, newChildren);
  }

  // Child updated
  const newChildren = [...node.children];
  newChildren[arrayIndex] = newChild;
  return createNode(node.bitmap, newChildren);
}

/**
 * Get size of HAMT (number of entries)
 */
export function size<K, V>(node: HAMTNode<K, V>): number {
  if (!node) return 0;
  if (node.type === 'entry') return 1;
  if (node.type === 'collision') return node.entries.length;

  return node.children.reduce((sum, child) => sum + size(child), 0);
}

/**
 * Create transient (mutable) HAMT for batch operations
 * Returns edit token for this transient instance
 */
export function asTransient<K, V>(node: HAMTNode<K, V>): { node: HAMTNode<K, V>; edit: Edit } {
  const edit: Edit = { _brand: 'edit' };
  return { node, edit };
}

/**
 * Convert transient HAMT back to persistent (immutable)
 * Removes all edit tokens from the tree
 */
export function asPersistent<K, V>(node: HAMTNode<K, V>): HAMTNode<K, V> {
  // Edit tokens don't need explicit removal - new persistent operations
  // will create new nodes without edit tokens
  return node;
}

/**
 * Set value in HAMT with mutable operations (for transients)
 * O(log₃₂ n) with in-place modifications when edit matches
 */
export function setMut<K, V>(
  node: HAMTNode<K, V>,
  key: K,
  value: V,
  keyHash: number,
  edit: Edit,
  shift: number = 0
): HAMTNode<K, V> {
  if (!node) {
    return { type: 'entry', key, value, hash: keyHash, edit };
  }

  if (node.type === 'entry') {
    // Same key: replace value
    if (node.key === key) {
      if (node.edit === edit) {
        // Mutate in-place
        node.value = value;
        return node;
      }
      return { type: 'entry', key, value, hash: keyHash, edit };
    }

    // Hash collision: create collision node or expand
    if (node.hash === keyHash) {
      const newEntry: Entry<K, V> = { type: 'entry', key, value, hash: keyHash, edit };
      return {
        type: 'collision',
        hash: keyHash,
        entries: [node, newEntry],
        edit,
      };
    }

    // Different hash: expand into node
    return expandEntriesMut(node, { type: 'entry', key, value, hash: keyHash, edit }, shift, edit);
  }

  if (node.type === 'collision') {
    // Hash collision: append or replace
    const existingIndex = node.entries.findIndex(e => e.key === key);

    if (node.edit === edit) {
      // Mutate in-place
      if (existingIndex >= 0) {
        // Replace
        node.entries[existingIndex] = { type: 'entry', key, value, hash: keyHash, edit };
      } else {
        // Append
        node.entries.push({ type: 'entry', key, value, hash: keyHash, edit });
      }
      return node;
    }

    // Copy
    if (existingIndex >= 0) {
      // Replace
      const newEntries = [...node.entries];
      newEntries[existingIndex] = { type: 'entry', key, value, hash: keyHash, edit };
      return { ...node, entries: newEntries, edit };
    }
    // Append
    return { ...node, entries: [...node.entries, { type: 'entry', key, value, hash: keyHash, edit }], edit };
  }

  // Node: traverse down
  const index = getIndex(keyHash, shift);
  const arrayIndex = getArrayIndex(node.bitmap, index);

  if (hasBit(node.bitmap, index)) {
    // Update existing child
    const oldChild = node.children[arrayIndex]!;
    const newChild = setMut(oldChild, key, value, keyHash, edit, shift + BITS);

    if (node.edit === edit) {
      // Mutate in-place
      node.children[arrayIndex] = newChild;
      return node;
    }

    // Copy
    const newChildren = [...node.children];
    newChildren[arrayIndex] = newChild;
    return { type: 'node', bitmap: node.bitmap, children: newChildren, edit };
  }

  // Insert new child
  const newEntry: Entry<K, V> = { type: 'entry', key, value, hash: keyHash, edit };

  if (node.edit === edit) {
    // Mutate in-place: splice into array
    node.children.splice(arrayIndex, 0, newEntry);
    node.bitmap = setBit(node.bitmap, index);
    return node;
  }

  // Copy
  const newChildren = [
    ...node.children.slice(0, arrayIndex),
    newEntry,
    ...node.children.slice(arrayIndex),
  ];
  const newBitmap = setBit(node.bitmap, index);
  return { type: 'node', bitmap: newBitmap, children: newChildren, edit };
}

/**
 * Expand two entries into a node (mutable version)
 */
function expandEntriesMut<K, V>(
  entry1: Entry<K, V>,
  entry2: Entry<K, V>,
  shift: number,
  edit: Edit
): Node<K, V> {
  const index1 = getIndex(entry1.hash, shift);
  const index2 = getIndex(entry2.hash, shift);

  if (index1 === index2) {
    // Still colliding: go deeper
    const child = expandEntriesMut(entry1, entry2, shift + BITS, edit);
    return { type: 'node', bitmap: 1 << index1, children: [child], edit };
  }

  // No collision: create node with both entries
  const [first, second] = index1 < index2 ? [entry1, entry2] : [entry2, entry1];
  const bitmap = setBit(setBit(0, index1), index2);
  return { type: 'node', bitmap, children: [first, second], edit };
}
