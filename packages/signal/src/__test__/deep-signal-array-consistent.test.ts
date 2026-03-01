import { $ } from '#/index';

describe('Proxy Array Methods', () => {
  let originalArray: number[];
  let proxyArray: number[];

  beforeEach(() => {
    originalArray = [1, 2, 3];
    // 假设$是创建代理数组的方法，这里用Proxy包装模拟
    proxyArray = $([...originalArray]);
  });

  describe('filter method', () => {
    it('should handle filter method consistently', () => {
      const originalResult = originalArray.filter(x => x > 1);
      const proxyResult = proxyArray.filter(x => x > 1);

      expect(originalResult).toEqual(proxyResult);
    });
  });

  describe('slice method', () => {
    it('should handle slice method consistently', () => {
      const originalResult = originalArray.slice(1, 2);
      const proxyResult = proxyArray.slice(1, 2);

      expect(originalResult).toEqual(proxyResult);
    });

    it('slice should handle method with undefined argument correctly', () => {
      const originalResult = originalArray.slice(undefined as any);
      const proxyResult = proxyArray.slice(undefined as any);

      expect(originalResult).toEqual(proxyResult);
    });
  });

  describe('toReversed method', () => {
    it('should handle toReversed method consistently', () => {
      const originalResult = originalArray.toReversed();
      const proxyResult = proxyArray.toReversed();

      expect(originalResult).toEqual(proxyResult);
      expect(originalArray).toEqual([1, 2, 3]); // Ensure original is unchanged
      expect([...proxyArray]).toEqual([1, 2, 3]); // Ensure proxy is unchanged
    });

    it('toReversed should handle empty array correctly', () => {
      const emptyOriginal: number[] = [];
      const emptyProxy = $([...emptyOriginal]);

      const originalResult = emptyOriginal.toReversed();
      const proxyResult = emptyProxy.toReversed();

      expect(originalResult).toEqual([]);
      expect(proxyResult).toEqual([]);
      expect(emptyOriginal).toEqual([]); // Ensure original is unchanged
      expect([...emptyProxy]).toEqual([]); // Ensure proxy is unchanged
    });

    it('toReversed should handle single element array correctly', () => {
      const singleOriginal = [42];
      const singleProxy = $([42]);

      const originalResult = singleOriginal.toReversed();
      const proxyResult = singleProxy.toReversed();

      expect(originalResult).toEqual([42]);
      expect(proxyResult).toEqual([42]);
      expect(singleOriginal).toEqual([42]); // Ensure original is unchanged
      expect([...singleProxy]).toEqual([42]); // Ensure proxy is unchanged
    });
  });

  describe('toSpliced method', () => {
    it('should handle toSpliced method consistently', () => {
      const originalResult = originalArray.toSpliced(1, 1, 99);
      const proxyResult = proxyArray.toSpliced(1, 1, 88);

      expect(originalResult).toEqual([1, 99, 3]); // Original with index 1 removed
      expect(proxyResult).toEqual([1, 88, 3]); // Proxy with replacement value
      expect(originalArray).toEqual([1, 2, 3]); // Ensure original is unchanged
      expect([...proxyArray]).toEqual([1, 2, 3]); // Ensure proxy is unchanged
    });

    it('toSpliced should handle start parameter beyond array length', () => {
      const originalResult = originalArray.toSpliced(10, 1, 99);
      const proxyResult = proxyArray.toSpliced(10, 1, 88);

      expect(originalResult).toEqual([1, 2, 3, 99]); // No change since start is out of bounds
      expect(proxyResult).toEqual([1, 2, 3, 88]); // No deletion but insertion at end
      expect(originalArray).toEqual([1, 2, 3]); // Ensure original is unchanged
      expect([...proxyArray]).toEqual([1, 2, 3]); // Ensure proxy is unchanged
    });

    it('toSpliced should handle negative start parameter', () => {
      const originalResult = originalArray.toSpliced(-1, 1, 77);
      const proxyResult = proxyArray.toSpliced(-1, 1, 88);

      expect(originalResult).toEqual([1, 2, 77]); // Replace last element with 77
      expect(proxyResult).toEqual([1, 2, 88]); // Replace last element with 88
      expect(originalArray).toEqual([1, 2, 3]); // Ensure original is unchanged
      expect([...proxyArray]).toEqual([1, 2, 3]); // Ensure proxy is unchanged
    });

    it('toSpliced should handle deleteCount of 0', () => {
      const originalResult = originalArray.toSpliced(1, 0, 55);
      const proxyResult = proxyArray.toSpliced(1, 0, 66);

      expect(originalResult).toEqual([1, 55, 2, 3]); // Insert without deleting
      expect(proxyResult).toEqual([1, 66, 2, 3]); // Insert without deleting
      expect(originalArray).toEqual([1, 2, 3]); // Ensure original is unchanged
      expect([...proxyArray]).toEqual([1, 2, 3]); // Ensure proxy is unchanged
    });
  });

  describe('with method', () => {
    it('should handle with method consistently', () => {
      const originalResult = originalArray.with(1, 99);
      const proxyResult = proxyArray.with(1, 88);

      expect(originalResult).toEqual([1, 99, 3]); // Original with index 1 changed to 99
      expect(proxyResult).toEqual([1, 88, 3]); // Proxy with index 1 changed to 88
      expect(originalArray).toEqual([1, 2, 3]); // Ensure original is unchanged
      expect([...proxyArray]).toEqual([1, 2, 3]); // Ensure proxy is unchanged
    });

    it('with should handle negative index correctly', () => {
      const originalResult = originalArray.with(-1, 99);
      const proxyResult = proxyArray.with(-1, 88);

      expect(originalResult).toEqual([1, 2, 99]); // Change last element to 99
      expect(proxyResult).toEqual([1, 2, 88]); // Change last element to 88
      expect(originalArray).toEqual([1, 2, 3]); // Ensure original is unchanged
      expect([...proxyArray]).toEqual([1, 2, 3]); // Ensure proxy is unchanged
    });

    it('with should handle index beyond array length', () => {
      expect(() => originalArray.with(10, 99)).toThrow(); // Should throw error
      expect(() => proxyArray.with(10, 88)).toThrow(); // Should throw error
      expect(originalArray).toEqual([1, 2, 3]); // Ensure original is unchanged
      expect([...proxyArray]).toEqual([1, 2, 3]); // Ensure proxy is unchanged
    });
  });

  describe('concat method', () => {
    it('should handle concat method consistently', () => {
      const originalResult = originalArray.concat([4, 5]);
      const proxyResult = proxyArray.concat([4, 5]);

      expect(originalResult).toEqual(proxyResult);
      expect(originalArray).toEqual([1, 2, 3]); // Ensure original is unchanged
    });
  });

  describe('push method', () => {
    it('should handle push method consistently', () => {
      const originalResult = originalArray.push(4);
      const proxyResult = proxyArray.push(4);

      expect(proxyResult).toBe(originalResult);
      expect(proxyArray.length).toBe(originalArray.length);
      expect(proxyArray[proxyArray.length - 1]).toBe(originalArray[originalArray.length - 1]);
    });
  });

  describe('pop method', () => {
    it('should handle pop method consistently', () => {
      const originalResult = originalArray.pop();
      const proxyResult = proxyArray.pop();

      expect(proxyResult).toBe(originalResult);
      expect(proxyArray.length).toBe(originalArray.length);
    });
  });

  describe('shift method', () => {
    it('should handle shift method consistently', () => {
      const originalResult = originalArray.shift();
      const proxyResult = proxyArray.shift();

      expect(proxyResult).toBe(originalResult);
      expect(proxyArray.length).toBe(originalArray.length);
    });
  });

  describe('unshift method', () => {
    it('should handle unshift method consistently', () => {
      const originalResult = originalArray.unshift(6);
      const proxyResult = proxyArray.unshift(6);

      expect(proxyResult).toBe(originalResult);
      expect(proxyArray[0]).toBe(originalArray[0]);
      expect(proxyArray.length).toBe(originalArray.length);
    });
  });

  describe('splice method', () => {
    it('should handle splice method consistently', () => {
      const originalResult = originalArray.splice(1, 1, 99);
      const proxyResult = proxyArray.splice(1, 1, 88);

      expect(originalResult).toEqual(proxyResult);
      expect(proxyArray.length).toBe(originalArray.length);
    });
  });

  describe('reverse method', () => {
    it('should handle reverse method consistently', () => {
      originalArray.reverse();
      proxyArray.reverse();
      // proxyArray 多一个 iterator key，通过解构获取纯粹数组
      expect([...proxyArray]).toEqual(originalArray);
    });
  });

  describe('sort method', () => {
    it('should handle sort method consistently', () => {
      originalArray.sort((a, b) => a - b);
      proxyArray.sort((a, b) => a - b);

      expect([...proxyArray]).toEqual(originalArray);
    });
  });

  describe('fill method', () => {
    it('should handle fill method consistently', () => {
      originalArray.fill(0);
      proxyArray.fill(0);

      expect([...proxyArray]).toEqual(originalArray);
    });
  });

  describe('join method', () => {
    it('should handle join method consistently', () => {
      const originalResult = originalArray.join('-');
      const proxyResult = proxyArray.join('-');

      expect(originalResult).toBe(proxyResult);
    });
  });

  describe('toString method', () => {
    it('should handle toString method consistently', () => {
      const originalResult = originalArray.toString();
      const proxyResult = proxyArray.toString();

      expect(originalResult).toBe(proxyResult);
    });

    it('toString should handle method with no arguments correctly', () => {
      const originalResult = originalArray.toString();
      const proxyResult = proxyArray.toString();

      expect(originalResult).toBe(proxyResult);
    });
  });

  describe('indexOf method', () => {
    it('should handle indexOf method consistently', () => {
      const originalResult = originalArray.indexOf(2);
      const proxyResult = proxyArray.indexOf(2);

      expect(originalResult).toBe(proxyResult);
    });

    it('indexOf should handle method with null argument correctly', () => {
      const originalResult = originalArray.indexOf(null as any);
      const proxyResult = proxyArray.indexOf(null as any);

      expect(originalResult).toBe(proxyResult);
    });
  });

  describe('lastIndexOf method', () => {
    it('should handle lastIndexOf method consistently', () => {
      const originalResult = originalArray.lastIndexOf(2);
      const proxyResult = proxyArray.lastIndexOf(2);

      expect(originalResult).toBe(proxyResult);
    });
  });

  describe('includes method', () => {
    it('should handle includes method consistently', () => {
      const originalResult = originalArray.includes(2);
      const proxyResult = proxyArray.includes(2);

      expect(originalResult).toBe(proxyResult);
    });
  });

  describe('forEach method', () => {
    it('should handle forEach method consistently', () => {
      const originalResults: number[] = [];
      const proxyResults: number[] = [];

      originalArray.forEach(item => originalResults.push(item * 2));
      proxyArray.forEach(item => proxyResults.push(item * 2));

      expect(originalResults).toEqual(proxyResults);
    });
  });

  describe('map method', () => {
    it('should handle map method consistently', () => {
      const originalResult = originalArray.map(x => x * 2);
      const proxyResult = proxyArray.map(x => x * 2);

      expect(originalResult).toEqual(proxyResult);
    });
  });

  describe('reduce method', () => {
    it('should handle reduce method consistently', () => {
      const originalResult = originalArray.reduce((acc, curr) => acc + curr, 0);
      const proxyResult = proxyArray.reduce((acc, curr) => acc + curr, 0);

      expect(originalResult).toBe(proxyResult);
    });
  });

  describe('some method', () => {
    it('should handle some method consistently', () => {
      const originalResult = originalArray.some(x => x > 2);
      const proxyResult = proxyArray.some(x => x > 2);

      expect(originalResult).toBe(proxyResult);
    });
  });

  describe('every method', () => {
    it('should handle every method consistently', () => {
      const originalResult = originalArray.every(x => x > 0);
      const proxyResult = proxyArray.every(x => x > 0);

      expect(originalResult).toBe(proxyResult);
    });
  });

  describe('find method', () => {
    it('should handle find method consistently', () => {
      const originalResult = originalArray.find(x => x > 1);
      const proxyResult = proxyArray.find(x => x > 1);

      expect(originalResult).toBe(proxyResult);
    });
  });

  describe('findIndex method', () => {
    it('should handle findIndex method consistently', () => {
      const originalResult = originalArray.findIndex(x => x > 1);
      const proxyResult = proxyArray.findIndex(x => x > 1);

      expect(originalResult).toBe(proxyResult);
    });
  });

  describe('toSorted method', () => {
    it('should handle toSorted method consistently', () => {
      const originalResult = originalArray.toSorted((a, b) => a - b);
      const proxyResult = proxyArray.toSorted((a, b) => a - b);

      expect(originalResult).toEqual(proxyResult);
      expect(originalArray).toEqual([1, 2, 3]); // Ensure original is unchanged
      expect([...proxyArray]).toEqual([1, 2, 3]); // Ensure proxy is unchanged
    });

    it('toSorted should handle empty array correctly', () => {
      const emptyOriginal: number[] = [];
      const emptyProxy = $([...emptyOriginal]);

      const originalResult = emptyOriginal.toSorted((a, b) => a - b);
      const proxyResult = emptyProxy.toSorted((a, b) => a - b);

      expect(originalResult).toEqual([]);
      expect(proxyResult).toEqual([]);
      expect(emptyOriginal).toEqual([]); // Ensure original is unchanged
      expect([...emptyProxy]).toEqual([]); // Ensure proxy is unchanged
    });

    it('toSorted should handle single element array correctly', () => {
      const singleOriginal = [42];
      const singleProxy = $([42]);

      const originalResult = singleOriginal.toSorted((a, b) => a - b);
      const proxyResult = singleProxy.toSorted((a, b) => a - b);

      expect(originalResult).toEqual([42]);
      expect(proxyResult).toEqual([42]);
      expect(singleOriginal).toEqual([42]); // Ensure original is unchanged
      expect([...singleProxy]).toEqual([42]); // Ensure proxy is unchanged
    });

    it('toSorted should handle already sorted array', () => {
      const sortedOriginal = [1, 2, 3, 4, 5];
      const sortedProxy = $([1, 2, 3, 4, 5]);

      const originalResult = sortedOriginal.toSorted((a, b) => a - b);
      const proxyResult = sortedProxy.toSorted((a, b) => a - b);

      expect(originalResult).toEqual([1, 2, 3, 4, 5]);
      expect(proxyResult).toEqual([1, 2, 3, 4, 5]);
      expect(sortedOriginal).toEqual([1, 2, 3, 4, 5]); // Ensure original is unchanged
      expect([...sortedProxy]).toEqual([1, 2, 3, 4, 5]); // Ensure proxy is unchanged
    });

    it('toSorted should handle reverse sorted array', () => {
      const reverseSortedOriginal = [5, 4, 3, 2, 1];
      const reverseSortedProxy = $([5, 4, 3, 2, 1]);

      const originalResult = reverseSortedOriginal.toSorted((a, b) => a - b);
      const proxyResult = reverseSortedProxy.toSorted((a, b) => a - b);

      expect(originalResult).toEqual([1, 2, 3, 4, 5]);
      expect(proxyResult).toEqual([1, 2, 3, 4, 5]);
      expect(reverseSortedOriginal).toEqual([5, 4, 3, 2, 1]); // Ensure original is unchanged
      expect([...reverseSortedProxy]).toEqual([5, 4, 3, 2, 1]); // Ensure proxy is unchanged
    });
  });

  describe('edge cases', () => {
    it('should handle empty array correctly', () => {
      const emptyOriginal: any[] = [];
      const emptyProxy = new Proxy([], {
        get(target, prop) {
          if (typeof target[prop as keyof typeof target] === 'function') {
            return (...args: any[]) => {
              return (target[prop as keyof typeof target] as Function).apply(target, args);
            };
          }
          return target[prop as keyof typeof target];
        }
      });

      expect(emptyProxy.length).toBe(0);
      expect(emptyProxy.push(1)).toBe(1);
      expect(emptyProxy.length).toBe(1);
    });

    it('should handle single element array correctly', () => {
      const singleOriginal = [42];
      const singleProxy = new Proxy([42], {
        get(target, prop) {
          if (typeof target[prop as keyof typeof target] === 'function') {
            return (...args: any[]) => {
              return (target[prop as keyof typeof target] as Function).apply(target, args);
            };
          }
          return target[prop as keyof typeof target];
        }
      });

      const originalPop = singleOriginal.pop();
      const proxyPop = singleProxy.pop();

      expect(originalPop).toBe(proxyPop);
      expect(singleOriginal.length).toBe(singleProxy.length);
    });

    it('should handle large array correctly', () => {
      const largeOriginal = Array.from({ length: 10000 }, (_, i) => i);
      const largeProxy = new Proxy(
        Array.from({ length: 10000 }, (_, i) => i),
        {
          get(target, prop) {
            if (typeof target[prop as keyof typeof target] === 'function') {
              return (...args: any[]) => {
                return (target[prop as keyof typeof target] as Function).apply(target, args);
              };
            }
            return target[prop as keyof typeof target];
          }
        }
      );

      const originalResult = largeOriginal.filter(x => x % 2 === 0);
      const proxyResult = largeProxy.filter(x => x % 2 === 0);

      expect(originalResult.length).toBe(proxyResult.length);
      expect(originalResult[0]).toBe(proxyResult[0]);
      expect(originalResult[originalResult.length - 1]).toBe(proxyResult[proxyResult.length - 1]);
    });
  });

  describe('at method', () => {
    it('should handle at method consistently', () => {
      const originalResult = originalArray.at(1);
      const proxyResult = proxyArray.at(1);

      expect(originalResult).toBe(proxyResult);
    });

    it('at should handle negative index correctly', () => {
      const originalResult = originalArray.at(-1);
      const proxyResult = proxyArray.at(-1);

      expect(originalResult).toBe(proxyResult);
    });
  });

  describe('copyWithin method', () => {
    it('should handle copyWithin method consistently', () => {
      const originalResult = originalArray.copyWithin(0, 1, 2);
      const proxyResult = proxyArray.copyWithin(0, 1, 2);

      expect(proxyResult).toBe(proxyArray);
      expect([...proxyArray]).toEqual(originalArray); // Ensure proxy is unchanged after copyWithin
    });

    it('copyWithin should handle negative indices correctly', () => {
      const originalResult = originalArray.copyWithin(-2, 0);
      const proxyResult = proxyArray.copyWithin(-2, 0);

      expect(proxyResult).toBe(proxyArray);
      expect([...proxyArray]).toEqual(originalArray); // Ensure proxy is unchanged after copyWithin
    });
  });

  describe('entries method', () => {
    it('should handle entries method consistently', () => {
      const originalEntries = Array.from(originalArray.entries());
      const proxyEntries = Array.from(proxyArray.entries());

      expect(originalEntries).toEqual(proxyEntries);
    });
  });

  describe('findLast method', () => {
    it('should handle findLast method consistently', () => {
      const originalResult = originalArray.findLast(x => x > 1);
      const proxyResult = proxyArray.findLast(x => x > 1);

      expect(originalResult).toBe(proxyResult);
    });

    it('findLast should return undefined when no element matches', () => {
      const originalResult = originalArray.findLast(x => x > 10);
      const proxyResult = proxyArray.findLast(x => x > 10);

      expect(originalResult).toBe(proxyResult);
    });
  });

  describe('findLastIndex method', () => {
    it('should handle findLastIndex method consistently', () => {
      const originalResult = originalArray.findLastIndex(x => x > 1);
      const proxyResult = proxyArray.findLastIndex(x => x > 1);

      expect(originalResult).toBe(proxyResult);
    });

    it('findLastIndex should return -1 when no element matches', () => {
      const originalResult = originalArray.findLastIndex(x => x > 10);
      const proxyResult = proxyArray.findLastIndex(x => x > 10);

      expect(originalResult).toBe(proxyResult);
    });
  });

  describe('flat method', () => {
    let originalNestedArray: any[];
    let proxyNestedArray: any;

    beforeEach(() => {
      originalNestedArray = [1, [2, [3, 4]]];
      proxyNestedArray = $([...originalNestedArray]);
    });

    it('should handle flat method consistently', () => {
      const originalResult = originalNestedArray.flat();
      const proxyResult = proxyNestedArray.flat();

      expect(originalResult).toEqual(proxyResult);
    });

    it('flat should handle depth parameter correctly', () => {
      const originalResult = originalNestedArray.flat(2);
      const proxyResult = proxyNestedArray.flat(2);

      expect(originalResult).toEqual(proxyResult);
    });
  });

  describe('flatMap method', () => {
    it('should handle flatMap method consistently', () => {
      const originalResult = originalArray.flatMap(x => [x, x * 2]);
      const proxyResult = proxyArray.flatMap(x => [x, x * 2]);

      expect(originalResult).toEqual(proxyResult);
    });

    it('flatMap should work like map followed by flat', () => {
      const originalMapped = originalArray.map(x => [x, x * 2]).flat();
      const proxyMapped = proxyArray.map(x => [x, x * 2]).flat();

      expect(originalMapped).toEqual(proxyMapped);
    });
  });

  describe('keys method', () => {
    it('should handle keys method consistently', () => {
      const originalKeys = Array.from(originalArray.keys());
      const proxyKeys = Array.from(proxyArray.keys());

      expect(originalKeys).toEqual(proxyKeys);
    });
  });

  describe('reduceRight method', () => {
    it('should handle reduceRight method consistently', () => {
      const originalResult = originalArray.reduceRight((acc, curr) => acc + curr, 0);
      const proxyResult = proxyArray.reduceRight((acc, curr) => acc + curr, 0);

      expect(originalResult).toBe(proxyResult);
    });

    it('reduceRight should handle different accumulator types', () => {
      const originalResult = originalArray.reduceRight((acc, curr) => acc + curr.toString(), '');
      const proxyResult = proxyArray.reduceRight((acc, curr) => acc + curr.toString(), '');

      expect(originalResult).toBe(proxyResult);
    });
  });

  describe('toLocaleString method', () => {
    it('should handle toLocaleString method consistently', () => {
      const originalResult = originalArray.toLocaleString();
      const proxyResult = proxyArray.toLocaleString();

      expect(originalResult).toBe(proxyResult);
    });

    it('toLocaleString should handle locale options', () => {
      const originalResult = originalArray.toLocaleString('en-US', { maximumFractionDigits: 2 });
      const proxyResult = proxyArray.toLocaleString('en-US', { maximumFractionDigits: 2 });

      expect(originalResult).toBe(proxyResult);
    });
  });

  describe('values method', () => {
    it('should handle values method consistently', () => {
      const originalValues = Array.from(originalArray.values());
      const proxyValues = Array.from(proxyArray.values());

      expect(originalValues).toEqual(proxyValues);
    });
  });

  describe('Symbol.iterator method', () => {
    it('should handle Symbol.iterator method consistently', () => {
      const originalIterator = originalArray[Symbol.iterator]();
      const proxyIterator = proxyArray[Symbol.iterator]();

      const originalResults: any[] = [];
      let originalNext = originalIterator.next();
      while (!originalNext.done) {
        originalResults.push(originalNext.value);
        originalNext = originalIterator.next();
      }

      const proxyResults: any[] = [];
      let proxyNext = proxyIterator.next();
      while (!proxyNext.done) {
        proxyResults.push(proxyNext.value);
        proxyNext = proxyIterator.next();
      }

      expect(originalResults).toEqual(proxyResults);
    });

    it('Symbol.iterator should allow for...of loops consistently', () => {
      const originalResults: number[] = [];
      for (const item of originalArray) {
        originalResults.push(item);
      }

      const proxyResults: number[] = [];
      for (const item of proxyArray) {
        proxyResults.push(item);
      }

      expect(originalResults).toEqual(proxyResults);
    });
  });
});
