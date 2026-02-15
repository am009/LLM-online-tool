# TipTap 编辑器用法总结

## 1. CDN 安装（无需 npm / 构建工具）

通过 `esm.sh` CDN 使用 ES Module 方式引入：

```html
<script type="module">
  import { Editor } from 'https://esm.sh/@tiptap/core'
  import StarterKit from 'https://esm.sh/@tiptap/starter-kit'

  const editor = new Editor({
    element: document.querySelector('.element'),
    extensions: [StarterKit],
    content: '<p>Hello from CDN!</p>',
  })
</script>

<div class="element"></div>
```

所有 npm 上的 `@tiptap/*` 包均可通过 `https://esm.sh/@tiptap/包名` 加载。

---

## 2. Editor 核心 API

### 2.1 构造选项

```javascript
const editor = new Editor({
  element: document.querySelector('#editor'),  // 挂载的 DOM 元素，可为 null 后续用 mount()
  extensions: [StarterKit],                     // 扩展数组（必填）
  content: '<p>初始内容</p>',                    // 初始内容（HTML 或 JSON）
  contentType: 'markdown',                      // 可选，配合 Markdown 扩展使用
  editable: true,                               // 是否可编辑
  autofocus: false,                             // true | false | 'start' | 'end' | 'all' | 位置数字
  textDirection: 'ltr',                         // 'ltr' | 'rtl' | 'auto'
  enableInputRules: true,                       // 是否启用输入规则
  enablePasteRules: true,                       // 是否启用粘贴规则
  injectCSS: true,                              // 是否注入默认 CSS
  injectNonce: '',                              // CSP nonce
  editorProps: {},                              // ProseMirror editorProps 覆盖
  parseOptions: {},                             // ProseMirror 解析选项

  // 事件回调
  onCreate({ editor }) {},
  onUpdate({ editor }) {},
  onSelectionUpdate({ editor, event }) {},
  onTransaction({ editor, transaction }) {},
  onFocus({ editor, event }) {},
  onBlur({ editor, event }) {},
  onDestroy() {},
  onPaste({ event, slice, editor }) {},
  onDrop({ event, slice, editor }) {},
  onDelete({ type, deletedRange, newRange, partial, node, mark }) {},
  onContentError({ editor, error, disableCollaboration }) {},
})
```

### 2.2 关键方法

| 方法 | 说明 |
|------|------|
| `editor.getHTML()` | 获取 HTML 格式内容 |
| `editor.getJSON()` | 获取 JSON 格式内容 |
| `editor.getText(separator?)` | 获取纯文本，可指定块分隔符（如 `'\n'`） |
| `editor.can()` | 测试命令是否可执行（不实际执行） |
| `editor.chain()` | 链式调用多个命令 |
| `editor.destroy()` | 销毁编辑器，释放资源，解绑事件 |
| `editor.mount(element)` | 挂载到 DOM 元素 |
| `editor.unmount()` | 从 DOM 卸载（可重新挂载） |
| `editor.setOptions(options)` | 更新配置 |
| `editor.setEditable(boolean)` | 切换可编辑状态 |
| `editor.registerPlugin(plugin)` | 注册 ProseMirror 插件 |
| `editor.unregisterPlugin(pluginKey)` | 移除插件 |

### 2.3 关键属性

| 属性 | 说明 |
|------|------|
| `editor.isEditable` | 是否可编辑 |
| `editor.isEmpty` | 是否为空 |
| `editor.isFocused` | 是否聚焦 |
| `editor.isDestroyed` | 是否已销毁 |
| `editor.state` | ProseMirror EditorState |
| `editor.view` | ProseMirror EditorView |

---

## 3. 命令系统

### 3.1 内容命令

```javascript
// 替换整个文档内容
editor.commands.setContent('<p>新内容</p>')
editor.commands.setContent({ type: 'doc', content: [...] })  // JSON 格式

// 在当前位置插入内容
editor.commands.insertContent('<p>插入的内容</p>')

// 在指定位置插入内容
editor.commands.insertContentAt(10, '<p>插入的内容</p>')

// 清空文档
editor.commands.clearContent()
```

### 3.2 光标与选择命令

