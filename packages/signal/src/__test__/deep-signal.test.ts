import { $, effect, scope } from '#/index';

describe('deep-signal basic functionality', () => {
  it('should create a reactive object with nested properties', () => {
    const obj = $({
      user: {
        name: 'John',
        age: 30,
        address: {
          city: 'New York',
          zip: '10001'
        }
      },
      items: [1, 2, 3]
    });

    expect(obj.user.name).toBe('John');
    expect(obj.user.address.city).toBe('New York');
    expect(obj.items[0]).toBe(1);
  });

  it('should track changes to deeply nested properties', () => {
    const obj = $({
      user: {
        name: 'Alice',
        profile: {
          email: 'alice@example.com'
        }
      }
    });

    let executionCount = 0;
    let capturedEmail;

    effect(() => {
      executionCount++;
      capturedEmail = obj.user.profile.email;
    });

    expect(capturedEmail).toBe('alice@example.com');
    expect(executionCount).toBe(1);

    obj.user.profile.email = 'alice2@example.com';
    
    expect(capturedEmail).toBe('alice2@example.com');
    expect(executionCount).toBe(2);
  });
});

describe('deep-signal array operations', () => {
  it('should react to array mutations', () => {
    const obj = $({
      list: [1, 2, 3]
    });

    let executionCount = 0;
    let capturedLength;

    effect(() => {
      executionCount++;
      capturedLength = obj.list.length;
    });

    expect(capturedLength).toBe(3);
    expect(executionCount).toBe(1);

    obj.list.push(4);
    expect(capturedLength).toBe(4);
    expect(executionCount).toBe(2);

    obj.list.splice(0, 1);
    expect(capturedLength).toBe(3);
    expect(executionCount).toBe(3);
  });

  it('should react to array element changes', () => {
    const obj = $({
      users: [
        { id: 1, name: 'User1' },
        { id: 2, name: 'User2' }
      ]
    });

    let executionCount = 0;
    let capturedNames;

    effect(() => {
      executionCount++;
      capturedNames = obj.users.map(user => user.name);
    });

    expect(capturedNames).toEqual(['User1', 'User2']);
    expect(executionCount).toBe(1);

    obj.users[0].name = 'Updated User1';
    expect(capturedNames).toEqual(['Updated User1', 'User2']);
    expect(executionCount).toBe(2);
  });
});

describe('deep-signal nested object updates', () => {
  it('should detect changes in deeply nested objects', () => {
    const complexObj = $({
      level1: {
        level2: {
          level3: {
            value: 'initial'
          }
        }
      }
    });

    let executionCount = 0;
    let capturedValue;

    effect(() => {
      executionCount++;
      capturedValue = complexObj.level1.level2.level3.value;
    });

    expect(capturedValue).toBe('initial');
    expect(executionCount).toBe(1);

    complexObj.level1.level2.level3.value = 'updated';
    expect(capturedValue).toBe('updated');
    expect(executionCount).toBe(2);
  });

  it('should handle object replacement', () => {
    const obj = $({
      data: {
        original: { value: 1 }
      }
    });

    let executionCount = 0;
    let capturedValue;

    effect(() => {
      executionCount++;
      capturedValue = obj.data.original.value;
    });

    expect(capturedValue).toBe(1);
    expect(executionCount).toBe(1);

    obj.data.original = { value: 999 };
    expect(capturedValue).toBe(999);
    expect(executionCount).toBe(2);
  });
});

describe('deep-signal performance and edge cases', () => {
  it('should avoid unnecessary notifications for unrelated changes', () => {
    const obj = $({
      counter: 5,
      unrelated: 'value'
    });

    let executionCount = 0;
    let capturedCounter;

    effect(() => {
      executionCount++;
      capturedCounter = obj.counter;
    });

    expect(capturedCounter).toBe(5);
    expect(executionCount).toBe(1);

    // 修改不相关的属性不应该触发effect
    obj.unrelated = 'new value';
    expect(executionCount).toBe(1); // 应该仍然是1

    // 修改相关属性应该触发effect
    obj.counter = 6;
    expect(capturedCounter).toBe(6);
    expect(executionCount).toBe(2);
  });

  it('should handle null and undefined values properly', () => {
    const obj = $({
      nullable: null,
      undefinedValue: undefined,
      nested: {
        nullable: null
      }
    });

    expect(obj.nullable).toBeNull();
    expect(obj.undefinedValue).toBeUndefined();
    expect(obj.nested.nullable).toBeNull();

    obj.nullable = 'changed';
    expect(obj.nullable).toBe('changed');
  });
});

