/**
 * Proxy 包裝的 IList - 讓持久化數據結構看起來像普通數組
 *
 * 目標：
 * - 外部：原生數組 API
 * - 內部：IList 的深度結構共享和 O(log n) 性能
 */

import { IList } from '../packages/core/src/list';

/**
 * 創建一個看起來像數組的 Proxy，內部使用 IList
 */
export function createListProxy<T>(list: IList<T>): T[] {
  const handler: ProxyHandler<IList<T>> = {
    get(target, prop, receiver) {
      // 數組索引訪問
      if (typeof prop === 'string' && !isNaN(Number(prop))) {
        const index = Number(prop);
        return target.get(index);
      }

      // 長度屬性
      if (prop === 'length') {
        return target.size;
      }

      // Symbol.iterator - 讓它可以用 for...of
      if (prop === Symbol.iterator) {
        return function* () {
          for (let i = 0; i < target.size; i++) {
            yield target.get(i);
          }
        };
      }

      // toString
      if (prop === 'toString') {
        return () => `[${Array.from(target).join(', ')}]`;
      }

      // Array 方法 - 返回新的 Proxy
      if (prop === 'push') {
        return (...items: T[]) => {
          let newList = target;
          for (const item of items) {
            newList = newList.push(item);
          }
          return createListProxy(newList);
        };
      }

      if (prop === 'pop') {
        return () => {
          const newList = target.pop();
          return createListProxy(newList);
        };
      }

      if (prop === 'concat') {
        return (...items: (T | T[])[]) => {
          let newList = target;
          for (const item of items) {
            if (Array.isArray(item)) {
              for (const x of item) {
                newList = newList.push(x);
              }
            } else {
              newList = newList.push(item);
            }
          }
          return createListProxy(newList);
        };
      }

      if (prop === 'slice') {
        return (start?: number, end?: number) => {
          return target.slice(start, end).toArray();
        };
      }

      // 高階函數 - 返回普通數組
      if (prop === 'map') {
        return <U>(fn: (item: T, index: number) => U) => {
          return target.map(fn).toArray();
        };
      }

      if (prop === 'filter') {
        return (fn: (item: T, index: number) => boolean) => {
          return target.filter(fn).toArray();
        };
      }

      if (prop === 'reduce') {
        return <U>(fn: (acc: U, item: T, index: number) => U, initial: U) => {
          let acc = initial;
          for (let i = 0; i < target.size; i++) {
            acc = fn(acc, target.get(i)!, i);
          }
          return acc;
        };
      }

      if (prop === 'find') {
        return (fn: (item: T, index: number) => boolean) => {
          for (let i = 0; i < target.size; i++) {
            const item = target.get(i)!;
            if (fn(item, i)) return item;
          }
          return undefined;
        };
      }

      if (prop === 'findIndex') {
        return (fn: (item: T, index: number) => boolean) => {
          for (let i = 0; i < target.size; i++) {
            if (fn(target.get(i)!, i)) return i;
          }
          return -1;
        };
      }

      if (prop === 'includes') {
        return (value: T) => {
          for (let i = 0; i < target.size; i++) {
            if (target.get(i) === value) return true;
          }
          return false;
        };
      }

      if (prop === 'indexOf') {
        return (value: T) => {
          for (let i = 0; i < target.size; i++) {
            if (target.get(i) === value) return i;
          }
          return -1;
        };
      }

      // forEach
      if (prop === 'forEach') {
        return (fn: (item: T, index: number) => void) => {
          for (let i = 0; i < target.size; i++) {
            fn(target.get(i)!, i);
          }
        };
      }

      // join
      if (prop === 'join') {
        return (separator = ',') => {
          return Array.from(target).join(separator);
        };
      }

      // toArray - 轉換為真正的數組
      if (prop === 'toArray') {
        return () => target.toArray();
      }

      // 獲取內部 IList（用於調試）
      if (prop === '__internal') {
        return target;
      }

      return undefined;
    },

    set(target, prop, value) {
      // 數組索引設置
      if (typeof prop === 'string' && !isNaN(Number(prop))) {
        const index = Number(prop);
        // 注意：這裡無法返回新的 Proxy，因為 set trap 必須返回 boolean
        // 這是一個限制！用戶需要用 proxy.set(index, value) 來獲取新 Proxy
        console.warn('Direct index assignment is not supported. Use .set(index, value) instead.');
        return false;
      }
      return false;
    },

    // 讓 Array.isArray() 返回 true
    getPrototypeOf() {
      return Array.prototype;
    },

    // 支持 Object.keys
    ownKeys(target) {
      const keys: (string | symbol)[] = [];
      for (let i = 0; i < target.size; i++) {
        keys.push(String(i));
      }
      keys.push('length');
      return keys;
    },

    // 支持 Object.getOwnPropertyDescriptor
    getOwnPropertyDescriptor(target, prop) {
      if (prop === 'length') {
        return {
          value: target.size,
          writable: false,
          enumerable: false,
          configurable: false,
        };
      }
      if (typeof prop === 'string' && !isNaN(Number(prop))) {
        const index = Number(prop);
        if (index >= 0 && index < target.size) {
          return {
            value: target.get(index),
            writable: false,
            enumerable: true,
            configurable: true,
          };
        }
      }
      return undefined;
    },
  };

  return new Proxy(list, handler) as any;
}

