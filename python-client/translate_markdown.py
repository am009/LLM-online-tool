#!/usr/bin/env python3
"""
Markdown翻译脚本 - 使用OpenAI兼容的流式API将Markdown文件翻译为另一种语言。

用法:
    python translate_markdown.py input.md -o output.md
    python translate_markdown.py input.md -o output.md --alternating
    python translate_markdown.py input.md -o output.md --api-key sk-xxx --model gpt-4
    python translate_markdown.py input.md -o output.md --endpoint https://api.deepseek.com/v1/chat/completions
"""

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path

import httpx


DEFAULT_PROMPT = "将以下文本翻译为中文，注意只需要输出翻译后的结果，不要额外解释：\n\nORIGTEXT"


def is_skip_block(text: str) -> bool:
    """检测段落是否无需翻译（纯公式块或代码块）。"""
    return is_pure_formula_block(text) or is_code_block(text)


def is_code_block(text: str) -> bool:
    """检测段落是否是以 ``` 包裹的代码块。"""
    stripped = text.strip()
    return stripped.startswith("```") and stripped.endswith("```") and stripped.count("```") == 2


def is_pure_formula_block(text: str) -> bool:
    """检测段落是否仅包含 $$...$$  包裹的公式（可以有前后空白）。"""
    stripped = text.strip()
    if not stripped.startswith("$$") or not stripped.endswith("$$"):
        return False
    # 去掉首尾的 $$，检查中间是否还有未配对的 $$
    inner = stripped[2:-2]
    # 如果内部还包含 $$，说明不止一个公式块或者有其他内容
    # 但允许内部有 $ （行内公式）
    # 简单判断：去掉首尾$$后，不应再有$$
    if "$$" in inner:
        return False
    return True


def parse_blocks(content: str) -> list[str]:
    """按照两个及以上连续换行分割段落，与JS端逻辑一致。"""
    # 将CRLF转为LF，将只有空白的行转为空行
    normalized = content.replace("\r\n", "\n")
    normalized = re.sub(r"^[ \t]+$", "", normalized, flags=re.MULTILINE)
    # 按两个及以上换行分割
    blocks = re.split(r"\n{2,}", normalized)
    blocks = [b.strip() for b in blocks if b.strip()]
    return blocks


def translate_block_streaming(
    text: str,
    prompt: str,
    api_key: str,
    endpoint: str,
    model: str,
    temperature: float | None = None,
    max_tokens: int = 2000,
) -> str:
    """调用OpenAI兼容的流式API翻译单个文本块。"""
    user_content = prompt.replace("ORIGTEXT", text)

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }

    body: dict = {
        "model": model,
        "messages": [{"role": "user", "content": user_content}],
        "max_tokens": max_tokens,
        "stream": True,
    }
    if temperature is not None:
        body["temperature"] = temperature

    result = ""
    with httpx.Client(timeout=120) as client:
        with client.stream("POST", endpoint, headers=headers, json=body) as response:
            if response.status_code != 200:
                error_body = response.read().decode()
                raise RuntimeError(
                    f"API请求失败: {response.status_code} - {error_body}"
                )
            for line in response.iter_lines():
                line = line.strip()
                if not line or not line.startswith("data: "):
                    continue
                data = line[6:]  # 去掉 "data: "
                if data == "[DONE]":
                    break
                try:
                    parsed = json.loads(data)
                    content = parsed.get("choices", [{}])[0].get("delta", {}).get("content", "")
                    if content:
                        result += content
                        # 流式输出到终端
                        print(content, end="", flush=True)
                except json.JSONDecodeError:
                    continue

    # 清除 <think>...</think> 标签
    think_match = re.search(r"<think>[\s\S]*?</think>\s*", result)
    if think_match:
        result = re.sub(r"<think>[\s\S]*?</think>\s*", "", result).strip()

    return result


def get_progress_path(input_path: str) -> Path:
    """获取翻译进度文件路径，与输入文件同名但后缀为 .translation_progress.json。"""
    p = Path(input_path)
    return p.parent / f"{p.stem}.translation_progress.json"


