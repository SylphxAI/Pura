/**
 * Dual-Mode Demo: Mutable vs Immutable
 *
 * Shows both modes:
 * 1. Mutable: direct mutations with pura()
 * 2. Immutable: structural sharing with produce()
 */

import { pura, produce } from '../packages/core/src/index';

console.log('=== Pura: Dual-Mode Demo ===\n');

// ===== Mode A: Mutable (Direct Mutation) =====
console.log('🔧 Mode A: Mutable (Direct Mutation)');
console.log('─'.repeat(50));

const arr: number[] = pura([1, 2, 3]);
console.log('Created:', arr);

// Direct mutation - changes the same array
arr.push(4);
console.log('After arr.push(4):', arr);

arr[0] = 100;
console.log('After arr[0] = 100:', arr);

const popped = arr.pop();
console.log('After arr.pop():', arr, 'popped:', popped);

console.log('\n✅ Same array, different snapshot');
console.log('✅ Still using efficient tree structure internally\n');

// ===== Mode B: Immutable (Structural Sharing) =====
console.log('🔒 Mode B: Immutable (Structural Sharing)');
console.log('─'.repeat(50));

const a: number[] = pura([1, 2, 3]);
console.log('Original a:', a);

// produce() creates new array with structural sharing
const b = produce(a, draft => {
  draft.push(4);
  draft[0] = 100;
});

console.log('After produce:');
console.log('  a:', a, '(unchanged)');
console.log('  b:', b, '(new array)');
console.log('  a === b:', a === b);

console.log('\n✅ Structural sharing between a and b');
console.log('✅ a unchanged, b is new array\n');

// ===== Comparison =====
console.log('📊 Key Differences');
console.log('─'.repeat(50));

console.log('\nMutable Mode (pura):');
console.log('  • const arr = pura([1,2,3])');
console.log('  • arr.push(4) // direct mutation');
console.log('  • Same array, updated snapshot');
console.log('  • Efficient tree structure');

console.log('\nImmutable Mode (produce):');
console.log('  • const b = produce(a, draft => draft.push(4))');
console.log('  • Original unchanged, returns new array');
console.log('  • Structural sharing (efficient)');
console.log('  • Perfect for React/Vue\n');

// ===== Returned arrays are also mutable =====
console.log('🔄 Returned arrays from produce() are also mutable');
console.log('─'.repeat(50));

const c = produce([1, 2, 3], draft => {
  draft.push(4);
});
console.log('After produce:', c);

// The returned array is also mutable
c.push(5);
c[0] = 999;
console.log('After direct mutation:', c);

console.log('\n✅ All pura arrays are mutable\n');

// ===== Real-world: React useState =====
console.log('⚛️  Real-world: React useState');
console.log('─'.repeat(50));

interface Todo {
  id: number;
  text: string;
  done: boolean;
}

// Mutable mode - for local work
const localTodos = pura<Todo>([
  { id: 1, text: 'Learn Pura', done: false }
]);

localTodos.push({ id: 2, text: 'Build app', done: false });
console.log('Local todos (mutable):', localTodos);

// Immutable mode - for React state
let stateTodos: Todo[] = pura<Todo>([
  { id: 1, text: 'Learn Pura', done: false },
  { id: 2, text: 'Build app', done: false }
]);

// React state update pattern
stateTodos = produce(stateTodos, draft => {
  draft[0] = { ...draft[0]!, done: true };
});

console.log('State todos (immutable):', stateTodos);
console.log('\n✅ Use mutable for local work, immutable for state\n');

console.log('=== Summary ===');
console.log('✅ Two modes: pura() (mutable) + produce() (immutable)');
console.log('✅ Both use efficient tree structure');
console.log('✅ Type is always T[]');
console.log('✅ Choose the right tool for the job!');
