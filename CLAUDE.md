这是一个调用大模型的纯静态网页项目。顶部tab用于切换子页面，每个子页面是单独的工具，现在包含了PDF OCR和LLM翻译两个工具页面。包含如下文件

- index.html 主体的HTML页面
- markdown-translator.js和markdown-translator.css：LLM翻译子页面相关代码和样式
- pdfocr.js和pdfocr.css：PDF OCR子页面相关代码和样式
- common.css：公共的样式文件
- language-manager.js：实现多语言管理，增加了HTML代码后，需要将相关翻译写入到languages/zh-CN.json和languages/en-US.json文件中。

文档：
- OCR-API-Spec.md 描述了OCR API的接口格式。
- TipTap.md 描述了TipTap编辑器组件的用法。

子页面都分为两栏，左侧为可折叠的设置栏，右侧为主体的OCR栏。主体部分是垂直排列的一系列页面校对栏或者翻译校对栏。对每个页面/待翻译文本块，展示一行。

PDF OCR：用户点击上传按钮后，选择pdf文件，网页端利用pdf.js，将每页的pdf页面单独提取为图像，然后每个页面都在右侧OCR栏生成一行，把页面的图像放到每一行左侧，右侧校对结果先空着，等待用户点击每页的按钮时调用API识别结果。识别后，右侧展示JSON和分栏结果两个tab，分栏结果分块展示每块文字，并且在鼠标悬停的时候会高亮对应位置。最后用户可以点击导出按钮，将文档导出为想要的形式。

LLM翻译：用户可以上传markdown或者latex文件，通过两个连续的换行分段，作为待翻译原文。用户可以点击中间的按钮使用大模型翻译该段文本，翻译结果展示在右侧。用户可以点击左上角的图标，在MathJax渲染结果和原文之间切换。

## 重构计划：

将LLM翻译部分，编辑器换成 https://github.com/ueberdosis/tiptap 

1. 暂时先用 https://tiptap.dev/docs/editor/getting-started/install/vanilla-javascript#using-a-cdn-no-build-step 这里的基于CDN的方案，继续维持纯JS，无需npm。
2. 需要让tiptap支持markdown数学公式，最好能配置激活的语法。移除现在的mathpix（如果tiptap用的不是mathpix）。
3. 现在是每一小块中英文搞一个单独的编辑器。如何想出一个同步机制，使得两侧能对应上？这样不必创建太多的编辑器。还是说编辑器可能创建很多开销也不大？

设置部分要有个简单的文件系统，可以上传一些被markdown部分引用的图片，也支持图片的删除。在编辑器部分可以用markdown语法引用图片并直接显示。

### Step1

先把tiptap编辑器弄上去。先不管tiptap的数学公式功能，但是可以先移除现在的mathpix。也先不考虑同步机制，依然对每一小块内容单独创建编辑器。

markdown部分参考 https://tiptap.dev/docs/editor/markdown

### Step2

实现简单的文件系统，支持tiptap编辑器的图片显示。

### Step3

处理数学公式的显示。