```javascript
editor.commands.focus()         // 聚焦
editor.commands.focus('end')    // 聚焦到末尾
editor.commands.focus('start')  // 聚焦到开头
editor.commands.blur()          // 失焦
editor.commands.selectAll()     // 全选
editor.commands.deleteSelection() // 删除选中内容
editor.commands.scrollIntoView()  // 滚动到可视区
```

### 3.3 格式命令

```javascript
editor.commands.toggleBold()
editor.commands.toggleItalic()
editor.commands.toggleStrike()
editor.commands.toggleMark('highlight')
editor.commands.setMark('link', { href: 'https://...' })
editor.commands.unsetMark('bold')
```

### 3.4 链式调用

```javascript
// 多个命令合并为一个事务，onUpdate 只触发一次
editor.chain().focus().toggleBold().run()

// 测试命令是否可执行
editor.can().toggleBold()  // 返回 true/false
```

---

## 4. 事件系统

### 4.1 12 个核心事件

| 事件 | 触发时机 | 回调参数 |
|------|----------|----------|
| `beforeCreate` | 编辑器视图创建前 | `{ editor }` |
| `create` | 编辑器完全初始化后 | `{ editor }` |
| `update` | 内容变化时 | `{ editor }` |
| `selectionUpdate` | 选区变化时 | `{ editor, event }` |
| `transaction` | 任何状态变化时 | `{ editor, transaction }` |
| `focus` | 获得焦点时 | `{ editor, event }` |
| `blur` | 失去焦点时 | `{ editor, event }` |
| `destroy` | 编辑器销毁时 | 无 |
| `paste` | 粘贴内容时 | `{ event, slice, editor }` |
| `drop` | 拖放内容时 | `{ event, slice, editor }` |
| `delete` | 删除内容时 | `{ type, deletedRange, ... }` |
| `contentError` | 内容不匹配 schema 时 | `{ editor, error }` |

### 4.2 三种监听方式

```javascript
// 方式 1：构造时配置
const editor = new Editor({
  onUpdate({ editor }) { console.log('内容变化') },
  onFocus({ editor }) { console.log('聚焦') },
})

// 方式 2：运行时绑定
editor.on('update', ({ editor }) => { console.log('内容变化') })
editor.off('update', handler)

// 方式 3：在扩展中定义
const MyExt = Extension.create({
  onCreate({ editor }) { /* ... */ },
})
```

---

## 5. StarterKit 扩展

StarterKit 是常用扩展的合集，一行代码引入多种功能。

### 5.1 包含的扩展

**Nodes**: Blockquote, BulletList, CodeBlock, Document, HardBreak, Heading, HorizontalRule, ListItem, OrderedList, Paragraph, Text

**Marks**: Bold, Code, Italic, Link (v3), Strike, Underline (v3)

**功能**: Dropcursor, Gapcursor, Undo/Redo, ListKeymap (v3), TrailingNode (v3)

### 5.2 配置与禁用

```javascript
import StarterKit from '@tiptap/starter-kit'

const editor = new Editor({
  extensions: [
    StarterKit.configure({
      // 禁用某个扩展
      heading: false,
      bold: false,

      // 配置某个扩展
      heading: { levels: [1, 2] },

      // 禁用撤销重做
      undoRedo: false,
    }),
  ],
})
```

---

## 6. 扩展体系总览

### 6.1 三大类别

**Nodes（节点，27 种）**：块级内容结构
- 内容块：Audio, Blockquote, CodeBlock, Details, Document, Heading, HorizontalRule, Image, Paragraph
- 列表：BulletList, OrderedList, ListItem, TaskList, TaskItem
- 表格：Table, TableCell, TableHeader, TableRow
- 嵌入：YouTube, Twitch
- 特殊：Emoji, Mathematics, Mention, Text, HardBreak

**Marks（标记，10 种）**：行内格式
- Bold, Italic, Underline, Strike, Code, TextStyle, Highlight, Superscript, Subscript, Link

