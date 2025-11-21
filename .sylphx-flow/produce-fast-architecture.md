# ProduceFast 架構分析與優化方案

## 當前架構

### 核心組件

```
produceFast(base, recipe)
  └─ Runtime type detection
      ├─ Array → produceFastArray
      ├─ Map → produceFastMap
      ├─ Set → produceFastSet
      └─ Object → produceFastObject
```

### 數據流

```
User Recipe → Mutation Collection → Batch Application → New Value
```

### 當前實現策略

#### 1. Array (2.4-3.1x slower)
```typescript
// 策略：檢測複雜突變
hasComplexMutation = mutations.some(m =>
  m.type === 'splice' || m.type === 'filter' || m.type === 'delete'
)

// 簡單路徑：單次 slice + 應用
if (!hasComplexMutation) {
  result = base.slice()
  for mutation: set/push
}

// 複雜路徑：順序應用
else {
  result = base.slice()
  for mutation: all types
}
```

**問題：**
- `slice()` 總是複製整個數組，即使只改一個元素
- 多次 `push` 仍然是原生操作，沒有優化空間
- `splice` 會導致數組重建

#### 2. Map (1.4x slower) ✅
```typescript
// 策略：檢測 clear 操作
if (hasClear) {
  result = new Map()
  for mutation after clear: apply
} else {
  result = new Map(base)  // 複製整個 Map
  for mutation: apply
}
```

**已優化良好，接近目標**

#### 3. Set (1.7x slower) ✅
```typescript
// 同 Map 策略
```

**已優化良好，接近目標**

#### 4. Object (2.5-13.3x slower) ❌
```typescript
// 策略 1: 單次突變
if (mutations.length === 1) {
  return setIn(base, path, value)
}

// 策略 2: 淺層批處理
if (allShallow && !hasDeletes) {
  changes = {}
  for mutation: collect changes
  return { ...base, ...changes }  // ✅ 單次 spread
}

// 策略 3: 深層突變（問題所在！）
for mutation {
  result = setIn(result, path, value)  // ❌ 每次都完整複製嵌套鏈
}
```

**核心問題：深層突變的重複複製**

---

## 問題根因分析

### Object 深層突變性能瓶頸

**測試案例：**
```typescript
produceFast(user, $ => {
  $.set(['name'], 'Alice');              // Copy 1: { name, age, profile: {...} }
  $.set(['age'], 30);                    // Copy 2: { name, age, profile: {...} }
  $.set(['profile', 'bio'], 'New bio');  // Copy 3: { name, age, profile: { bio, ... } }
  $.set(['profile', 'settings', 'theme'], 'dark'); // Copy 4: 完整嵌套複製
});
```

**每次 setIn 的開銷：**
```typescript
function setIn(obj, ['profile', 'bio'], value) {
  return {
    ...obj,                    // 複製所有頂層屬性
    profile: {
      ...obj.profile,          // 複製所有 profile 屬性
      bio: value
    }
  }
}
```

**問題：**
1. 4 次 setIn = 4 次完整對象複製
2. 每次都複製整個 `profile` 對象
3. 嵌套越深，複製鏈越長
4. 多次突變 = 指數級開銷

**原生對比：**
```typescript
// 原生只需 1 次複製
const result = {
  ...user,
  name: 'Alice',
  age: 30,
  profile: {
    ...user.profile,
    bio: 'New bio',
    settings: {
      ...user.profile.settings,
      theme: 'dark'
    }
  }
}
```

---

## 先進技術研究

### 1. Immer 的 Proxy 追蹤策略

**Immer 如何實現高性能：**
```typescript
// Immer 使用 Proxy 追蹤訪問路徑
const draft = new Proxy(base, {
  get(target, prop) {
    // 記錄訪問路徑
    // 延遲複製（Copy-on-Write）
    if (!copied) {
      copied = true
      copy = { ...target }
    }
    return createProxy(copy[prop])
  },
  set(target, prop, value) {
    // 記錄修改
    modifications.set([...path, prop], value)
  }
})

// 最後一次性構建結果
function finalize() {
  // 只複製被修改的路徑
  // 未修改的部分共享引用
}
```

**關鍵技術：**
1. **Copy-on-Write**: 只在修改時複製
2. **Structural Sharing**: 未修改部分共享引用
3. **路徑追蹤**: 記錄所有修改路徑
4. **延遲應用**: 最後一次性應用所有修改

### 2. 突變樹（Mutation Tree）優化

**概念：**
```typescript
// 將線性突變列表轉換為樹結構
mutations = [
  { path: ['name'], value: 'Alice' },
  { path: ['age'], value: 30 },
  { path: ['profile', 'bio'], value: 'New' },
  { path: ['profile', 'settings', 'theme'], value: 'dark' }
]

// 構建樹
tree = {
  name: { value: 'Alice' },
  age: { value: 30 },
  profile: {
    bio: { value: 'New' },
    settings: {
      theme: { value: 'dark' }
    }
  }
}

// 一次遍歷樹，構建結果
result = applyTree(base, tree)
```

**優點：**
- 每個路徑只複製一次
- 自動合併同路徑的多次修改
- 單次遍歷完成所有更新

### 3. 路徑規範化與分組

