# @sylphx/pura

**Pure FP for TypeScript** - Fast, Type-Safe, Zero Compromise

Immutability that's faster than mutation, using **native JavaScript types**.

## Why Pura?

**Returns native types, not custom wrappers.**

```typescript
const result = produce(state, draft => { draft.count++ })
result instanceof Object  // ✅ true - it's a real Object
result[0]                 // ✅ works - it's a real Array
result.get('key')         // ✅ works - it's a real Map
```

Unlike Immutable.js (custom `List`/`Map` types) or other libraries, Pura returns **actual JavaScript Array/Object/Map/Set**. Zero learning curve. Perfect compatibility. Drop it anywhere.

## Features

- 🎯 **Native types** - Returns real Array/Object/Map/Set, not wrappers
- 🚀 **Faster than mutation** - Structural sharing beats copying
- 🔒 **Type-safe** - Full TypeScript support with inference
- 📦 **Zero dependencies** - Lightweight and fast
- ✅ **100% compatible** - Works with any library expecting native types
- 🔄 **Dual mode** - Use immutably with `produce()` or mutably as needed

## Installation

```bash
npm install @sylphx/pura
```

## Quick Start

```typescript
import { produce } from '@sylphx/pura'

// Immer-like produce API - returns native objects
const state = { count: 0, items: [1, 2, 3] }

const next = produce(state, draft => {
  draft.count++
  draft.items.push(4)
})

console.log(state.count) // 0 (unchanged)
console.log(next.count)  // 1 (new state)

// next is a real Object, next.items is a real Array
console.log(next.items[0]) // ✅ works - it's a real Array
```

## Core APIs

### `produce(base, recipe)`

Create new state by mutating a draft. **Returns native JavaScript types.**

```typescript
const user = { name: 'Alice', age: 30 }
const updated = produce(user, draft => {
  draft.age = 31
})
// updated is a real Object - use it anywhere
await api.updateUser(updated) // ✅ works with any library
```

### `pura(value)` / `unpura(value)`

Explicitly convert to persistent structures for maximum performance. **Even wrapped, objects remain native types.**

```typescript
import { pura, unpura, produce } from '@sylphx/pura'

// Wrap data for persistent operations
const wrapped = pura({ items: [1, 2, 3] })
wrapped.items[0]  // ✅ still a real Array, not a custom type

// Fast updates on persistent structures
const updated = produce(wrapped, draft => {
  draft.items.push(4)  // Mutate like normal
})

// No need to unwrap for most use cases - it's already native
// But unpura() is available if you want to strip internal metadata
const plain = unpura(updated)
```

## Why Not Immer or Immutable.js?

| Feature | Pura | Immer | Immutable.js |
|---------|------|-------|--------------|
| **Returns native types** | ✅ Real Array/Object/Map/Set | ✅ Real types | ❌ Custom List/Map types |
| **100% library compatible** | ✅ Drop-in anywhere | ✅ Works anywhere | ❌ Must convert to/from |
| **Mutable + Immutable patterns** | ✅ Both supported | ⚠️ Immutable only | ❌ Immutable only |
| **Zero learning curve** | ✅ Standard JS methods | ✅ Standard JS methods | ❌ New API to learn |
| **Performance (large data)** | ✅ Faster than mutation | ⚠️ Slower than native | ✅ Fast |
| **TypeScript inference** | ✅ Perfect inference | ✅ Good inference | ⚠️ Generic types |

```typescript
// Pura - native types, dual mode
const state = pura([1, 2, 3])
state.push(4)              // ✅ Mutable when needed
const next = produce(state, d => d.push(5)) // ✅ Immutable when needed
state[0]                   // ✅ Real Array access

// Immer - native types, immutable only
const state = [1, 2, 3]
const next = produce(state, d => d.push(4)) // ✅ Immutable only
state[0]                   // ✅ Real Array access

// Immutable.js - custom types, immutable only
const state = List([1, 2, 3])
const next = state.push(4) // ✅ Immutable only
state.get(0)               // ❌ Must use .get(), not [0]
state.toArray()            // ❌ Must convert for interop
```

## Performance

Pura uses advanced persistent data structures (HAMT for objects/maps, RRB-Tree for arrays) that share structure between versions. This makes immutable updates faster than copying, especially for large datasets.

**Adaptive strategies**: Small collections use native objects/arrays. Large collections automatically upgrade to persistent structures. Best of both worlds.

## Documentation

Full documentation available at **[pura.sylphx.com](https://pura.sylphx.com)**

- [Getting Started](https://pura.sylphx.com/guide/getting-started)
- [API Reference](https://pura.sylphx.com/api/)
- [Performance Guide](https://pura.sylphx.com/guide/performance)
- [Migration from Immer](https://pura.sylphx.com/guide/migration)

## License

MIT © [SylphX Ltd](https://github.com/SylphxAI)

## Links

- [Documentation](https://pura.sylphx.com)
- [GitHub](https://github.com/SylphxAI/Pura)
- [Issues](https://github.com/SylphxAI/Pura/issues)
- [npm](https://www.npmjs.com/package/@sylphx/pura)