**Functionality（功能扩展，40+ 种）**：
- 文本格式：Color, BackgroundColor, FontFamily, FontSize, LineHeight, TextAlign
- UI：BubbleMenu, FloatingMenu, Placeholder, DragHandle
- 协作：Collaboration, CollaborationCaret, Comments
- 内容管理：CharacterCount, InvisibleCharacters, Selection, TrailingNode, UniqueID
- 高级：AI Generation, Mathematics, Export/Import, Snapshot, Pages, FileHandler, Typography

### 6.2 许可证分级

- **开源**：大部分核心扩展
- **Start Plan**：AI Generation, Export, Import, Comments
- **Team Plan**：Pages, Snapshot Compare
- **Add-ons**：AI Toolkit

---

## 7. Markdown 扩展

### 7.1 安装

```bash
npm install @tiptap/markdown
```

CDN 方式：
```javascript
import { Markdown } from 'https://esm.sh/@tiptap/markdown'
```

### 7.2 基本用法

```javascript
import { Markdown } from '@tiptap/markdown'

const editor = new Editor({
  extensions: [StarterKit, Markdown],
  content: '# Hello World\n\nThis is **Markdown**!',
  contentType: 'markdown',  // 指定内容格式为 markdown
})
```

### 7.3 Markdown 读写 API

```javascript
// 解析 Markdown → JSON
const json = editor.markdown.parse('# Hello')
// { type: 'doc', content: [...] }

// 序列化 JSON → Markdown
const md = editor.markdown.serialize(json)
// "# Hello"

// 插入 Markdown 内容
editor.commands.insertContent('# Hello World\n\nThis is **Markdown**!')
```

### 7.4 配置选项

```javascript
Markdown.configure({
  // 缩进风格
  indentation: { style: 'space', size: 2 },

  // 自定义 marked 实例
  marked: myMarkedInstance,

  // marked 解析选项
  markedOptions: {
    gfm: true,      // GitHub Flavored Markdown
    breaks: false,   // 是否将换行转为 <br>
  },
})
```

### 7.5 工作原理

解析流程：`Markdown 字符串 → MarkedJS Lexer（分词） → Markdown tokens → 扩展 parse handlers → TipTap JSON`

序列化流程：`TipTap JSON → 扩展 render handlers → Markdown 字符串`

使用 MarkedJS 作为解析器（快速、轻量、可扩展、CommonMark 兼容）。

### 7.6 自定义扩展的 Markdown 支持

```javascript
const MyNode = Node.create({
  name: 'myNode',

  parseMarkdown: (token, helpers) => {
    // token → TipTap JSON
    const content = helpers.parseInline(token.tokens || [])
    return { type: 'myNode', content }
  },

  renderMarkdown: (node, helpers) => {
    // TipTap JSON → Markdown 字符串
    const content = helpers.renderChildren(node.content || [])
    return `:::custom\n${content}\n:::`
  },
})
```

**辅助函数：**
- `helpers.parseInline(tokens)` - 处理行内内容
- `helpers.parseChildren(tokens)` - 处理块级子节点
- `helpers.renderChildren(content)` - 序列化子节点
- `helpers.applyMark(markName, content, attrs?)` - 应用标记

### 7.7 限制

- 不支持 Markdown 注释（内容可能丢失）
- 表格单元格只支持一个子节点

---

## 8. 数学公式扩展

### 8.1 官方扩展 `@tiptap/extension-mathematics`

**安装：**
```bash
npm install @tiptap/extension-mathematics katex
```

CDN 方式：
```javascript
import { Mathematics } from 'https://esm.sh/@tiptap/extension-mathematics'
```

需要引入 KaTeX CSS：
```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
```

**使用 KaTeX 渲染**（非 MathJax）。

**配置：**
```javascript
import { Mathematics } from '@tiptap/extension-mathematics'

const editor = new Editor({
  extensions: [
    Mathematics.configure({
      // 行内数学选项
      inlineOptions: { /* ... */ },
      // 块级数学选项
      blockOptions: { /* ... */ },
      // KaTeX 渲染选项
      katexOptions: {
        throwOnError: false,
        macros: { '\\R': '\\mathbb{R}' },
      },
    }),
  ],
})
```

**支持两种数学节点：**
- `InlineMath` - 行内数学公式
- `BlockMath` - 块级数学公式