describe('deep-signal complex data structures', () => {
  it('should handle mixed data structures', () => {
    const complexData = $({
      users: [
        {
          id: 1,
          personalInfo: {
            name: 'John',
            contacts: {
              emails: ['john@example.com'],
              addresses: [
                {
                  type: 'home',
                  details: {
                    street: '123 Main St',
                    active: true
                  }
                }
              ]
            }
          },
          preferences: {
            notifications: {
              email: true,
              sms: false
            }
          }
        }
      ],
      settings: {
        appConfig: {
          theme: 'dark',
          features: {
            enabled: ['feature1', 'feature2'],
            disabled: ['feature3']
          }
        }
      }
    });

    // 测试深层访问
    expect(complexData.users[0].personalInfo.name).toBe('John');
    expect(complexData.users[0].personalInfo.contacts.addresses[0].details.street).toBe('123 Main St');
    expect(complexData.settings.appConfig.features.enabled).toContain('feature1');

    // 测试深层更新
    let executionCount = 0;
    let capturedName;

    effect(() => {
      executionCount++;
      capturedName = complexData.users[0].personalInfo.name;
    });

    expect(capturedName).toBe('John');
    expect(executionCount).toBe(1);

    complexData.users[0].personalInfo.name = 'Jane';
    expect(capturedName).toBe('Jane');
    expect(executionCount).toBe(2);
  });
});

describe('deep-signal with scope and cleanup', () => {
  // it('should work correctly within scopes', () => {
  //   const result = scope(() => {
  //     const obj = $({
  //       value: 1
  //     });

  //     let executionCount = 0;
  //     let capturedValue;

  //     effect(() => {
  //       executionCount++;
  //       capturedValue = obj.value;
  //     });

  //     obj.value = 2;

  //     return { obj, capturedValue, executionCount };
  //   });

  //   expect(result.obj.value).toBe(2);
  //   expect(result.capturedValue).toBe(2);
  //   expect(result.executionCount).toBe(2);
  // });

  it('should clean up resources properly', () => {
    const cleanupLog: string[] = [];
    
    const dispose = scope(() => {
      const obj = $({
        value: 1
      });

      const cleanupFn = () => {
        cleanupLog.push('cleanup called');
      };

      effect(() => {
        obj.value; // Track dependency
        return cleanupFn;
      });

      obj.value = 2;
      
      return obj;
    });

    dispose();

    expect(cleanupLog).toHaveLength(2);
  });
});

describe('deep-signal with getters', () => {
  it('should properly handle objects with getters', () => {
    const baseObj = {
      firstName: 'John',
      lastName: 'Doe',
      get fullName() {
        return `${this.firstName} ${this.lastName}`;
      }
    };

    const obj = $(baseObj);

    let executionCount = 0;
    let capturedFullName;

    effect(() => {
      executionCount++;
      capturedFullName = obj.fullName;
    });

    expect(capturedFullName).toBe('John Doe');
    expect(executionCount).toBe(1);

    obj.firstName = 'Jane';
    expect(capturedFullName).toBe('Jane Doe');
    expect(executionCount).toBe(2);

    obj.lastName = 'Smith';
    expect(capturedFullName).toBe('Jane Smith');
    expect(executionCount).toBe(3);
  });

  it('should track dependencies when accessing getter values', () => {
    const obj = $({
      value: 10,
      get doubled() {
        return this.value * 2;
      },
      get tripled() {
        return this.value * 3;
      }
    });

    let doubledResult, tripledResult;
    let doubledExecutions = 0;
    let tripledExecutions = 0;

    effect(() => {
      doubledExecutions++;
      doubledResult = obj.doubled;
    });

    effect(() => {
      tripledExecutions++;
      tripledResult = obj.tripled;
    });

    expect(doubledResult).toBe(20);
    expect(tripledResult).toBe(30);
    expect(doubledExecutions).toBe(1);
    expect(tripledExecutions).toBe(1);

    obj.value = 5;

    expect(doubledResult).toBe(10);
    expect(tripledResult).toBe(15);
    expect(doubledExecutions).toBe(2);
    expect(tripledExecutions).toBe(2);
  });

  it('should handle nested objects with getters', () => {
    const obj = $({
      user: {
        firstName: 'Alice',
        lastName: 'Johnson',
        get displayName() {
          return `${this.firstName} ${this.lastName}`;
        }
      }
    });

    let executionCount = 0;
    let capturedDisplay;

    effect(() => {
      executionCount++;
      capturedDisplay = obj.user.displayName;
    });

    expect(capturedDisplay).toBe('Alice Johnson');
    expect(executionCount).toBe(1);

    obj.user.firstName = 'Bob';
    expect(capturedDisplay).toBe('Bob Johnson');
    expect(executionCount).toBe(2);
  });
});