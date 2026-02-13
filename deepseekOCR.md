### Deekseek OCR model input output example

prompt: (send the image first)

```
\n<|grounding|>Convert the document to markdown.
```

result:

```
<|ref|>sub_title<|/ref|><|det|>[[130, 72, 623, 97]]<|/det|>
## Asprise OCR and Barcode Recognition

<|ref|>text<|/ref|><|det|>[[130, 107, 854, 143]]<|/det|>
High performance, royalty- free OCR and barcode recognition on Windows, Linux, Mac OS and Unix.

<|ref|>text<|/ref|><|det|>[[130, 153, 855, 244]]<|/det|>
Asprise OCR (optical character recognition) and barcode recognition SDK offers a high performance library for you to equip your Java applications (Java applets, web applications, Swing/JavaFX components, JEE enterprise applications), C#/VB.NET applications, and C/C++/Python applications with functionality of extracting text and barcode information from scanned documents.

<|ref|>sub_title<|/ref|><|det|>[[130, 260, 484, 280]]<|/det|>
## Convert Images To Searchable PDF

<|ref|>text<|/ref|><|det|>[[130, 290, 868, 326]]<|/det|>
With a few lines of code, you can convert various formats of images such as JPEG, PNG, and TIFF into searchable PDF.

<|ref|>table<|/ref|><|det|>[[130, 335, 869, 391]]<|/det|>

<table><tr><td>PDF Output Formats</td><td>Remarks</td></tr><tr><td>PDF</td><td>Normal PDF</td></tr><tr><td>PDF/A</td><td>ISO 19005</td></tr></table>

<|ref|>sub_title<|/ref|><|det|>[[131, 405, 422, 424]]<|/det|>
## All Popular Barcode Formats

<|ref|>text<|/ref|><|det|>[[130, 434, 830, 471]]<|/det|>
All popular barcode formats are supported: EAN- 8, EAN- 13, UPC- A, UPC- E, ISBN- 10, ISBN- 13, Interleaved 2 of 5, Code 39, Code 128, PDF417, and QR Code.

<|ref|>image<|/ref|><|det|>[[132, 508, 398, 562]]<|/det|>

<|ref|>image<|/ref|><|det|>[[575, 511, 768, 654]]<|/det|>
```

This string is a mix of:
* **Markdown-like Syntax:** It uses Markdown conventions for formatting, such as `#` for headings and `**` for bold text.
* **HTML Tags:** It directly embeds HTML `<table>` tags to structure tabular data.
* **Custom Tags:** The format uses a set of unique tags to provide additional metadata:
* `<|ref|>` and `<|/ref|>`: These tags appear to act as "reference" or "type" markers. They enclose a word that categorizes the succeeding content, such as `title`, `text`, or `table`.
* `<|det|>` and `<|/det|>`: These tags likely stand for "details" or "detection" and enclose what appear to be coordinates `[[45, 90, 380, 114]]`. These represent the bounding box or location of the corresponding element on an original document page.
All coordinates are normalized into 1000 bins.