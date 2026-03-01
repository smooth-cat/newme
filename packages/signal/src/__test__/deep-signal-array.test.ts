import { $, effect } from '#/index';

describe('Array methods effect tests', () => {
  let arr: any[];
  let effectSpy: jest.Mock;

  beforeEach(() => {
    // 初始化数组数据
    arr = $([1, 2, 3, 'test']);
    effectSpy = jest.fn();
  });

  describe('Set - 修改数组并触发 iterator 更新', () => {
    it('pop should trigger effect when array changes', () => {
      effect(() => {
        effectSpy(arr.length);
      });
      
      expect(effectSpy).toHaveBeenCalledTimes(1);
      arr.pop();
      expect(effectSpy).toHaveBeenCalledTimes(2);
      expect([...arr]).toEqual([1, 2, 3]);
    });

    it('push should trigger effect when array changes', () => {
      effect(() => {
        effectSpy(arr.length);
      });
      
      expect(effectSpy).toHaveBeenCalledTimes(1);
      arr.push(4);
      expect(effectSpy).toHaveBeenCalledTimes(2);
      expect([...arr]).toEqual([1, 2, 3, 'test', 4]);
    });

    it('shift should trigger effect when array changes', () => {
      effect(() => {
        effectSpy(arr.length);
      });
      
      expect(effectSpy).toHaveBeenCalledTimes(1);
      arr.shift();
      expect(effectSpy).toHaveBeenCalledTimes(2);
      expect([...arr]).toEqual([2, 3, 'test']);
    });

    it('splice should trigger effect when array changes', () => {
      effect(() => {
        effectSpy(arr.length);
      });
      
      expect(effectSpy).toHaveBeenCalledTimes(1);
      arr.splice(0, 1, 'new');
      // 执行完成后 length 相同不会触发第二次 effect
      expect(effectSpy).toHaveBeenCalledTimes(1);
      expect([...arr]).toEqual(['new', 2, 3, 'test']);
    });

    it('unshift should trigger effect when array changes', () => {
      effect(() => {
        effectSpy(arr.length);
      });
      
      expect(effectSpy).toHaveBeenCalledTimes(1);
      arr.unshift(0);
      expect(effectSpy).toHaveBeenCalledTimes(2);
      expect([...arr]).toEqual([0, 1, 2, 3, 'test']);
    });

    it('copyWithin should trigger effect when array changes', () => {
      effect(() => {
        effectSpy(arr.length);
      });
      
      expect(effectSpy).toHaveBeenCalledTimes(1);
      arr.copyWithin(0, 2, 4);
      expect(effectSpy).toHaveBeenCalledTimes(1);
      expect([...arr]).toEqual([3, 'test', 3, 'test']);
    });

    it('reverse should trigger effect when array changes', () => {
      effect(() => {
        effectSpy(arr.length);
      });
      
      expect(effectSpy).toHaveBeenCalledTimes(1);
      arr.reverse();
      expect(effectSpy).toHaveBeenCalledTimes(1);
      expect([...arr]).toEqual(['test', 3, 2, 1]);
    });

    it('fill should trigger effect when array changes', () => {
      effect(() => {
        effectSpy(arr.length);
      });
      
      expect(effectSpy).toHaveBeenCalledTimes(1);
      arr.fill('filled', 1, 3);
      expect(effectSpy).toHaveBeenCalledTimes(1);
      expect([...arr]).toEqual([1, 'filled', 'filled', 'test']);
    });
  });

  describe('Get - 全等匹配方法', () => {
    it('includes should collect iterator dependency', () => {
      effect(() => {
        effectSpy(arr.includes(2));
      });
      
      expect(effectSpy).toHaveBeenCalledWith(true);
      arr[1] = 99; // 修改数组会触发 effect
      expect(effectSpy).toHaveBeenCalledWith(false);
      expect(effectSpy).toHaveBeenCalledTimes(2);
    });

    it('indexOf should collect iterator dependency', () => {
      effect(() => {
        effectSpy(arr.indexOf(2));
      });
      
      expect(effectSpy).toHaveBeenCalledWith(1);
      arr[1] = 99; // 修改数组会触发 effect
      expect(effectSpy).toHaveBeenCalledTimes(2);
    });

    it('lastIndexOf should collect iterator dependency', () => {
      const duplicateArr = $([1, 2, 2, 3]);
      effect(() => {
        effectSpy(duplicateArr.lastIndexOf(2));
      });
      
      expect(effectSpy).toHaveBeenCalledWith(2);
      duplicateArr[2] = 5; // 修改数组会触发 effect
      expect(effectSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('Get - 迭代器方法', () => {
    it('Symbol.iterator should collect iterator dependency', () => {
      effect(() => {
        const result = [];
        for (const item of arr) {
          result.push(item);
        }
        effectSpy(result.join(','));
      });
      
      expect(effectSpy).toHaveBeenCalledWith('1,2,3,test');
      arr[0] = 'changed';
      expect(effectSpy).toHaveBeenCalledTimes(2);
      expect(effectSpy).toHaveBeenCalledWith('changed,2,3,test');
    });

    it('entries should collect iterator dependency', () => {
      effect(() => {
        const result: [number, any][] = [];
        for (const [index, value] of arr.entries()) {
          result.push([index, value]);
        }
        effectSpy(result.map(([i, v]) => `${i}:${v}`).join(','));
      });
      
      expect(effectSpy).toHaveBeenCalledWith('0:1,1:2,2:3,3:test');
      expect(effectSpy).toHaveBeenCalledTimes(1);
      arr.push(5);
      expect(effectSpy).toHaveBeenCalledTimes(2);
    });

    it('values should collect iterator dependency', () => {
      effect(() => {
        const result = [];
        for (const value of arr.values()) {
          result.push(value);
        }
        effectSpy(result.join(','));
      });
      
      expect(effectSpy).toHaveBeenCalledWith('1,2,3,test');
      arr[2] = 'modified';
      expect(effectSpy).toHaveBeenCalledTimes(2);
      expect(effectSpy).toHaveBeenCalledWith('1,2,modified,test');
    });
  });

  describe('Get - 返回新数组的方法', () => {
    it('filter should collect iterator and return proxy items', () => {
      effect(() => {
        const filtered = arr.filter((x: any) => x !== 2);
        effectSpy(filtered.length);
      });
      
      expect(effectSpy).toHaveBeenCalledWith(3);
      arr[1] = 99; // 修改数组会触发 effect
      expect(effectSpy).toHaveBeenCalledTimes(2);
    });

    it('slice should collect iterator and return proxy items', () => {
      effect(() => {
        const sliced = arr.slice(1, 3);
        effectSpy(sliced.length);
      });
      
      expect(effectSpy).toHaveBeenCalledWith(2);
      arr.push(5); // 修改数组会触发 effect
      expect(effectSpy).toHaveBeenCalledTimes(2);
    });

    it('toReversed should collect iterator and return proxy items', () => {
      effect(() => {
        const reversed = arr.toReversed();
        effectSpy(reversed[0]);
      });
      
      expect(effectSpy).toHaveBeenCalledWith('test');
      arr.push('new'); // 修改数组会触发 effect
      expect(effectSpy).toHaveBeenCalledTimes(2);
    });

    it('toSpliced should collect iterator and return proxy items', () => {
      effect(() => {
        const spliced = arr.toSpliced(1, 1, 'replaced');
        effectSpy(spliced.length);
      });
      
      expect(effectSpy).toHaveBeenCalledWith(4);
      arr[0] = 'changed'; // 修改原数组会触发 effect
      expect(effectSpy).toHaveBeenCalledTimes(2);
    });

    it('with should collect iterator and return proxy items', () => {
      effect(() => {
        const newArr = arr.with(1, 'newVal');
        effectSpy(newArr[1]);
      });
      
      expect(effectSpy).toHaveBeenCalledWith('newVal');
      arr[1] = 'changed'; // 修改原数组会触发 effect
      expect(effectSpy).toHaveBeenCalledTimes(2);
    });

    it('concat should collect iterator and return proxy items', () => {
      effect(() => {
        const concatenated = arr.concat([4, 5]);
        effectSpy(concatenated.length);
      });
      
      expect(effectSpy).toHaveBeenCalledWith(6);
      arr.push(99); // 修改原数组会触发 effect
      expect(effectSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('Get - 具有回调函数的方法', () => {
    it('every should collect iterator and handle callback parameters', () => {
      effect(() => {
        const result = arr.every((x: any) => typeof x === 'number');
        effectSpy(result);
      });
      
      expect(effectSpy).toHaveBeenCalledWith(false); // 因为有 'test'
      arr[3] = 888; // 修改字符串为数字
      expect(effectSpy).toHaveBeenCalledTimes(2);
      expect(effectSpy).toHaveBeenCalledWith(true);
    });

    it('find should collect iterator and convert result', () => {
      effect(() => {
        const found = arr.find((x: any) => x === 2);
        effectSpy(found);
      });
      
      expect(effectSpy).toHaveBeenCalledWith(2);
      arr[1] = 99; // 修改找到的元素
      expect(effectSpy).toHaveBeenCalledTimes(2);
      expect(effectSpy).toHaveBeenCalledWith(undefined);
    });

    it('findLast should collect iterator and convert result', () => {
      const duplicateArr = $([1, 2, 2, 3]);
      effect(() => {
        const found = duplicateArr.findLast((x: any) => x === 2);
        effectSpy(found);
      });
      
      expect(effectSpy).toHaveBeenCalledWith(2);
      duplicateArr[2] = 99; // 修改找到的元素
      expect(effectSpy).toHaveBeenCalledTimes(2);
    });

    it('findIndex should collect iterator', () => {
      effect(() => {
        const index = arr.findIndex((x: any) => x === 2);
        effectSpy(index);
      });
      
      expect(effectSpy).toHaveBeenCalledWith(1);
      arr[1] = 99; // 修改找到的元素位置
      expect(effectSpy).toHaveBeenCalledTimes(2);
      expect(effectSpy).toHaveBeenCalledWith(-1); // 不再找到原值
    });

    it('findLastIndex should collect iterator', () => {
      const duplicateArr = $([1, 2, 2, 3]);
      effect(() => {
        const index = duplicateArr.findLastIndex((x: any) => x === 2);
        effectSpy(index);
      });
      
      expect(effectSpy).toHaveBeenCalledWith(2);
      duplicateArr[2] = 777; // 修改最后一个匹配元素
      expect(effectSpy).toHaveBeenCalledTimes(2);
      expect(effectSpy).toHaveBeenCalledWith(1); // 应该找到第一个2的位置
    });

    it('forEach should collect iterator', () => {
      effect(() => {
        let sum = 0;
        arr.forEach((x: any) => {
          if (typeof x === 'number') sum += x;
        });
        effectSpy(sum);
      });
      
      expect(effectSpy).toHaveBeenCalledWith(6); // 1+2+3
      arr[0] = 10;
      expect(effectSpy).toHaveBeenCalledTimes(2);
      expect(effectSpy).toHaveBeenCalledWith(15); // 10+2+3
    });

    it('map should collect iterator and convert callback params', () => {
      effect(() => {
        const mapped = arr.map((x: any) => x + '_mapped');
        effectSpy(mapped[0]);
      });
      
      expect(effectSpy).toHaveBeenCalledWith('1_mapped');
      arr[0] = 'new_value';
      expect(effectSpy).toHaveBeenCalledTimes(2);
      expect(effectSpy).toHaveBeenCalledWith('new_value_mapped');
    });

    it('some should collect iterator and handle callback parameters', () => {
      effect(() => {
        const result = arr.some((x: any) => x === 'test');
        effectSpy(result);
      });
      
      expect(effectSpy).toHaveBeenCalledWith(true);
      arr[3] = 'not_test'; // 修改匹配的元素
      expect(effectSpy).toHaveBeenCalledTimes(2);
      expect(effectSpy).toHaveBeenCalledWith(false);
    });

    it('reduce should collect iterator and convert initial value', () => {
      effect(() => {
        const result = arr.reduce((acc: number, curr: any) => 
          typeof curr === 'number' ? acc + curr : acc, 0);
        effectSpy(result);
      });
      
      expect(effectSpy).toHaveBeenCalledWith(6); // 1+2+3
      arr[1] = 10;
      expect(effectSpy).toHaveBeenCalledTimes(2);
      expect(effectSpy).toHaveBeenCalledWith(14); // 1+10+3
    });

    it('reduceRight should collect iterator and convert initial value', () => {
      effect(() => {
        const result = arr.reduceRight((acc: number, curr: any) => 
          typeof curr === 'number' ? acc + curr : acc, 0);
        effectSpy(result);
      });
      
      expect(effectSpy).toHaveBeenCalledWith(6); // 3+2+1
      arr[1] = 10;
      expect(effectSpy).toHaveBeenCalledTimes(2);
      expect(effectSpy).toHaveBeenCalledWith(14); // 3+10+1
    });
  });

  describe('Get - 仅收集方法', () => {
    it('join should only collect', () => {
      effect(() => {
        effectSpy(arr.join('-'));
      });
      
      expect(effectSpy).toHaveBeenCalledWith('1-2-3-test');
      arr[0] = 'first';
      expect(effectSpy).toHaveBeenCalledTimes(2);
      expect(effectSpy).toHaveBeenCalledWith('first-2-3-test');
    });

    it('toString should only collect', () => {
      effect(() => {
        effectSpy(arr.toString());
      });
      
      expect(effectSpy).toHaveBeenCalledWith('1,2,3,test');
      arr[1] = 'second';
      expect(effectSpy).toHaveBeenCalledTimes(2);
      expect(effectSpy).toHaveBeenCalledWith('1,second,3,test');
    });

    it('toLocaleString should only collect', () => {
      effect(() => {
        effectSpy(arr.toLocaleString());
      });
      
      expect(effectSpy).toHaveBeenCalledWith('1,2,3,test');
      arr[2] = 'third';
      expect(effectSpy).toHaveBeenCalledTimes(2);
      expect(effectSpy).toHaveBeenCalledWith('1,2,third,test');
    });
  });
});