/**
 * Simple usage - Dual Mode: pura() + produce()
 */

import { pura, produce } from '../packages/core/src/index';

console.log('=== Pura: Dual-Mode Arrays ===\n');

// ===== Start with pura array =====
console.log('1️⃣ Create efficient array with pura()');
let arr = pura([1, 2, 3]);
console.log('Pura array:', arr);
console.log('Type:', typeof arr, Array.isArray(arr));

// ===== Use produce to update =====
console.log('\n2️⃣ Use produce to update');
arr = produce(arr, draft => {
  draft.push(4);
  draft.push(5);
  draft[0] = 100;
});

console.log('After produce:', arr);
console.log('Type:', typeof arr, Array.isArray(arr));
console.log('✅ Returns efficient array (tree-based)');

// ===== Continue using produce =====
console.log('\n3️⃣ Continue using produce');
const arr2 = produce(arr, draft => {
  draft.push(6);
  draft[1] = 200;
});

console.log('arr:', [...arr]);
console.log('arr2:', [...arr2]);
console.log('arr === arr2:', arr === arr2);
console.log('✅ Immutable - arr unchanged');

// ===== Reference identity =====
console.log('\n4️⃣ Reference identity optimization');
const arr3 = produce(arr, draft => {
  // No changes
});

console.log('arr === arr3:', arr === arr3);
console.log('✅ Same instance when no changes');

// ===== All draft mutations supported =====
console.log('\n5️⃣ All draft mutations supported');
const arr4 = produce([1, 2, 3, 4, 5], draft => {
  draft.push(6, 7, 8);  // push
  draft.pop();          // pop
  draft[0] = 999;       // index assignment
});

console.log('Result:', arr4);
console.log('✅ All mutations work in draft');

// ===== Array methods work =====
console.log('\n6️⃣ Array methods work');
const mapped = arr.map(x => x * 2);
const filtered = arr.filter(x => x > 100);
const sum = arr.reduce((a, b) => a + b, 0);

console.log('map:', mapped);
console.log('filter:', filtered);
console.log('reduce:', sum);
console.log('✅ All array methods work');

// ===== Real-world: React useState =====
console.log('\n7️⃣ Real-world: React useState');

interface Todo {
  id: number;
  text: string;
  completed: boolean;
}

// Simulated useState
let todos: Todo[] = [
  { id: 1, text: 'Learn Pura', completed: false },
  { id: 2, text: 'Build app', completed: false }
];

console.log('Initial:', todos);

// Add todo
todos = produce(todos, draft => {
  draft.push({ id: 3, text: 'Ship it', completed: false });
});

console.log('After add:', todos);

// Toggle completion
todos = produce(todos, draft => {
  draft[0] = { ...draft[0]!, completed: true };
});

console.log('After toggle:', todos);
console.log('✅ Perfect for React/Vue state');

// ===== Performance =====
console.log('\n8️⃣ Performance benefits');
const large = Array.from({ length: 10000 }, (_, i) => i);

const result = produce(large, draft => {
  draft.push(10000);
  draft[5000] = 999;
});

console.log('large[5000]:', large[5000]);
console.log('result[5000]:', result[5000]);
console.log('result.length:', result.length);
console.log('✅ O(log n) updates, structural sharing');

// ===== Summary =====
console.log('\n=== Summary ===');
console.log('✅ Dual Mode: pura() + produce()');
console.log('✅ pura() - creates mutable efficient array');
console.log('✅ produce() - immutable updates with structural sharing');
console.log('✅ Type is always T[]');
console.log('✅ O(log n) updates with tree structure');
console.log('✅ Reference identity optimization');
console.log('✅ Perfect for React/Vue');
console.log('✅ Choose the right tool for the job!');
