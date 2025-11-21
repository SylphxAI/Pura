/**
 * Vec - RRB-Tree Persistent Vector
 * Relaxed Radix Balanced Tree enables O(log n) concat/slice
 */

import { BITS, BRANCH_FACTOR, MASK } from './constants';
import type { Node, Vec, Owner } from './types';

// Check if node is relaxed (has size table)
export function isRelaxed<T>(node: Node<T>): boolean {
  return node.sizes !== undefined;
}

// Get subtree size for regular node at given level
export function regularSubtreeSize(level: number): number {
  return 1 << level;
}

// Find child index in relaxed node for given index
export function relaxedChildIndex<T>(node: Node<T>, index: number): { childIdx: number; subIndex: number } {
  const sizes = node.sizes!;
  let lo = 0, hi = sizes.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sizes[mid] <= index) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  const childIdx = lo;
  const subIndex = childIdx === 0 ? index : index - sizes[childIdx - 1];
  return { childIdx, subIndex };
}

export function emptyNode<T>(): Node<T> {
  return { arr: [] };
}

export function emptyVec<T>(): Vec<T> {
  return {
    count: 0,
    shift: BITS,
    root: emptyNode<T>(),
    tail: [],
    treeCount: 0,
  };
}

export function ensureEditableNode<T>(node: Node<T>, owner: Owner): Node<T> {
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

export function vecPush<T>(vec: Vec<T>, owner: Owner, val: T): Vec<T> {
  const { count, shift, root, tail, treeCount, tailOwner } = vec;

  if (tail.length < BRANCH_FACTOR) {
    if (owner && tailOwner === owner) {
      tail.push(val);
      return { count: count + 1, shift, root, tail, treeCount, tailOwner };
    } else if (owner) {
      const newTail = [...tail, val];
      return { count: count + 1, shift, root, tail: newTail, treeCount, tailOwner: owner };
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
      tailOwner: owner,
    };
  }

  const newRoot = pushTail(owner, shift, root, count, tailNode);
  return {
    count: count + 1,
    shift,
    root: newRoot,
    tail: newTail,
    treeCount: newTreeCount,
    tailOwner: owner,
  };
}

export function vecAssoc<T>(vec: Vec<T>, owner: Owner, index: number, val: T): Vec<T> {
  const { count, shift, root, tail, treeCount, tailOwner } = vec;
  if (index < 0 || index >= count) {
    throw new RangeError('Index out of bounds');
  }

  if (index >= treeCount) {
    const tailIdx = index - treeCount;
    if (owner && tailOwner === owner) {
      tail[tailIdx] = val;
      return vec;
    } else if (owner) {
      const newTail = tail.slice();
      newTail[tailIdx] = val;
      return { count, shift, root, tail: newTail, treeCount, tailOwner: owner };
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

export function vecPop<T>(vec: Vec<T>, owner: Owner): { vec: Vec<T>; val: T | undefined } {
  const { count, root, tail, shift, treeCount, tailOwner } = vec;
  if (count === 0) return { vec, val: undefined };

  if (count === 1) {
    return { vec: emptyVec<T>(), val: tail[0] };
  }

  if (tail.length > 0) {
    const val = tail[tail.length - 1];
    if (owner && tailOwner === owner) {
      tail.pop();
      return { vec: { count: count - 1, shift, root, tail, treeCount, tailOwner }, val };
    } else if (owner) {
      const newTail = tail.slice(0, -1);
      return { vec: { count: count - 1, shift, root, tail: newTail, treeCount, tailOwner: owner }, val };
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

export function vecGet<T>(vec: Vec<T>, index: number): T | undefined {
  const { count, shift, root, tail, treeCount } = vec;
  if (index < 0 || index >= count) return undefined;

  if (index >= treeCount) {
    return tail[index - treeCount];
  }

  // RRB: Check if tree has relaxed nodes
  if (root.sizes) {
    let node: Node<T> = root;
    let idx = index;
    let level = shift;
    while (level > 0) {
      if (node.sizes) {
        const { childIdx, subIndex } = relaxedChildIndex(node, idx);
        node = node.arr[childIdx] as Node<T>;
        idx = subIndex;
      } else {
        node = node.arr[(idx >>> level) & MASK] as Node<T>;
        idx = idx & ((1 << level) - 1);
      }
      level -= BITS;
    }
    return node.arr[idx] as T;
  }

  // Regular tree - optimized bit-shift indexing
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

export function vecFromArray<T>(arr: T[]): Vec<T> {
  const len = arr.length;
  if (len === 0) return emptyVec<T>();

  if (len <= BRANCH_FACTOR) {
    return {
      count: len,
      shift: BITS,
      root: { owner: undefined, arr: [] },
      tail: arr.slice(),
      treeCount: 0,
    };
  }

  const owner: Owner = {};
  let vec = emptyVec<T>();
  for (let i = 0; i < len; i++) {
    vec = vecPush(vec, owner, arr[i]!);
  }
  return vec;
}

export function vecToArray<T>(vec: Vec<T>): T[] {
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

export function* vecIter<T>(vec: Vec<T>): Generator<T, void, undefined> {
  const { shift, root, tail, treeCount } = vec;

  if (treeCount > 0) {
    const stack: { node: Node<T>; level: number; idx: number }[] = [{ node: root, level: shift, idx: 0 }];
    let yielded = 0;

    while (stack.length > 0 && yielded < treeCount) {
      const frame = stack[stack.length - 1]!;
      if (frame.level === 0) {
        const leaf = frame.node.arr as T[];
        while (frame.idx < leaf.length && yielded < treeCount) {
          yield leaf[frame.idx++]!;
          yielded++;
        }
        stack.pop();
      } else {
        const children = frame.node.arr as Node<T>[];
        if (frame.idx < children.length) {
          const child = children[frame.idx++]!;
          stack.push({ node: child, level: frame.level - BITS, idx: 0 });
        } else {
          stack.pop();
        }
      }
    }
  }

  for (let i = 0; i < tail.length; i++) {
    yield tail[i]!;
  }
}

// =====================================================
// RRB-Tree Operations (O(log n) concat/slice)
// =====================================================

function nodeSize<T>(node: Node<T>, level: number): number {
  if (level === 0) {
    return node.arr.length;
  }
  if (node.sizes) {
    return node.sizes[node.sizes.length - 1] || 0;
  }
  const children = node.arr as Node<T>[];
  if (children.length === 0) return 0;
  const fullChildSize = 1 << level;
  return (children.length - 1) * fullChildSize + nodeSize(children[children.length - 1]!, level - BITS);
}

function makeRelaxedNode<T>(owner: Owner, children: Node<T>[], level: number): Node<T> {
  const sizes: number[] = [];
  let cumulative = 0;
  for (const child of children) {
    cumulative += nodeSize(child, level - BITS);
    sizes.push(cumulative);
  }
  return { owner, arr: children, sizes };
}

function mergeNodes<T>(
  owner: Owner,
  left: Node<T>,
  right: Node<T>,
  level: number
): Node<T>[] {
  if (level === 0) {
    const combined = [...left.arr, ...right.arr] as T[];
    if (combined.length <= BRANCH_FACTOR) {
      return [{ owner, arr: combined }];
    }
    return [left, right];
  }

  const leftChildren = left.arr as Node<T>[];
  const rightChildren = right.arr as Node<T>[];

  if (leftChildren.length + rightChildren.length <= BRANCH_FACTOR) {
    const merged = [...leftChildren, ...rightChildren];
    const needsSizes = left.sizes || right.sizes ||
      leftChildren.some((_, i) => i < leftChildren.length - 1 &&
        nodeSize(leftChildren[i]!, level - BITS) !== (1 << (level - BITS)));
    if (needsSizes) {
      return [makeRelaxedNode(owner, merged, level)];
    }
    return [{ owner, arr: merged }];
  }

  return [left, right];
}

export function vecConcat<T>(left: Vec<T>, right: Vec<T>, owner: Owner): Vec<T> {
  if (left.count === 0) return right;
  if (right.count === 0) return left;

  const totalCount = left.count + right.count;
  if (totalCount <= BRANCH_FACTOR) {
    const newTail = [...vecToArray(left), ...vecToArray(right)];
    return {
      count: totalCount,
      shift: BITS,
      root: emptyNode<T>(),
      tail: newTail,
      treeCount: 0,
      tailOwner: owner,
    };
  }

  let leftWithFlushedTail = left;
  if (left.tail.length > 0) {
    let v = { ...left, tail: [], treeCount: left.treeCount, count: left.treeCount };
    for (const el of left.tail) {
      v = vecPush(v, owner, el);
    }
    leftWithFlushedTail = v;
  }

  if (leftWithFlushedTail.treeCount === 0) {
    let v = emptyVec<T>();
    for (const el of vecIter(left)) {
      v = vecPush(v, owner, el);
    }
    for (const el of vecIter(right)) {
      v = vecPush(v, owner, el);
    }
    return v;
  }

  const leftShift = leftWithFlushedTail.shift;
  const rightShift = right.shift;
  const maxShift = Math.max(leftShift, rightShift);

  const liftTree = (root: Node<T>, fromShift: number, toShift: number): Node<T> => {
    let node = root;
    while (fromShift < toShift) {
      node = { owner, arr: [node] };
      fromShift += BITS;
    }
    return node;
  };

  let leftRoot = liftTree(leftWithFlushedTail.root, leftShift, maxShift);
  let rightRoot = liftTree(right.root, rightShift, maxShift);

  const merged = mergeNodes(owner, leftRoot, rightRoot, maxShift);

  let newRoot: Node<T>;
  let newShift = maxShift;

  if (merged.length === 1) {
    newRoot = merged[0]!;
  } else {
    newRoot = makeRelaxedNode(owner, merged, maxShift + BITS);
    newShift = maxShift + BITS;
  }

  const newTreeCount = leftWithFlushedTail.treeCount + right.treeCount;

  return {
    count: newTreeCount + right.tail.length,
    shift: newShift,
    root: newRoot,
    tail: right.tail.slice(),
    treeCount: newTreeCount,
    tailOwner: owner,
  };
}

function sliceLeftTree<T>(node: Node<T>, level: number, index: number, owner: Owner): Node<T> | null {
  if (level === 0) {
    const arr = node.arr as T[];
    if (index >= arr.length) return null;
    if (index === 0) return node;
    return { owner, arr: arr.slice(index) };
  }

  const children = node.arr as Node<T>[];
  let childIdx: number;
  let subIndex: number;

  if (node.sizes) {
    const r = relaxedChildIndex(node, index);
    childIdx = r.childIdx;
    subIndex = r.subIndex;
  } else {
    const subtreeSize = 1 << level;
    childIdx = Math.floor(index / subtreeSize);
    subIndex = index % subtreeSize;
  }

  if (childIdx >= children.length) return null;

  const newChildren: Node<T>[] = [];

  const firstChild = sliceLeftTree(children[childIdx]!, level - BITS, subIndex, owner);
  if (firstChild) newChildren.push(firstChild);

  for (let i = childIdx + 1; i < children.length; i++) {
    newChildren.push(children[i]!);
  }

  if (newChildren.length === 0) return null;
  if (newChildren.length === 1 && !firstChild) return newChildren[0]!;

  return makeRelaxedNode(owner, newChildren, level);
}

function sliceRightTree<T>(node: Node<T>, level: number, index: number, owner: Owner): Node<T> | null {
  if (level === 0) {
    const arr = node.arr as T[];
    if (index <= 0) return null;
    if (index >= arr.length) return node;
    return { owner, arr: arr.slice(0, index) };
  }

  const children = node.arr as Node<T>[];
  let childIdx: number;
  let subIndex: number;

  if (node.sizes) {
    const r = relaxedChildIndex(node, index - 1);
    childIdx = r.childIdx;
    subIndex = r.subIndex + 1;
  } else {
    const subtreeSize = 1 << level;
    childIdx = Math.floor((index - 1) / subtreeSize);
    subIndex = ((index - 1) % subtreeSize) + 1;
  }

  if (childIdx < 0) return null;

  const newChildren: Node<T>[] = [];

  for (let i = 0; i < childIdx; i++) {
    newChildren.push(children[i]!);
  }

  if (childIdx < children.length) {
    const lastChild = sliceRightTree(children[childIdx]!, level - BITS, subIndex, owner);
    if (lastChild) newChildren.push(lastChild);
  }

  if (newChildren.length === 0) return null;

  const needsSizes = newChildren.length > 1 &&
    newChildren.slice(0, -1).some((c, i) => nodeSize(c, level - BITS) !== (1 << (level - BITS)));

  if (needsSizes) {
    return makeRelaxedNode(owner, newChildren, level);
  }
  return { owner, arr: newChildren };
}

export function vecSlice<T>(vec: Vec<T>, owner: Owner, start: number, end: number): Vec<T> {
  const { count, shift, root, tail, treeCount } = vec;

  if (start < 0) start = Math.max(0, count + start);
  if (end < 0) end = Math.max(0, count + end);
  if (start >= count || end <= start) return emptyVec<T>();
  if (end > count) end = count;

  const newCount = end - start;

  if (newCount <= BRANCH_FACTOR) {
    const result: T[] = [];
    for (let i = start; i < end; i++) {
      result.push(vecGet(vec, i) as T);
    }
    return vecFromArray(result);
  }

  if (start >= treeCount) {
    return {
      count: newCount,
      shift: BITS,
      root: emptyNode<T>(),
      tail: tail.slice(start - treeCount, end - treeCount),
      treeCount: 0,
      tailOwner: owner,
    };
  }

  if (end <= treeCount) {
    let slicedRoot = sliceLeftTree(root, shift, start, owner);
    if (!slicedRoot) return emptyVec<T>();

    slicedRoot = sliceRightTree(slicedRoot, shift, end - start, owner);
    if (!slicedRoot) return emptyVec<T>();

    let newShift = shift;
    while (newShift > BITS && slicedRoot.arr.length === 1 && !slicedRoot.sizes) {
      slicedRoot = slicedRoot.arr[0] as Node<T>;
      newShift -= BITS;
    }

    return {
      count: newCount,
      shift: newShift,
      root: slicedRoot,
      tail: [],
      treeCount: newCount,
      tailOwner: owner,
    };
  }

  const tailStart = Math.max(0, start - treeCount);
  const tailEnd = end - treeCount;

  let treeSlice: Vec<T>;
  if (start < treeCount) {
    let slicedRoot = sliceLeftTree(root, shift, start, owner);
    if (slicedRoot) {
      let newShift = shift;
      while (newShift > BITS && slicedRoot.arr.length === 1 && !slicedRoot.sizes) {
        slicedRoot = slicedRoot.arr[0] as Node<T>;
        newShift -= BITS;
      }
      treeSlice = {
        count: treeCount - start,
        shift: newShift,
        root: slicedRoot,
        tail: [],
        treeCount: treeCount - start,
      };
    } else {
      treeSlice = emptyVec<T>();
    }
  } else {
    treeSlice = emptyVec<T>();
  }

  const newTail = tail.slice(tailStart, tailEnd);

  return {
    count: treeSlice.count + newTail.length,
    shift: treeSlice.shift,
    root: treeSlice.root,
    tail: newTail,
    treeCount: treeSlice.treeCount,
    tailOwner: owner,
  };
}
