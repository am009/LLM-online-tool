"""
OCR utility functions for PDF OCR Client.

Includes:
- Image resizing (smart_resize, PILimage_to_base64)
- PDF page to image conversion (fitz_doc_to_image)
- OCR output cleaning (OutputCleaner)
"""

import math
import base64
import json
import re
from io import BytesIO
from typing import Dict, List, Tuple, Optional, Any
from dataclasses import dataclass

import fitz
from PIL import Image


# ---------------------------------------------------------------------------
# Image utilities
# ---------------------------------------------------------------------------

def round_by_factor(number: int, factor: int) -> int:
    """Returns the closest integer to 'number' that is divisible by 'factor'."""
    return round(number / factor) * factor


def ceil_by_factor(number: int, factor: int) -> int:
    """Returns the smallest integer greater than or equal to 'number' that is divisible by 'factor'."""
    return math.ceil(number / factor) * factor


def floor_by_factor(number: int, factor: int) -> int:
    """Returns the largest integer less than or equal to 'number' that is divisible by 'factor'."""
    return math.floor(number / factor) * factor


def smart_resize(
    height: int,
    width: int,
    factor: int = 28,
    min_pixels: int = 3136,
    max_pixels: int = 11289600,
):
    """Rescales the image so that the following conditions are met:

    1. Both dimensions (height and width) are divisible by 'factor'.
    2. The total number of pixels is within the range ['min_pixels', 'max_pixels'].
    3. The aspect ratio of the image is maintained as closely as possible.
    """
    if max(height, width) / min(height, width) > 200:
        raise ValueError(
            f"absolute aspect ratio must be smaller than 200, got {max(height, width) / min(height, width)}"
        )
    h_bar = max(factor, round_by_factor(height, factor))
    w_bar = max(factor, round_by_factor(width, factor))
    if h_bar * w_bar > max_pixels:
        beta = math.sqrt((height * width) / max_pixels)
        h_bar = max(factor, floor_by_factor(height / beta, factor))
        w_bar = max(factor, floor_by_factor(width / beta, factor))
    elif h_bar * w_bar < min_pixels:
        beta = math.sqrt(min_pixels / (height * width))
        h_bar = ceil_by_factor(height * beta, factor)
        w_bar = ceil_by_factor(width * beta, factor)
        if h_bar * w_bar > max_pixels:
            beta = math.sqrt((h_bar * w_bar) / max_pixels)
            h_bar = max(factor, floor_by_factor(h_bar / beta, factor))
            w_bar = max(factor, floor_by_factor(w_bar / beta, factor))
    return h_bar, w_bar


def PILimage_to_base64(image, format='PNG'):
    buffered = BytesIO()
    image.save(buffered, format=format)
    base64_str = base64.b64encode(buffered.getvalue()).decode('utf-8')
    return f"data:image/{format.lower()};base64,{base64_str}"


# ---------------------------------------------------------------------------
# PDF / fitz utilities
# ---------------------------------------------------------------------------

def fitz_doc_to_image(doc, target_dpi=200, origin_dpi=None) -> Image.Image:
    """Convert a fitz page to a PIL Image.

    Args:
        doc: PyMuPDF page object.
        target_dpi: Target DPI for rendering.
        origin_dpi: Unused, kept for API compatibility.

    Returns:
        PIL Image in RGB mode.
    """
    mat = fitz.Matrix(target_dpi / 72, target_dpi / 72)
    pm = doc.get_pixmap(matrix=mat, alpha=False)

    if pm.width > 4500 or pm.height > 4500:
        mat = fitz.Matrix(72 / 72, 72 / 72)
        pm = doc.get_pixmap(matrix=mat, alpha=False)

    image = Image.frombytes('RGB', (pm.width, pm.height), pm.samples)
    return image


# ---------------------------------------------------------------------------
# Output cleaner
# ---------------------------------------------------------------------------

@dataclass
class CleanedData:
    """Data structure for cleaned data"""
    case_id: int
    original_type: str  # 'list' or 'str'
    original_length: int
    cleaned_data: List[Dict]
    cleaning_operations: Dict[str, Any]
    success: bool


