# Performance Optimization Analysis

研究 Immutable.js 和其他高性能庫後的優化建議。

## 現狀分析

### Pura 當前性能
- List build (Transient): **4.8x slower** than mutation
- List sequential sets: **19.4x slower** than mutation
- Map build (Transient): **2.9x slower** than mutation
- Map sequential sets: **5.0x slower** than mutation

### 已實現的優化
✅ Structural sharing (O(log n) path copying)
✅ Transient API with Edit tokens
✅ Tail buffer optimization (32 elements)
✅ Builder API (native array → persistent)
✅ 32-way branching (cache-friendly)
✅ Bitmap compression (HAMT)

---

## 研究發現

### 1. Immutable.js 實現
發現他們的 `editableVNode` 函數：

```javascript
function editableVNode(node, ownerID) {
  if (ownerID && node && ownerID === node.ownerID) {
    return node;  // Already editable
  }
  return new VNode(node ? node.array.slice() : [], ownerID);
}
```

**結論**: 與我們的 Edit token 機制完全相同！✅

### 2. 「比 Mutation 更快」的真相

網上聲稱 "faster than mutation" 的庫實際上是：

**Mutative/Immer (Proxy-based)**:
- 比較對象: Naive FP (spread/copy)
- NOT 比原生 mutation 快
- 仍然是 O(n) 複製

**Immutable.js (Persistent)**:
- 100x faster than **naive FP** (slice + push)
- NOT faster than mutation
- Structural sharing 優勢

**結論**: 沒有魔法讓 immutable 比 mutation 快。我們已經做得很好了。

---

## 進一步優化空間

### 性能瓶頸分析

#### 為什麼還有 3-20x 差距？

1. **Tree traversal overhead** (最大因素)
   - Mutation: O(1) direct array access
   - Pura: O(log₃₂ n) tree navigation + bit-shifting
   - 即使 log₃₂ 1000 ≈ 2，每次仍需 2-6 次 function call

2. **Object allocation**
   - Mutation: 0 allocations
   - Pura Transient: Still creates ~log n nodes per operation
   - GC pressure

3. **Function call overhead**
   - Each tree level = function call
   - No tail-call optimization in JS

4. **Indirection**
   - Array access: `arr[i]` - single memory lookup
   - Tree access: `node.array[idx].array[idx]` - multiple lookups

---

## 可行的優化策略

### 優先級 1: 低成本高收益

#### 1.1 內聯小函數 (Inline Small Functions)

**當前**:
```typescript
function getIndex(hash: number, shift: number): number {
  return (hash >>> shift) & MASK;
}

// Called thousands of times
const index = getIndex(hash, shift);
```

**優化**:
```typescript
// Direct inline
const index = (hash >>> shift) & MASK;
```

**預期提升**: 5-10% (減少 function call overhead)

---

#### 1.2 預分配數組 (Pre-allocate Arrays)

**當前**:
```typescript
const newChildren = [...node.children];  // Copy
newChildren[index] = newChild;
```

**優化**:
```typescript
const newChildren = new Array(node.children.length);
for (let i = 0; i < node.children.length; i++) {
  newChildren[i] = node.children[i];
}
newChildren[index] = newChild;
```

**預期提升**: 10-15% (V8 優化 monomorphic arrays)

---

#### 1.3 避免不必要的對象創建

**當前 (HAMT setMut)**:
```typescript
if (node.edit === edit) {
  node.children.splice(arrayIndex, 0, newEntry);  // Mutation
  node.bitmap = setBit(node.bitmap, index);
  return node;
}

// Copy
const newChildren = [
  ...node.children.slice(0, arrayIndex),
  newEntry,
  ...node.children.slice(arrayIndex),
];
```

**問題**: `splice` 仍然創建內部臨時數組

**優化**:
```typescript
if (node.edit === edit) {
  // Pre-allocate exact size
  const len = node.children.length;
  const arr = new Array(len + 1);
  for (let i = 0; i < arrayIndex; i++) arr[i] = node.children[i];
  arr[arrayIndex] = newEntry;
  for (let i = arrayIndex; i < len; i++) arr[i + 1] = node.children[i];
  node.children = arr;
  node.bitmap = setBit(node.bitmap, index);
  return node;
}
```

**預期提升**: 5-10%

---

### 優先級 2: 中等成本中等收益

#### 2.1 Flat Array Optimization (小 List)

**概念**: Size < 32 的 List 直接用 array，不建 tree

**當前**:
```typescript
IList.of(1, 2, 3)  // 創建 root + tail nodes
```

**優化**:
```typescript
// Special case for small lists
if (size <= 32) {
  return new IList({ type: 'flat', array: [...items] });
}
```

**優勢**:
- 小 List (< 32 elements): 接近原生性能
- 常見場景優化 (大多數 List 都很小)

**預期提升**: Small lists 50%+, overall 20-30%

---

#### 2.2 Cache Last Access (Locality)

**概念**: Sequential access 很常見，cache 最後訪問的節點

```typescript
class IList<T> {
  private lastAccessIndex?: number;
  private lastAccessNode?: LeafNode<T>;

  get(index: number): T | undefined {
    // Cache hit
    if (this.lastAccessNode &&
        index >= this.lastAccessIndex! &&
        index < this.lastAccessIndex! + 32) {
      return this.lastAccessNode.array[index & 0x1f];
    }

    // Cache miss - traverse and cache
    const result = Vector.get(this.root, index);
    // ... update cache ...
    return result;
  }
}
```

