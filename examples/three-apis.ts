/**
 * Three APIs Demo: pura(), produce(), unpura()
 *
 * Shows seamless interoperability between native and efficient arrays
 */

import { pura, produce, unpura } from '../packages/core/src/index';

console.log('=== Three APIs: pura(), produce(), unpura() ===\n');

// ===== pura() - Convert to efficient array =====
console.log('1️⃣ pura() - Create efficient array');
console.log('─'.repeat(50));

const native = [1, 2, 3];
console.log('Native array:', native);

const efficient = pura(native);
console.log('After pura():', efficient);
console.log('Type: efficient array with O(log n) operations');

// pura() is idempotent - already efficient? Return as-is
const efficient2 = pura(efficient);
console.log('pura(efficient) === efficient:', efficient === efficient2);
console.log('✅ Idempotent - no unnecessary conversion\n');

// ===== produce() - Immutable updates =====
console.log('2️⃣ produce() - Immutable updates with structural sharing');
console.log('─'.repeat(50));

// Works with native arrays
const native2 = [10, 20, 30];
const result1 = produce(native2, draft => {
  draft.push(40);
  draft[0] = 100;
});

console.log('Native array:', native2);
console.log('After produce:', result1);

// Works with efficient arrays
const efficient3 = pura([10, 20, 30]);
const result2 = produce(efficient3, draft => {
  draft.push(40);
  draft[0] = 100;
});

console.log('Efficient array:', efficient3);
console.log('After produce:', result2);
console.log('✅ Seamless - works with both native and efficient\n');

// ===== unpura() - Convert to native array =====
console.log('3️⃣ unpura() - Convert to native array');
console.log('─'.repeat(50));

const efficientArr = pura([1, 2, 3]);
console.log('Efficient array:', efficientArr);

const backToNative = unpura(efficientArr);
console.log('After unpura():', backToNative);
console.log('Type:', Array.isArray(backToNative) ? 'Native Array' : 'Other');

// unpura() is idempotent - already native? Return as-is
const native3 = [10, 20, 30];
const stillNative = unpura(native3);
console.log('unpura(native) === native:', native3 === stillNative);
console.log('✅ Idempotent - no unnecessary conversion\n');

// ===== Complete workflow =====
console.log('4️⃣ Complete workflow - Mix freely');
console.log('─'.repeat(50));

// Start with native
let arr: number[] = [1, 2, 3];
console.log('Start (native):', arr);

// Convert to efficient for better performance
arr = pura(arr);
console.log('After pura():', arr);

// Direct mutation works
arr.push(4);
console.log('After push(4):', arr);

// produce() for immutable updates
const arr2 = produce(arr, draft => {
  draft.push(5);
  draft[0] = 100;
});
console.log('Original arr:', arr);
console.log('After produce:', arr2);

// Convert back to native if needed (e.g., for JSON serialization)
const nativeResult = unpura(arr2);
console.log('Back to native:', nativeResult);
console.log('JSON:', JSON.stringify(nativeResult));
console.log('✅ Seamless interoperability\n');

// ===== Real-world: React state management =====
console.log('5️⃣ Real-world: React state management');
console.log('─'.repeat(50));

interface Todo {
  id: number;
  text: string;
  done: boolean;
}

// State is stored as efficient array
let todos: Todo[] = pura([
  { id: 1, text: 'Learn Pura', done: false },
  { id: 2, text: 'Build app', done: false }
]);

console.log('Initial state:', todos);

// Update with produce (React setState pattern)
todos = produce(todos, draft => {
  draft.push({ id: 3, text: 'Ship it', done: false });
});
console.log('After adding todo:', todos);

// Toggle completion
todos = produce(todos, draft => {
  draft[0] = { ...draft[0]!, done: true };
});
console.log('After toggle:', todos);

// Send to API (convert to native for JSON)
const apiPayload = unpura(todos);
console.log('API payload:', JSON.stringify(apiPayload, null, 2));
console.log('✅ Perfect for state management\n');

// ===== Performance comparison =====
console.log('6️⃣ Performance - Large arrays');
console.log('─'.repeat(50));

const SIZE = 10000;
const largeNative = Array.from({ length: SIZE }, (_, i) => i);

console.time('Native array - update index 5000');
const copy1 = largeNative.slice();
copy1[5000] = 999;
console.timeEnd('Native array - update index 5000');

console.time('Efficient array - update index 5000');
const efficient4 = pura(largeNative);
const result3 = produce(efficient4, draft => {
  draft[5000] = 999;
});
console.timeEnd('Efficient array - update index 5000');

console.log('✅ O(n) vs O(log n) - efficient wins on large arrays\n');

// ===== Summary =====
console.log('=== Summary ===');
console.log('✅ pura() - Convert to efficient array (idempotent)');
console.log('✅ produce() - Immutable updates with structural sharing');
console.log('✅ unpura() - Convert to native array (idempotent)');
console.log('✅ All three accept both native and efficient arrays');
console.log('✅ Seamless interoperability - no mental overhead');
console.log('✅ Use the right tool for the job!');
