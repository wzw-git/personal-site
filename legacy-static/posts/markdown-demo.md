本文用于检查博客渲染是否正常，涵盖常用 Markdown 语法。

## 二级标题

### 三级标题

普通段落中可以包含 **加粗**、*斜体*、`行内代码` 以及 [外链示例](https://developer.mozilla.org/zh-CN/)。

## 列表

无序列表：

- 第一项
- 第二项
  - 嵌套项

有序列表：

1. 先这样
2. 再那样

## 引用

> 简洁是可靠的先决条件。
> —— Edsger W. Dijkstra

## 代码块

```javascript
// 示例：在文章里展示代码
function greet(name) {
  return `你好，${name}！`;
}
```

```bash
# 部署后自检
curl -sI https://你的域名/ | head -n1
```

## 表格

| 能力       | 说明           |
| ---------- | -------------- |
| 静态托管   | 适合 nginx     |
| Markdown   | 专注写作       |

## 分隔线

---

到此告一段落。若样式不满意，只需改 `styles.css` 中 `.prose` 相关规则。
