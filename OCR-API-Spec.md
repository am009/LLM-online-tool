# DotsOCR API 服务器接口文档

本文档描述了基于 Flask 的 DotsOCR API 服务器的请求和响应格式。

## 服务器信息

- **基础URL**: 例如：`http://172.19.193.39:5123`
- **内容类型**: application/json

## 接口端点

### 1. 健康检查

**端点**: `GET /health`

**描述**: 检查服务器状态和模型加载情况

**请求格式**:
```http
GET /health HTTP/1.1
Host: localhost:5000
```

**响应格式**:
```json
{
  "status": "healthy",
  "model_loaded": true
}
```

**响应字段说明**:
- `status`: 服务器状态，固定为 "healthy"
- `model_loaded`: 布尔值，表示OCR模型是否已加载

---

### 2. OCR处理

**端点**: `POST /ocr`

**描述**: 处理图像并返回OCR结果

**请求体**:
```json
{
  "image": "data:image/png;base64,图像数据...",
  "prompt_type": "prompt_layout_all_en",
  "temperature": 0.1,
  "top_p": 1.0,
  "max_new_tokens": 12000,
  "stream": false
}
```

#### 请求参数说明

| 参数 | 类型 | 必需 | 默认值 | 描述 |
|------|------|------|--------|------|
| `image` | string | 是 | - | 图像数据，格式取决于 `image_format` |
| `prompt_type` | string | 否 | "prompt_layout_all_en" | 提示类型，决定OCR处理模式 |
| `temperature` | float | 否 | 0.1 | 生成温度参数 |
| `top_p` | float | 否 | 1.0 | nucleus采样参数 |
| `max_new_tokens` | integer | 否 | 24000 | 最大新生成token数 |
| `stream` | boolean | 否 | false | 是否使用流式响应 |

只使用stream=True的API

#### 支持的 prompt_type 类型

| 类型 | 描述 |
|------|------|
| `prompt_layout_all_en` | 解析所有布局信息，包括边界框、类别和文本内容，输出JSON格式 |

只使用prompt_layout_all_en这一种

### 流式响应 (stream=true)

**响应头**:
```http
Content-Type: application/x-ndjson
```

**响应格式** (每行一个JSON对象):
```json
{"model": "dots-ocr", "created_at": "2024-01-01T10:00:00.000000", "response": "部分结果", "done": false}
{"model": "dots-ocr", "created_at": "2024-01-01T10:00:01.000000", "response": "更多结果", "done": false}
{"model": "dots-ocr", "created_at": "2024-01-01T10:00:02.000000", "response": "", "done": true}
```

需要将流式的response结果组合起来，response内部的json信息。

**流式响应字段说明**:
- `model`: 固定为 "dots-ocr"
- `created_at`: 响应创建时间 (ISO格式)
- `response`: 本次返回的文本片段
- `done`: 布尔值，true表示流式响应结束

---

## 布局类别说明

当使用 `prompt_layout_all_en` 时，后端使用了大模型，对应的prompt是：

```
Please output the layout information from the PDF image, including each layout element's bbox, its category, and the corresponding text content within the bbox.

1. Bbox format: [x1, y1, x2, y2]

2. Layout Categories: The possible categories are ['Caption', 'Footnote', 'Formula', 'List-item', 'Page-footer', 'Page-header', 'Picture', 'Section-header', 'Table', 'Text', 'Title'].

3. Text Extraction & Formatting Rules:
    - Picture: For the 'Picture' category, the text field should be omitted.
    - Formula: Format its text as LaTeX.
    - Table: Format its text as HTML.
    - All Others (Text, Title, etc.): Format their text as Markdown.

4. Constraints:
    - The output text must be the original text from the image, with no translation.
    - All layout elements must be sorted according to human reading order.

5. Final Output: The entire output must be a single JSON object.
```

样例的返回格式：

```
[
  {
    "bbox": [
      454,
      565,
      1685,
      606
    ],
    "category": "Title",
    "text": "# Effect of magnetic field on the photoproduction of electron-positron pairs"
  },
  {
    "bbox": [
      542,
      621,
      953,
      651
    ],
    "category": "Text",
    "text": "A. E. Lobanov and A. R. Muratov"
  },
  {
    "bbox": [
      542,
      779,
      1632,
      904
    ],
    "category": "Text",
    "text": "The cross section for electron-positron production by two photons in a dc uniform magnetic field is obtained. It is shown that the magnetic field induces in the cross section oscillations having an amplitude considerably larger than the corrections determined from the perturbation-theory series."
  },
  {
    "bbox": [
      454,
      2076,
      1133,
      2394
    ],
    "category": "Formula",
    "text": "$$ \\sigma^{\\pm} = \\pm r_0^2 \\frac{\\eta}{\\mu} \\int_{-1}^{1} d\\beta \\int_{-\\infty}^{\\infty} \\frac{dx}{\\sin^2 x} \\exp \\left[ -i \\left( \\beta \\pm \\frac{1}{\\mu} \\right) x \\right] \\\\ \\times \\left\\{ \\begin{aligned} & \\frac{\\beta_+ \\beta_-}{v_+^2} e^{ix} \\sin^2(x\\beta_+ v_+) \\\\ & - \\frac{\\beta_+ \\beta_-}{v_-^2} e^{-ix} \\sin^2(x\\beta_- v_-) \\\\ & - \\left( \\frac{\\beta}{v_- v_+} + \\frac{\\beta \\pm 1/\\mu}{v_-^2 v_+^2} \\right) \\sin(x\\beta_+ v_+) \\sin(x\\beta_- v_-) \\end{aligned} \\right\\}. \\quad (1) $$"
  },
  {
    "bbox": [
      454,
      2497,
      913,
      2524
    ],
    "category": "Page-footer",
    "text": "651 Sov. Phys. JETP 60 (4), October 1984"
  },
  {"bbox": [744, 527, 1015, 617], "category": "Picture"},
  {"bbox": [634, 1441, 911, 1464], "category": "Footnote", "text": "¹ The *mono-polarity invariant* [18, ch. 12]"}
]
```