**預期提升**: Sequential access 30-50%

---

#### 2.3 Specialized Fast Paths

**Concept**: Optimize common patterns

```typescript
// Fast path for map.set() when key doesn't exist
set(key: K, value: V): IMap<K, V> {
  const keyHash = HAMT.hash(key);

  // Fast path: empty map
  if (this.size === 0) {
    return new IMap({ type: 'entry', key, value, hash: keyHash }, 1);
  }

  // Normal path
  // ...
}
```

**預期提升**: 5-10% for common patterns

---

### 優先級 3: 高成本高風險

#### 3.1 WASM Implementation (核心熱點路徑)

將 tree traversal 用 WebAssembly 實現：

**優勢**:
- 更快的位運算
- 更好的內聯
- 更少的 GC

**風險**:
- 複雜度大增
- Bundle size 增加
- 需要維護兩套代碼

**預期提升**: 30-50% for tree operations

---

#### 3.2 Pool Object Allocation

**概念**: Reuse node objects instead of creating new

```typescript
class NodePool {
  private pool: BranchNode<any>[] = [];

  allocate(): BranchNode<any> {
    return this.pool.pop() || { type: 'branch', array: [], edit: undefined };
  }

  release(node: BranchNode<any>): void {
    node.array = [];
    node.edit = undefined;
    this.pool.push(node);
  }
}
```

**優勢**: 減少 GC pressure

**風險**: 記憶體洩漏風險，複雜度增加

**預期提升**: 10-20%

---

## 推薦實施順序

### Phase 1: Quick Wins (1-2 days)
1. ✅ Inline bit operations
2. ✅ Pre-allocate arrays in hot paths
3. ✅ Remove unnecessary object creation in transient

**預期**: 20-30% overall improvement
**新 gap**: List build 3.4x, Map build 2.0x

---

### Phase 2: Medium Effort (1 week)
1. ✅ Flat array optimization for small collections
2. ✅ Cache last access for sequential patterns
3. ✅ Specialized fast paths

**預期**: Additional 30-40% improvement
**新 gap**: List build 2.4x, Map build 1.4x

---

### Phase 3: Advanced (2-4 weeks)
1. ❓ WASM for critical paths
2. ❓ Object pooling
3. ❓ Custom memory layout

**預期**: Additional 30-50%
**新 gap**: List build 1.6x, Map build 1.0x (接近 mutation!)

---

## 現實檢查: 理論極限

### 為什麼無法完全達到 Mutation 性能？

**Fundamental overhead that CANNOT be eliminated**:

1. **Structural sharing 成本**
   - Mutation: 直接修改
   - Persistent: 必須複製 path (至少 O(log n) nodes)

2. **Tree navigation**
   - Mutation: `arr[i]` - 1 operation
   - Persistent: 2-6 function calls + bit operations

3. **Memory allocation**
   - Mutation: 0 allocations
   - Persistent: 至少創建 log n 個 node objects

**理論最佳情況**: ~2x slower than mutation

這是 **immutability 的必然代價**。

---

## 結論

### 當前狀態
- ✅ 已經實現所有標準優化 (transient, tail buffer, etc.)
- ✅ 與 Immutable.js 相同的優化策略
- ✅ 比 naive FP 快 40-742x
- ⚠️ 比 mutation 慢 3-20x

### 可優化空間
- Phase 1 優化: 20-30% improvement → **2-14x gap**
- Phase 2 優化: 30-40% improvement → **1.4-10x gap**
- Phase 3 優化: 30-50% improvement → **1-7x gap**

### 理論極限
**最佳情況**: ~2x slower than mutation (with heroic optimizations)

### 建議
1. **先實施 Phase 1**: 低風險高回報
2. **評估 Phase 2**: 根據實際需求決定
3. **謹慎 Phase 3**: 成本效益比不高

### 最重要的認知
**Persistent data structures 永遠不會比 mutation 快**。我們的目標是：
- ✅ 比 naive FP 快很多 (已達成)
- ✅ 與 mutation 差距可接受 (已達成)
- ✅ 提供 immutability 價值 (safety, time-travel, etc.)

**3-5x slower** 是可接受且合理的 trade-off for immutability benefits.

---

## 附錄: Benchmark 比較

### Immutable.js vs Pura

我們無法直接比較，因為：
1. Immutable.js 沒有公開的 vs mutation benchmarks
2. 不同的測試環境
3. 不同的實現細節 (他們用 JS，我們用 TS)

但從架構來看：
- **相同**: Vector Trie, 32-way branching, owner ID
- **差異**: 我們有 tail buffer optimization，他們沒有明確提到

**推測**: 性能應該在同一量級 (±20%)

### 下一步
1. 安裝 Immutable.js
2. 在相同環境下跑 benchmark
3. 對比具體數據
4. 學習他們的特定優化

---

## 行動計劃

### 立即執行 (本週)
- [ ] Inline hot path bit operations
- [ ] Pre-allocate arrays instead of spread
- [ ] Remove splice in transient, use manual loop

### 考慮執行 (下週)
- [ ] Flat array for size <= 32
- [ ] Last access cache
- [ ] Benchmark vs Immutable.js

### 未來考慮
- [ ] WASM evaluation
- [ ] Object pooling POC
- [ ] Memory layout optimization

**預期最終狀態**: 2-7x slower than mutation (down from 3-20x) ✅
