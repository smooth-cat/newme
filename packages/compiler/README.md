# Bobe
一个前端模板语法编译器

## 我们构建了一种新的模板语法

```typescript
const template = `
node1 k1=1
  node1_1 k2=2 k3=3
    node1_1_1 k6=6
node2
| p1=1
| p2=2 p3=3
  node2_1
  | p4=4 p5=5 p6=6
  node2_2
  | p7=7
node3 v1=1  v2=2 v3=3
`
const compiler = new Compiler(template)
let Ast = cmp.program();

console.log(Ast)

// 输出结果如下
Ast = [
  {
    "name": "node1",
    "props": {
      "k1": "1"
    },
    "children": [
      {
        "name": "node1_1",
        "props": {
          "k2": "2",
          "k3": "3"
        },
        "children": [
          {
            "name": "node1_1_1",
            "props": {
              "k6": "6"
            }
          }
        ]
      }
    ]
  },
  {
    "name": "node2",
    "props": {
      "p1": "1",
      "p2": "2",
      "p3": "3"
    },
    "children": [
      {
        "name": "node2_1",
        "props": {
          "p4": "4",
          "p5": "5",
          "p6": "6"
        }
      },
      {
        "name": "node2_2",
        "props": {
          "p7": "7"
        }
      }
    ]
  },
  {
    "name": "node3",
    "props": {
      "v1": "1",
      "v2": "2",
      "v3": "3"
    }
  }
]
```

