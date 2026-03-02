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
import hashlib
import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path

import httpx


DEFAULT_PROMPT = "将以下文本翻译为中文，注意只需要输出翻译后的结果，不要额外解释：\n\nORIGTEXT"


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


def get_log_dir(log_root: str, content_hash: str, input_name: str) -> Path:
    """获取或创建缓存目录。

    目录结构: log_root/<timestamp>_<hash前8位>_<文件名>/
    如果已有同hash的目录则复用，否则新建。
    """
    log_root_path = Path(log_root)
    log_root_path.mkdir(parents=True, exist_ok=True)

    short_hash = content_hash[:8]

    # 查找已有的同hash目录
    for entry in sorted(log_root_path.iterdir()):
        if entry.is_dir() and f"_{short_hash}_" in entry.name:
            return entry

    # 新建目录
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    stem = Path(input_name).stem
    dir_name = f"{timestamp}_{short_hash}_{stem}"
    new_dir = log_root_path / dir_name
    new_dir.mkdir(parents=True, exist_ok=True)
    return new_dir


def load_block_cache(log_dir: Path) -> dict[int, str]:
    """从缓存目录加载已翻译的段落。返回 {段落索引: 翻译内容}。"""
    cache: dict[int, str] = {}
    for f in log_dir.glob("block_*.md"):
        # 文件名格式: block_0003.md
        match = re.match(r"block_(\d+)\.md$", f.name)
        if match:
            idx = int(match.group(1))
            cache[idx] = f.read_text(encoding="utf-8")
    return cache


def save_block_cache(log_dir: Path, index: int, content: str):
    """将单个段落的翻译结果保存到缓存。"""
    filename = f"block_{index:04d}.md"
    (log_dir / filename).write_text(content, encoding="utf-8")


def save_full_results(log_dir: Path, translated_content: str, alternating_content: str | None):
    """保存完整的翻译结果到缓存目录。"""
    (log_dir / "translated.md").write_text(translated_content, encoding="utf-8")
    if alternating_content is not None:
        (log_dir / "alternating.md").write_text(alternating_content, encoding="utf-8")


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
    parser.add_argument("--log-dir", default="translate_log", help="缓存日志目录（默认: translate_log）")
    parser.add_argument("--no-cache", action="store_true", help="忽略缓存，强制重新翻译所有段落")
    args = parser.parse_args()

    # API Key: 命令行参数 > 环境变量
    api_key = args.api_key or os.environ.get("OPENAI_API_KEY", "")
    if not api_key:
        print("错误：请通过 --api-key 或环境变量 OPENAI_API_KEY 提供API Key", file=sys.stderr)
        sys.exit(1)

    # 检查 prompt 中 ORIGTEXT 出现次数
    orig_count = args.prompt.count("ORIGTEXT")
    if orig_count != 1:
        print(f"错误：prompt中必须恰好包含一个ORIGTEXT占位符，当前有{orig_count}个", file=sys.stderr)
        sys.exit(1)

    # 读取输入文件
    with open(args.input, "r", encoding="utf-8") as f:
        content = f.read()

    # 计算原文SHA256，用于缓存
    content_hash = hashlib.sha256(content.encode("utf-8")).hexdigest()

    # 初始化缓存目录
    log_dir = get_log_dir(args.log_dir, content_hash, args.input)
    print(f"缓存目录: {log_dir}", file=sys.stderr)

    # 保存原文到缓存目录
    original_path = log_dir / "original.md"
    if not original_path.exists():
        original_path.write_text(content, encoding="utf-8")

    # 加载已有缓存
    block_cache = {} if args.no_cache else load_block_cache(log_dir)
    if block_cache:
        print(f"已有 {len(block_cache)} 个段落的缓存", file=sys.stderr)

    blocks = parse_blocks(content)
    total = len(blocks)
    print(f"共 {total} 个段落\n", file=sys.stderr)

    translated_blocks: list[str] = []

    for i, block in enumerate(blocks):
        # 检查缓存
        if i in block_cache:
            print(f"[{i + 1}/{total}] 使用缓存", file=sys.stderr)
            translated_blocks.append(block_cache[i])
            continue

        if is_pure_formula_block(block):
            translated_blocks.append(block)
            save_block_cache(log_dir, i, block)
            continue

        print("", file=sys.stderr)
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

        # 每翻译完一段就保存缓存
        save_block_cache(log_dir, i, translation)

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

    # 保存完整结果到缓存目录
    save_full_results(log_dir, translated_content, alternating_content)

    print(f"翻译完成，已写入 {args.output}", file=sys.stderr)
    print(f"缓存已保存到 {log_dir}", file=sys.stderr)


if __name__ == "__main__":
    main()