可单独导入：
```javascript
import { InlineMath } from '@tiptap/extension-mathematics/inline'
import { BlockMath } from '@tiptap/extension-mathematics/block'
```

**命令：**
```javascript
// 行内数学
editor.commands.insertInlineMath({ latex: 'x^2 + y^2 = z^2' })
editor.commands.updateInlineMath({ latex: 'E = mc^2', pos: 10 })
editor.commands.deleteInlineMath({ pos: 10 })

// 块级数学
editor.commands.insertBlockMath({ latex: '\\int_0^1 x^2 dx' })
editor.commands.updateBlockMath({ latex: '...', pos: 20 })
editor.commands.deleteBlockMath({ pos: 20 })
```

**$ 符号迁移：** 提供 `migrateMathStrings()` 工具函数，可将 `$...$` 格式的数学表达式转换为 Math 节点。

**CSS 类名：** `.tiptap-mathematics-render` 用于样式自定义。

### 8.2 社区扩展 `@aarkue/tiptap-math-extension`

**安装：**
```bash
npm install @aarkue/tiptap-math-extension
npm install katex  # 需要单独安装 KaTeX
```

CDN 方式：
```javascript
import MathExtension from 'https://esm.sh/@aarkue/tiptap-math-extension'
```

KaTeX CSS 引入（CDN）：
```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
```

**配置：**
```javascript
const editor = new Editor({
  extensions: [
    StarterKit,
    MathExtension.configure({
      evaluation: true,         // 是否启用表达式求值
      addInlineMath: true,      // 是否添加 InlineMath 节点类型
      delimiters: 'dollar',     // 'dollar'($x$) | 'bracket'(\(x\)) | 自定义正则
      katexOptions: {},         // KaTeX 渲染选项
      renderTextMode: 'raw-latex',  // 'none' | 'raw-latex' | 自定义占位符
    }),
  ],
})
```

**分隔符选项：**
- `'dollar'` → `$x^2$`（行内），`$$\sum_i i$$`（块级）
- `'bracket'` → `\(x^2\)`（行内），`\[\sum_i i\]`（块级）
- 支持自定义正则表达式

**特色功能：** 支持表达式求值（使用 Evaluatex.js），可用 `:=` 定义变量。

---

## 9. 本项目的 CDN 集成方案

当前项目 `tiptap-init.js` 已实现基础集成：

```javascript
import { Editor } from 'https://esm.sh/@tiptap/core@2'
import StarterKit from 'https://esm.sh/@tiptap/starter-kit@2'

// 纯文本 → HTML
function textToHtml(text) {
  if (!text) return '<p></p>';
  return text.split('\n').map(line => {
    const escaped = line.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    return `<p>${escaped || '<br>'}</p>`;
  }).join('');
}

// HTML → 纯文本
function htmlToText(editor) {
  const doc = editor.state.doc;
  return doc.textBetween(0, doc.content.size, '\n');
}

// 工厂函数
window.createTipTapEditor = function(element, content, onUpdate) {
  return new Editor({
    element,
    extensions: [StarterKit.configure({
      heading: false, bold: false, italic: false, strike: false,
      bulletList: false, orderedList: false, blockquote: false,
      codeBlock: false, horizontalRule: false, listItem: false,
    })],
    content: textToHtml(content),
    onUpdate: onUpdate ? ({ editor }) => onUpdate(htmlToText(editor)) : undefined,
  });
};

window.tiptapTextToHtml = textToHtml;
window.tiptapHtmlToText = htmlToText;
window.tiptapReady = true;
window.dispatchEvent(new Event('tiptap-ready'));
```

### 加载时序

由于 ES Module 是异步加载的，主脚本需要等待 TipTap 就绪：

```javascript
// 在 MarkdownTranslator.init() 中
if (!window.tiptapReady) {
  await new Promise(resolve =>
    window.addEventListener('tiptap-ready', resolve, { once: true })
  );
}
```

### 后续扩展路线

- **Step 2**：添加数学公式支持（`@tiptap/extension-mathematics` 或 `@aarkue/tiptap-math-extension`），引入 KaTeX CSS，移除 MathJax
- **Step 3**：实现左右编辑器同步机制，或评估多编辑器性能
