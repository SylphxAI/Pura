/**
 * Test: Mutation behavior with produce() and direct mutations
 */

import { pura, produce } from './packages/core/src/index';

console.log('=== Testing Mutation Behavior ===\n');

const eff_arr1 = pura([1, 2]);
console.log('eff_arr1 created:', eff_arr1);

const eff_arr2 = produce(eff_arr1, (d) => d.push(3));
console.log('eff_arr2 after produce(push 3):', eff_arr2);

const eff_arr3 = produce(eff_arr2, (d) => d.push(4));
console.log('eff_arr3 after produce(push 4):', eff_arr3);

console.log('\nBefore eff_arr2.push(5):');
console.log('eff_arr1:', eff_arr1);
console.log('eff_arr2:', eff_arr2);
console.log('eff_arr3:', eff_arr3);

eff_arr2.push(5);
console.log('\nAfter eff_arr2.push(5):');
console.log('eff_arr1:', eff_arr1, '← Expected: [1, 2]');
console.log('eff_arr2:', eff_arr2, '← Expected: [1, 2, 3, 5]');
console.log('eff_arr3:', eff_arr3, '← Expected: [1, 2, 3, 4]');

// Verify expectations
const pass1 = eff_arr1.length === 2 && eff_arr1[0] === 1 && eff_arr1[1] === 2;
const pass2 = eff_arr2.length === 4 && eff_arr2[0] === 1 && eff_arr2[1] === 2 && eff_arr2[2] === 3 && eff_arr2[3] === 5;
const pass3 = eff_arr3.length === 4 && eff_arr3[0] === 1 && eff_arr3[1] === 2 && eff_arr3[2] === 3 && eff_arr3[3] === 4;

console.log('\n=== Results ===');
console.log(`eff_arr1 [1, 2]: ${pass1 ? '✅ PASS' : '❌ FAIL'}`);
console.log(`eff_arr2 [1, 2, 3, 5]: ${pass2 ? '✅ PASS' : '❌ FAIL'}`);
console.log(`eff_arr3 [1, 2, 3, 4]: ${pass3 ? '✅ PASS' : '❌ FAIL'}`);

if (pass1 && pass2 && pass3) {
  console.log('\n🎉 All tests PASSED - Structural sharing working correctly!');
} else {
  console.log('\n❌ Tests FAILED - Arrays are sharing state incorrectly');
}
