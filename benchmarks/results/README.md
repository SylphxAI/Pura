# Benchmark Results

This directory contains raw benchmark outputs for verification.

## Files

### `comprehensive-jit-optimized.txt`

Full benchmark results after JIT optimization (typed helper prototypes, zero `any` types).

**Date**: 2024
**Environment**: Bun v1.1+, Vitest bench
**System**: macOS (exact specs in file header)

**What's tested**:
- **Arrays**: Small (100), Medium (1K), Large (10K)
- **Objects**: Shallow/deep updates
- **Maps**: Small (100), Medium (1K)
- **Sets**: Small (100), Medium (1K)
- **Read operations**: Sequential, iterator, map/filter/reduce

**Approaches compared**:
- **Direct mutation**: Native (baseline), Pura (persistent structures)
- **Immutable mutation**: Native Copy, Immer (`produce`), Pura (`produceFast`)

**Methodology**:
All immutable mutation tests use pura adaptive types as input, testing mutation performance not conversion overhead.

## Reproducing Results

```bash
bun bench benchmarks/comprehensive.bench.ts
```

**Note**: Results may vary based on:
- CPU architecture
- Node/Bun version
- System load
- V8 JIT warmup

Expect similar **relative** performance (speedup ratios), absolute numbers will differ.

## Verification

Compare your results with `comprehensive-jit-optimized.txt`:
- Pura should be 1.06-5.32x faster than Immer on arrays
- Pura should be 12x faster than Immer on medium maps
- Pura should be 100x+ faster than Immer on medium sets
- Pura should be 1.66-3.93x faster than Immer on objects