/**
 * 從普通數組創建 Proxy-wrapped IList
 */
export function fromArray<T>(items: T[]): T[] {
  const list = IList.from(items);
  return createListProxy(list);
}

// ===== 演示用法 =====
console.log('=== 創建 Proxy 包裝的 IList ===');
const arr1 = fromArray([1, 2, 3, 4, 5]);

console.log('\n=== 基本操作 ===');
console.log('arr1[0]:', arr1[0]);                    // 1
console.log('arr1.length:', arr1.length);            // 5
console.log('Array.isArray(arr1):', Array.isArray(arr1));  // true!

console.log('\n=== 迭代 ===');
console.log('for...of:');
for (const item of arr1) {
  console.log(`  ${item}`);
}

console.log('\n=== Push (返回新 Proxy) ===');
const arr2 = (arr1 as any).push(6, 7, 8);
console.log('arr1.length:', arr1.length);            // 5 (未變)
console.log('arr2.length:', arr2.length);            // 8 (新版本)
console.log('arr2[7]:', arr2[7]);                    // 8

console.log('\n=== 結構共享驗證 ===');
const internal1 = (arr1 as any).__internal as IList<number>;
const internal2 = (arr2 as any).__internal as IList<number>;
console.log('arr1 內部:', internal1.toString());
console.log('arr2 內部:', internal2.toString());
console.log('注意：arr2 的前 5 個元素與 arr1 共享底層結構！');

console.log('\n=== 高階函數 ===');
const doubled = arr2.map((x: number) => x * 2);
console.log('map(x => x * 2):', doubled);           // [2,4,6,8,10,12,14,16]

const evens = arr2.filter((x: number) => x % 2 === 0);
console.log('filter(x => x % 2 === 0):', evens);   // [2,4,6,8]

const sum = arr2.reduce((acc: number, x: number) => acc + x, 0);
console.log('reduce(sum):', sum);                   // 36

console.log('\n=== Concat ===');
const arr3 = (arr2 as any).concat([9, 10]);
console.log('arr3.length:', arr3.length);           // 10
console.log('arr3[9]:', arr3[9]);                   // 10

console.log('\n=== 性能測試準備 ===');
console.log('大數組操作:');
const bigArr = fromArray(Array.from({ length: 10000 }, (_, i) => i));
console.log('初始大小:', bigArr.length);

console.time('Push 1000 items (O(log n) each)');
let result = bigArr;
for (let i = 0; i < 1000; i++) {
  result = (result as any).push(10000 + i);
}
console.timeEnd('Push 1000 items (O(log n) each)');
console.log('最終大小:', result.length);

console.log('\n=== 完成！===');
console.log('Proxy 成功包裝了 IList，提供原生數組 API！');
console.log('內部使用持久化數據結構，實現深度結構共享。');