class OutputCleaner:
    """Data Cleaner - Based on a simplified regex method"""

    def __init__(self):
        self.dict_pattern = re.compile(r'\{[^{}]*?"bbox"\s*:\s*\[[^\]]*?\][^{}]*?\}', re.DOTALL)
        self.bbox_pattern = re.compile(r'"bbox"\s*:\s*\[([^\]]+)\]')
        self.missing_delimiter_pattern = re.compile(r'\}\s*\{(?!")')

    def clean_list_data(self, data: List[Dict], case_id: int) -> CleanedData:
        print(f"🔧 Cleaning List data - Case {case_id}")
        print(f"  Original items: {len(data)}")

        cleaned_data = []
        operations = {
            'type': 'list',
            'bbox_fixes': 0,
            'removed_items': 0,
            'original_count': len(data)
        }

        for i, item in enumerate(data):
            if not isinstance(item, dict):
                operations['removed_items'] += 1
                continue

            if 'bbox' in item:
                bbox = item['bbox']
                if isinstance(bbox, list) and len(bbox) == 3:
                    print(f"  ⚠️ Item {i}: bbox has only 3 coordinates. Removing bbox, keeping category and text.")
                    new_item = {}
                    if 'category' in item:
                        new_item['category'] = item['category']
                    if 'text' in item:
                        new_item['text'] = item['text']
                    if new_item:
                        cleaned_data.append(new_item)
                        operations['bbox_fixes'] += 1
                    else:
                        operations['removed_items'] += 1
                    continue
                elif isinstance(bbox, list) and len(bbox) == 4:
                    cleaned_data.append(item.copy())
                    continue
                else:
                    print(f"  ❌ Item {i}: Abnormal bbox format, skipping.")
                    operations['removed_items'] += 1
                    continue
            else:
                if 'category' in item:
                    cleaned_data.append(item.copy())
                    continue
                else:
                    operations['removed_items'] += 1

        operations['final_count'] = len(cleaned_data)
        print(f"  ✅ Cleaning complete: {len(cleaned_data)} items, {operations['bbox_fixes']} bbox fixes, {operations['removed_items']} items removed")

        return CleanedData(
            case_id=case_id,
            original_type='list',
            original_length=len(data),
            cleaned_data=cleaned_data,
            cleaning_operations=operations,
            success=True
        )

    def clean_string_data(self, data_str: str, case_id: int) -> CleanedData:
        print(f"🔧 Cleaning String data - Case {case_id}")
        print(f"  Original length: {len(data_str):,}")

        operations = {
            'type': 'str',
            'original_length': len(data_str),
            'delimiter_fixes': 0,
            'tail_truncated': False,
            'truncated_length': 0,
            'duplicate_dicts_removed': 0,
            'final_objects': 0
        }

        try:
            data_str, delimiter_fixes = self._fix_missing_delimiters(data_str)
            operations['delimiter_fixes'] = delimiter_fixes

            data_str, tail_truncated = self._truncate_last_incomplete_element(data_str)
            operations['tail_truncated'] = tail_truncated
            operations['truncated_length'] = len(data_str)

            data_str, duplicate_removes = self._remove_duplicate_complete_dicts_preserve_order(data_str)
            operations['duplicate_dicts_removed'] = duplicate_removes

            data_str = self._ensure_json_format(data_str)

            final_data = self._parse_final_json(data_str)

            if final_data is not None:
                operations['final_objects'] = len(final_data)
                print(f"  ✅ Cleaning complete: {len(final_data)} objects")
                return CleanedData(
                    case_id=case_id,
                    original_type='str',
                    original_length=operations['original_length'],
                    cleaned_data=final_data,
                    cleaning_operations=operations,
                    success=True
                )
            else:
                raise Exception("Could not parse the cleaned data")

        except Exception as e:
            print(f"  ❌ Cleaning failed: {e}")
            return CleanedData(
                case_id=case_id,
                original_type='str',
                original_length=operations['original_length'],
                cleaned_data=[],
                cleaning_operations=operations,
                success=False
            )

    def _fix_missing_delimiters(self, text: str) -> Tuple[str, int]:
        fixes = 0

        def replace_delimiter(match):
            nonlocal fixes
            fixes += 1
            return '},{'

        text = self.missing_delimiter_pattern.sub(replace_delimiter, text)
        if fixes > 0:
            print(f"    ✅ Fixed {fixes} missing delimiters")
        return text, fixes

    def _truncate_last_incomplete_element(self, text: str) -> Tuple[str, bool]:
        needs_truncation = (
            len(text) > 50000 or
            not text.strip().endswith(']')
        )

        if needs_truncation:
            bbox_count = text.count('{"bbox":')
            if bbox_count <= 1:
                print(f"    ⚠️ Only {bbox_count} dict objects found, skipping truncation to avoid deleting all content")
                return text, False

            last_bbox_pos = text.rfind('{"bbox":')
            if last_bbox_pos > 0:
                truncated_text = text[:last_bbox_pos].rstrip()
                if truncated_text.endswith(','):
                    truncated_text = truncated_text[:-1]
                print(f"    ✂️ Truncated the last incomplete element, length reduced from {len(text):,} to {len(truncated_text):,}")
                return truncated_text, True

        return text, False

    def _remove_duplicate_complete_dicts_preserve_order(self, text: str) -> Tuple[str, int]:
        dict_matches = list(self.dict_pattern.finditer(text))
        if not dict_matches:
            return text, 0

        print(f"    📊 Found {len(dict_matches)} dict objects")

        unique_dicts = []
        seen_dict_strings = set()
        total_duplicates = 0

        for match in dict_matches:
            dict_str = match.group()
            if dict_str not in seen_dict_strings:
                unique_dicts.append(dict_str)
                seen_dict_strings.add(dict_str)
            else:
                total_duplicates += 1

        if total_duplicates > 0:
            new_text = '[' + ', '.join(unique_dicts) + ']'
            print(f"    ✅ Removed {total_duplicates} duplicate dicts, keeping {len(unique_dicts)} unique dicts (order preserved)")
            return new_text, total_duplicates
        else:
            print(f"    ✅ No duplicate dict objects found")
            return text, 0

    def _ensure_json_format(self, text: str) -> str:
        text = text.strip()
        if not text.startswith('['):
            text = '[' + text
        if not text.endswith(']'):
            text = text.rstrip(',').rstrip()
            text += ']'
        return text

    def _parse_final_json(self, text: str) -> Optional[List[Dict]]:
        try:
            data = json.loads(text)
            if isinstance(data, list):
                return data
        except json.JSONDecodeError as e:
            print(f"    ❌ JSON parsing failed: {e}")

            valid_dicts = []
            for match in self.dict_pattern.finditer(text):
                dict_str = match.group()
                try:
                    dict_obj = json.loads(dict_str)
                    valid_dicts.append(dict_obj)
                except:
                    continue

            if valid_dicts:
                print(f"    ✅ Extracted {len(valid_dicts)} valid dicts")
                return valid_dicts

            return self._handle_single_incomplete_dict(text)

        return None

    def _handle_single_incomplete_dict(self, text: str) -> Optional[List[Dict]]:
        if not text.strip().startswith('[{"bbox":'):
            return None

        try:
            bbox_match = re.search(r'"bbox"\s*:\s*\[([^\]]+)\]', text)
            if not bbox_match:
                return None

            bbox_str = bbox_match.group(1)
            bbox_coords = [int(x.strip()) for x in bbox_str.split(',')]
            if len(bbox_coords) != 4:
                return None

            category_match = re.search(r'"category"\s*:\s*"([^"]+)"', text)
            category = category_match.group(1) if category_match else "Text"

            text_match = re.search(r'"text"\s*:\s*"([^"]{0,10000})', text)
            text_content = text_match.group(1) if text_match else ""

            fixed_dict = {
                "bbox": bbox_coords,
                "category": category
            }
            if text_content:
                fixed_dict["text"] = text_content

            print(f"    🔧 Special fix: single incomplete dict → {fixed_dict}")
            return [fixed_dict]

        except Exception as e:
            print(f"    ❌ Special fix failed: {e}")
            return None

    def remove_duplicate_category_text_pairs_and_bbox(self, data_list: List[dict], case_id: int) -> List[dict]:
        if not data_list or len(data_list) <= 1:
            print(f"    📊 Data length {len(data_list)} <= 1, skipping deduplication check")
            return data_list

        print(f"    📊 Original data length: {len(data_list)}")

        category_text_pairs = {}
        for i, item in enumerate(data_list):
            if isinstance(item, dict) and 'category' in item and 'text' in item:
                pair_key = (item.get('category', ''), item.get('text', ''))
                if pair_key not in category_text_pairs:
                    category_text_pairs[pair_key] = []
                category_text_pairs[pair_key].append(i)

        bbox_pairs = {}
        for i, item in enumerate(data_list):
            if isinstance(item, dict) and 'bbox' in item:
                bbox = item.get('bbox')
                if isinstance(bbox, list) and len(bbox) > 0:
                    bbox_key = tuple(bbox)
                    if bbox_key not in bbox_pairs:
                        bbox_pairs[bbox_key] = []
                    bbox_pairs[bbox_key].append(i)

        duplicates_to_remove = set()

        for pair_key, positions in category_text_pairs.items():
            if len(positions) >= 5:
                category, text = pair_key
                positions_to_remove = positions[1:]
                duplicates_to_remove.update(positions_to_remove)
                print(f"    🔍 Found duplicate category-text pair: category='{category}', first 50 chars of text='{text[:50]}...'")
                print(f"        Count: {len(positions)}, removing at positions: {positions_to_remove}")

        for bbox_key, positions in bbox_pairs.items():
            if len(positions) >= 2:
                positions_to_remove = positions[1:]
                duplicates_to_remove.update(positions_to_remove)
                print(f"    🔍 Found duplicate bbox: {list(bbox_key)}")
                print(f"        Count: {len(positions)}, removing at positions: {positions_to_remove}")

        if not duplicates_to_remove:
            print(f"    ✅ No category-text pairs or bboxes found exceeding the duplication threshold")
            return data_list

        cleaned_data = []
        removed_count = 0
        for i, item in enumerate(data_list):
            if i not in duplicates_to_remove:
                cleaned_data.append(item)
            else:
                removed_count += 1

        print(f"    ✅ Deduplication complete: Removed {removed_count} duplicate items")
        print(f"    📊 Cleaned data length: {len(cleaned_data)}")
        return cleaned_data

    def clean_model_output(self, model_output):
        try:
            if isinstance(model_output, list):
                result = self.clean_list_data(model_output, case_id=0)
            else:
                result = self.clean_string_data(str(model_output), case_id=0)

            if result and hasattr(result, 'success') and result.success and result.cleaned_data:
                original_data = result.cleaned_data
                deduplicated_data = self.remove_duplicate_category_text_pairs_and_bbox(original_data, case_id=0)
                result.cleaned_data = deduplicated_data
            return result.cleaned_data
        except Exception as e:
            print(f"❌ Case cleaning failed: {e}")
            return model_output