**技術：**
```typescript
// 按路徑前綴分組突變
const grouped = groupByPrefix(mutations)
// {
//   '': [{ path: ['name'], ... }, { path: ['age'], ... }],
//   'profile': [{ path: ['profile', 'bio'], ... }],
//   'profile.settings': [{ path: ['profile', 'settings', 'theme'], ... }]
// }

// 自底向上應用
result = applyBottomUp(base, grouped)
```

### 4. 對象池（Object Pooling）

**減少 GC 壓力：**
```typescript
// 重用中間對象
const pool = {
  objects: [],
  get() { return this.objects.pop() || {} },
  release(obj) {
    Object.keys(obj).forEach(k => delete obj[k])
    this.objects.push(obj)
  }
}
```

### 5. Spread 優化技巧

**V8 引擎優化：**
```typescript
// ❌ 慢：多次 spread
result = { ...base }
result = { ...result, a: 1 }
result = { ...result, b: 2 }

// ✅ 快：單次 spread
result = { ...base, a: 1, b: 2 }

// ✅ 快：Object.assign（小對象）
result = Object.assign({}, base, { a: 1, b: 2 })

// ✅ 快：直接屬性賦值（已知鍵）
result = { ...base }
result.a = 1
result.b = 2
```

---

## 優化方案

### 方案 1: 突變樹優化（推薦）

**實現策略：**
```typescript
interface MutationTreeNode {
  value?: any
  action?: 'set' | 'delete'
  children?: Map<string | number, MutationTreeNode>
}

function buildMutationTree(mutations: Mutation[]): MutationTreeNode {
  const root: MutationTreeNode = { children: new Map() }

  for (const { path, value, action } of mutations) {
    let node = root
    for (const key of path) {
      if (!node.children!.has(key)) {
        node.children!.set(key, { children: new Map() })
      }
      node = node.children!.get(key)!
    }
    node.value = value
    node.action = action
    delete node.children // Leaf node
  }

  return root
}

function applyMutationTree<T>(base: T, tree: MutationTreeNode): T {
  if (!tree.children || tree.children.size === 0) {
    // Leaf: return value directly
    return tree.action === 'delete' ? undefined : tree.value
  }

  // Branch: recursively build object
  const result: any = Array.isArray(base) ? [...base] : { ...base }
  let modified = false

  for (const [key, childTree] of tree.children) {
    const newValue = applyMutationTree((base as any)[key], childTree)
    if (newValue !== (base as any)[key]) {
      result[key] = newValue
      modified = true
    }
  }

  return modified ? result : base
}
```

**性能預測：**
- 單次深層更新: 5.7x → **1.5-2x** ✅
- 多次深層更新: 13.3x → **2-3x** ✅

### 方案 2: 直接構建策略

**對於淺層 + 深層混合：**
```typescript
function applyMutationsSmart(base: T, mutations: Mutation[]): T {
  // 分析突變模式
  const analysis = analyzeMutations(mutations)

  // 純淺層：單次 spread
  if (analysis.allShallow) {
    return { ...base, ...analysis.changes }
  }

  // 純深層同路徑：優化 setIn
  if (analysis.samePath) {
    return setInOptimized(base, analysis.path, analysis.finalValue)
  }

  // 混合：使用突變樹
  return applyMutationTree(base, buildMutationTree(mutations))
}
```

### 方案 3: 內聯特化

**為常見模式生成特化代碼：**
```typescript
// 2個淺層突變特化
if (mutations.length === 2 && allShallow) {
  const [m1, m2] = mutations
  return {
    ...base,
    [m1.path[0]]: m1.value,
    [m2.path[0]]: m2.value
  }
}

// 單層深度特化
if (maxDepth === 2 && samePrefix) {
  return {
    ...base,
    [prefix]: {
      ...base[prefix],
      ...buildChanges(mutations)
    }
  }
}
```

---

## 實現計劃

### Phase 1: 突變樹核心 ✅ (Next)
1. 實現 `buildMutationTree`
2. 實現 `applyMutationTree`
3. 測試正確性
4. 基準測試性能

### Phase 2: 智能策略選擇
1. 實現 `analyzeMutations`
2. 添加快速路徑判斷
3. 整合到 `produceFastObject`

### Phase 3: 微優化
1. 內聯關鍵路徑
2. 減少函數調用
3. 優化對象分配

### Phase 4: Array 優化
1. 研究稀疏數組優化
2. 優化 splice/filter 操作
3. 減少不必要的複製

---

## 性能目標

| 操作 | 當前 | 目標 | 策略 |
|------|------|------|------|
| Map single | 1.4x | 1.3x | ✅ 已接近 |
| Set single | 1.8x | 1.5x | 小幅優化 |
| Array multiple | 3.1x | 2.0x | 減少複製 |
| Object shallow | 2.5x | 1.5x | 內聯優化 |
| Object deep single | 5.7x | 1.8x | **突變樹** |
| Object deep multiple | 13.3x | 2.5x | **突變樹** |

---

## 關鍵洞察

1. **Proxy 不是敵人**: Immer 快是因為 Copy-on-Write，不是 Proxy
2. **批處理是王道**: 單次應用 >> 多次應用
3. **結構共享**: 未修改部分共享引用
4. **V8 優化**: 利用引擎的 hidden class 和 inline cache
5. **減少分配**: 對象池、直接賦值、避免中間對象

---

## 下一步

1. ✅ 實現突變樹核心
2. ✅ 測試正確性
3. ✅ 對比基準測試
4. ✅ 迭代優化直到達標