def load_progress(progress_path: Path) -> dict:
    """加载翻译进度文件，返回完整的进度字典。"""
    if progress_path.exists():
        with open(progress_path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def build_cache_from_progress(progress: dict) -> dict[str, str]:
    """从进度文件构建 {original_text: translated_text} 的缓存映射。"""
    cache: dict[str, str] = {}
    for block in progress.get("blocks", []):
        orig = block.get("original_text", "")
        trans = block.get("translated_text", "")
        if orig and trans:
            cache[orig] = trans
    return cache


def save_progress(progress_path: Path, input_name: str, blocks_data: list[dict]):
    """保存翻译进度到JSON文件。"""
    progress = {
        "filename": Path(input_name).name,
        "timestamp": int(time.time() * 1000),
        "blocks": blocks_data,
    }
    with open(progress_path, "w", encoding="utf-8") as f:
        json.dump(progress, f, ensure_ascii=False, indent=2)


def main():
    parser = argparse.ArgumentParser(description="使用LLM翻译Markdown文件")
    parser.add_argument("input", help="输入的Markdown文件路径")
    parser.add_argument("-o", "--output", required=True, help="输出的Markdown文件路径")
    parser.add_argument("--alternating", action="store_true", help="生成原文和译文交替版本")
    parser.add_argument("--api-key", default="", help="API Key（也可通过OPENAI_API_KEY环境变量设置）")
    parser.add_argument("--endpoint", default="http://172.19.193.39:11434/v1/chat/completions", help="API端点URL")
    parser.add_argument("--model", default="warrenwjk/HY-MT1.5-7B:latest", help="模型名称")
    parser.add_argument("--prompt", default=DEFAULT_PROMPT, help="翻译提示词，用ORIGTEXT代替原文")
    parser.add_argument("--temperature", type=float, default=None, help="Temperature参数")
    parser.add_argument("--max-tokens", type=int, default=2000, help="最大token数")
    parser.add_argument("--no-cache", action="store_true", help="忽略缓存，强制重新翻译所有段落")
    args = parser.parse_args()

    # API Key: 命令行参数 > 环境变量
    api_key = args.api_key or os.environ.get("OPENAI_API_KEY", "sk-free")

    # 检查 prompt 中 ORIGTEXT 出现次数
    orig_count = args.prompt.count("ORIGTEXT")
    if orig_count != 1:
        print(f"错误：prompt中必须恰好包含一个ORIGTEXT占位符，当前有{orig_count}个", file=sys.stderr)
        sys.exit(1)

    # 读取输入文件
    with open(args.input, "r", encoding="utf-8") as f:
        content = f.read()

    # 初始化进度文件
    progress_path = get_progress_path(args.input)

    # 加载已有缓存
    text_cache: dict[str, str] = {}
    if not args.no_cache:
        progress = load_progress(progress_path)
        text_cache = build_cache_from_progress(progress)
    if text_cache:
        print(f"已有 {len(text_cache)} 个段落的缓存（进度文件: {progress_path}）", file=sys.stderr)

    blocks = parse_blocks(content)
    total = len(blocks)
    print(f"共 {total} 个段落\n", file=sys.stderr)

    translated_blocks: list[str] = []
    blocks_data: list[dict] = []

    for i, block in enumerate(blocks):
        # 检查缓存（按原文内容匹配）
        if block in text_cache:
            print(f"[{i + 1}/{total}] 使用缓存", file=sys.stderr)
            translation = text_cache[block]
            translated_blocks.append(translation)
            blocks_data.append({"original_text": block, "translated_text": translation})
            continue

        if is_skip_block(block):
            translated_blocks.append(block)
            blocks_data.append({"original_text": block, "translated_text": block})
            save_progress(progress_path, args.input, blocks_data)
            continue

        print(f"[{i + 1}/{total}] 翻译中...", file=sys.stderr)
        translation = translate_block_streaming(
            text=block,
            prompt=args.prompt,
            api_key=api_key,
            endpoint=args.endpoint,
            model=args.model,
            temperature=args.temperature,
            max_tokens=args.max_tokens,
        )
        print("\n", file=sys.stderr)
        translated_blocks.append(translation)
        blocks_data.append({"original_text": block, "translated_text": translation})

        # 每翻译完一段就保存进度
        save_progress(progress_path, args.input, blocks_data)

    # 构建输出内容
    translated_content = "\n\n".join(b.strip() for b in translated_blocks) + "\n"
    alternating_content = None

    if args.alternating:
        output_parts: list[str] = []
        for i in range(total):
            original = blocks[i].strip()
            translated = translated_blocks[i].strip()
            output_parts.append(original)
            if translated != original:
                output_parts.append(translated)
        alternating_content = "\n\n".join(output_parts) + "\n"

    # 写入输出文件
    output_content = alternating_content if args.alternating else translated_content
    with open(args.output, "w", encoding="utf-8") as f:
        f.write(output_content)

    print(f"翻译完成，已写入 {args.output}", file=sys.stderr)
    print(f"进度已保存到 {progress_path}", file=sys.stderr)


if __name__ == "__main__":
    main()
