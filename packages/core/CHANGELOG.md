# @sylphx/pura

## 1.0.1

### Patch Changes

- [`0c96295`](https://github.com/SylphxAI/Pura/commit/0c962955e24b97f2417e41c0dab9b8dd0092b8cb) Thanks [@shtse8](https://github.com/shtse8)! - Fix build configuration to include dist files in npm package. The v1.0.0 release was missing compiled JavaScript files.

## 1.0.0

### Major Changes

- **BREAKING CHANGE:** Remove `repura()` function

  The `repura()` function has been removed as it was redundant. It was functionally identical to `pura(unpura(value))`.

  **Migration:**

  ```typescript
  // Before
  import { repura } from "pura";
  const optimized = repura(data);

  // After
  import { pura, unpura } from "pura";
  const optimized = pura(unpura(data));
  ```

  **Note:** In most cases, you don't need to manually re-wrap data. The `produce()` and `produceFast()` functions handle wrapping automatically.

  **Other changes:**

  - Added comprehensive documentation site at https://pura.sylphx.com
  - Published as `@sylphx/pura` on npm
  - Updated all API documentation and guides
