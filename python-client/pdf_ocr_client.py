#!/usr/bin/env python3
"""
PDF OCR Client - Python implementation of pdfocr.js functionality

This script processes PDF files using OCR API and exports results to markdown format.

Features:
1. Converts PDF pages to images with dimensions that are multiples of 28
2. Recognizes each page sequentially using OCR API
3. Maintains a .ocr_progress.json file next to the PDF (compatible with web version)
4. Exports markdown with extracted images to output folder

Usage:
    python pdf_ocr_client.py <pdf_path> <output_folder> [--api-base <url>] [--resume]
"""

import os
import sys
import json
import argparse
import tempfile
import shutil
from pathlib import Path
from typing import List, Dict, Optional, Tuple
import requests
from PIL import Image
import fitz  # PyMuPDF

# Import utility functions
from utils.image_utils import smart_resize, PILimage_to_base64
from utils.doc_utils import fitz_doc_to_image
from utils.output_cleaner import OutputCleaner


class PDFOCRClient:
    """PDF OCR Client that mimics pdfocr.js functionality"""

    def __init__(self, pdf_path: str, output_folder: str, api_base: str = "http://localhost:5123"):
        """
        Initialize PDF OCR Client

        Args:
            pdf_path: Path to the PDF file
            output_folder: Path to the output folder for markdown and images
            api_base: Base URL for the OCR API
        """
        self.pdf_path = Path(pdf_path)
        self.output_folder = Path(output_folder)
        self.api_base = api_base.rstrip('/')

        # Validate inputs
        if not self.pdf_path.exists():
            raise FileNotFoundError(f"PDF file not found: {pdf_path}")

        if not self.pdf_path.suffix.lower() == '.pdf':
            raise ValueError(f"File must be a PDF: {pdf_path}")

        # Create output folder
        self.output_folder.mkdir(parents=True, exist_ok=True)

        # Progress file path (next to the PDF)
        self.progress_file = self.pdf_path.parent / f"{self.pdf_path}.ocr_progress.json"

        # Initialize page results storage
        self.page_results = {}

        # Initialize output cleaner
        self.cleaner = OutputCleaner()

        # Temporary folder for images
        self.temp_folder = None

        print(f"📄 PDF: {self.pdf_path.name}")
        print(f"📁 Output folder: {self.output_folder}")
        print(f"💾 Progress file: {self.progress_file}")
        print(f"🌐 API base: {self.api_base}")

    def check_api_health(self) -> bool:
        """Check if the OCR API is available"""
        try:
            response = requests.get(f"{self.api_base}/health", timeout=20)
            if response.status_code == 200:
                data = response.json()
                print(f"✅ API is healthy, model loaded: {data.get('model_loaded', False)}")
                return data.get('model_loaded', False)
            else:
                print(f"❌ API health check failed: {response.status_code}")
                return False
        except Exception as e:
            print(f"❌ Cannot connect to API: {e}")
            return False

    def load_progress(self) -> bool:
        """Load progress from .ocr_progress.json file if it exists"""
        if not self.progress_file.exists():
            print("ℹ️  No progress file found, starting fresh")
            return False

        try:
            with open(self.progress_file, 'r', encoding='utf-8') as f:
                progress_data = json.load(f)

            # Validate format
            if 'filename' not in progress_data or 'pages' not in progress_data:
                print("⚠️  Invalid progress file format")
                return False

            # Load page results
            for page_num_str, result in progress_data['pages'].items():
                page_num = int(page_num_str)
                self.page_results[page_num] = result

            print(f"✅ Loaded progress: {len(self.page_results)} pages already recognized")
            return True

        except Exception as e:
            print(f"⚠️  Failed to load progress: {e}")
            return False

    def save_progress(self):
        """Save progress to .ocr_progress.json file"""
        if not self.page_results:
            print("⚠️  No results to save")
            return

        progress_data = {
            "filename": self.pdf_path.name,
            "pages": {str(k): v for k, v in self.page_results.items()}
        }

        try:
            with open(self.progress_file, 'w', encoding='utf-8') as f:
                json.dump(progress_data, f, ensure_ascii=False, indent=2)
            print(f"💾 Progress saved: {len(self.page_results)} pages")
        except Exception as e:
            print(f"❌ Failed to save progress: {e}")

    def convert_pdf_to_images(self) -> List[Tuple[int, Image.Image, Tuple[int, int]]]:
        """
        Convert PDF pages to images with dimensions that are multiples of 28

        Returns:
            List of tuples: (page_num, original_image, (resized_width, resized_height))
        """
        print(f"\n📄 Converting PDF to images...")

        # Create temporary folder
        self.temp_folder = tempfile.mkdtemp(prefix="pdf_ocr_")
        print(f"📁 Temporary folder: {self.temp_folder}")

        images_info = []

        # Load PDF
        doc = fitz.open(self.pdf_path)
        total_pages = doc.page_count
        print(f"📊 Total pages: {total_pages}")

        for page_num in range(1, total_pages + 1):
            page = doc[page_num - 1]  # fitz uses 0-based indexing

            # Convert page to image
            image = fitz_doc_to_image(page, target_dpi=200)

            # Calculate resized dimensions (multiples of 28)
            resized_height, resized_width = smart_resize(
                image.height,
                image.width,
                factor=28,
                min_pixels=3136,
                max_pixels=11289600
            )

            # Save original image to temp folder
            image_path = os.path.join(self.temp_folder, f"page_{page_num}.png")
            image.save(image_path)

            images_info.append((page_num, image, (resized_width, resized_height)))

            print(f"  Page {page_num}/{total_pages}: {image.width}x{image.height} -> {resized_width}x{resized_height}")

        doc.close()
        return images_info

    def recognize_page(self, page_num: int, image: Image.Image, target_size: Tuple[int, int]) -> Optional[List[Dict]]:
        """
        Recognize a single page using OCR API

        Args:
            page_num: Page number
            image: PIL Image object
            target_size: Target (width, height) for resizing

        Returns:
            List of OCR result blocks or None if failed
        """
        print(f"\n🔍 Recognizing page {page_num}...")

        try:
            # Resize image to target size
            resized_image = image.resize(target_size)

            # Convert to base64
            image_base64 = PILimage_to_base64(resized_image, format='PNG')

            # Prepare API request
            payload = {
                "image": image_base64,
                "prompt_type": "prompt_layout_all_en",
                "temperature": 0.1,
                "top_p": 1.0,
                "max_new_tokens": 12000,
                "stream": True
            }

            # Call OCR API with streaming
            response = requests.post(
                f"{self.api_base}/ocr",
                json=payload,
                stream=True,
                timeout=300
            )

            if response.status_code != 200:
                print(f"❌ API request failed: {response.status_code}")
                return None

            # Collect streaming response and print in real-time
            full_response = ""
            print(f"  📡 Streaming response:")
            print("  " + "="*60)
            for line in response.iter_lines():
                if line:
                    try:
                        data = json.loads(line.decode('utf-8'))
                        if 'response' in data:
                            chunk = data['response']
                            full_response += chunk
                            # Print the actual content as it arrives
                            print(chunk, end='', flush=True)
                        if data.get('done', False):
                            break
                    except json.JSONDecodeError:
                        continue

            print(f"\n  " + "="*60)
            print(f"  Raw response length: {len(full_response)} characters")

            # Clean the response using OutputCleaner
            cleaned_result = self.cleaner.clean_model_output(full_response)

            if cleaned_result and isinstance(cleaned_result, list):
                print(f"  ✅ Recognized {len(cleaned_result)} blocks")
                return cleaned_result
            else:
                print(f"  ⚠️  Cleaning failed, trying to parse as JSON...")
                # Try to parse directly
                try:
                    result = json.loads(full_response)
                    if isinstance(result, list):
                        return result
                except:
                    pass
                return None

        except Exception as e:
            print(f"❌ Recognition failed: {e}")
            return None

    def recognize_all_pages(self):
        """
        Recognize all pages in the PDF

        Automatically resumes from existing progress if available
        """
        # Automatically load existing progress
        self.load_progress()

        # Convert PDF to images
        images_info = self.convert_pdf_to_images()

        # Recognize each page
        for page_num, image, target_size in images_info:
            # Skip if already recognized
            if page_num in self.page_results:
                print(f"\n⏭️  Skipping page {page_num} (already recognized)")
                continue

            # Recognize page
            result = self.recognize_page(page_num, image, target_size)

            if result:
                self.page_results[page_num] = result
                # Save progress after each page
                self.save_progress()
            else:
                print(f"⚠️  Page {page_num} recognition failed, skipping...")

        print(f"\n✅ Recognition complete: {len(self.page_results)} pages")

    def export_to_markdown(self):
        """Export OCR results to markdown with images"""
        if not self.page_results:
            print("❌ No results to export")
            return

        print(f"\n📝 Exporting to markdown...")

        markdown = ""
        footnote_counter = 1
        images_to_extract = []

        # Get total pages
        max_page = max(self.page_results.keys())

        # Process pages in order
        for page_num in range(1, max_page + 1):
            page_result = self.page_results.get(page_num)
            if not page_result or not isinstance(page_result, list):
                continue

            # Process each block in the page
            i = 0
            while i < len(page_result):
                block = page_result[i]

                # Skip page headers and footers
                if block.get('category') in ['Page-footer', 'Page-header']:
                    i += 1
                    continue

                # Handle Picture blocks
                if block.get('category') == 'Picture':
                    bbox = block.get('bbox')
                    if bbox and len(bbox) == 4:
                        x1, y1, x2, y2 = bbox
                        image_name = f"{self.pdf_path.stem}_page_{page_num}_{x1}_{x2}_{y1}_{y2}.png"

                        # Store image info for extraction
                        images_to_extract.append({
                            'page_num': page_num,
                            'bbox': bbox,
                            'filename': image_name
                        })

                        # Check if next block is Caption
                        caption = ''
                        if i + 1 < len(page_result) and page_result[i + 1].get('category') == 'Caption':
                            caption = page_result[i + 1].get('text', '')
                            i += 1  # Skip the caption block

                        # Add image reference to markdown
                        if caption:
                            markdown += f"![{caption}](./{image_name})\n\n"
                        else:
                            markdown += f"![](./{image_name})\n\n"

                    i += 1
                    continue

                # Handle Footnote blocks
                if block.get('category') == 'Footnote':
                    text = block.get('text', '').strip()
                    if text:
                        markdown += f"[^{footnote_counter}]: {text}\n\n"
                        footnote_counter += 1
                    i += 1
                    continue

                # Handle other text blocks
                text = block.get('text', '').strip()
                if text:
                    markdown += text + '\n\n'

                i += 1

        # Save markdown file
        markdown_path = self.output_folder / f"{self.pdf_path.stem}.md"
        with open(markdown_path, 'w', encoding='utf-8') as f:
            f.write(markdown)
        print(f"✅ Markdown saved: {markdown_path}")

        # Extract and save images
        if images_to_extract:
            self.extract_images(images_to_extract)

        print(f"✅ Export complete: {len(images_to_extract)} images extracted")

    def extract_images(self, images_info: List[Dict]):
        """
        Extract image regions from PDF pages and save them

        Args:
            images_info: List of dicts with 'page_num', 'bbox', and 'filename'
        """
        print(f"\n🖼️  Extracting {len(images_info)} images...")

        # Open PDF
        doc = fitz.open(self.pdf_path)

        for img_info in images_info:
            page_num = img_info['page_num']
            bbox = img_info['bbox']
            filename = img_info['filename']

            try:
                # Get page
                page = doc[page_num - 1]  # fitz uses 0-based indexing

                # Convert page to image
                page_image = fitz_doc_to_image(page, target_dpi=200)

                # Crop image using bbox
                x1, y1, x2, y2 = bbox
                cropped_image = page_image.crop((x1, y1, x2, y2))

                # Save image
                image_path = self.output_folder / filename
                cropped_image.save(image_path)

                print(f"  ✅ {filename}")

            except Exception as e:
                print(f"  ❌ Failed to extract {filename}: {e}")

        doc.close()

    def cleanup(self):
        """Clean up temporary files"""
        if self.temp_folder and os.path.exists(self.temp_folder):
            try:
                shutil.rmtree(self.temp_folder)
                print(f"🧹 Cleaned up temporary folder")
            except Exception as e:
                print(f"⚠️  Failed to clean up temporary folder: {e}")

    def run(self):
        """
        Run the complete OCR workflow

        Automatically resumes from existing progress if available
        """
        try:
            # Check API health
            if not self.check_api_health():
                print("❌ API is not available, please start the OCR server first")
                return False

            # Recognize all pages
            self.recognize_all_pages()

            # Export to markdown
            self.export_to_markdown()

            print("\n✅ All done!")
            return True

        except KeyboardInterrupt:
            print("\n⚠️  Interrupted by user")
            self.save_progress()
            return False
        except Exception as e:
            print(f"\n❌ Error: {e}")
            import traceback
            traceback.print_exc()
            return False
        finally:
            # Clean up
            self.cleanup()


def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(
        description="PDF OCR Client - Process PDF files using OCR API",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Process a PDF file (automatically resumes from existing progress)
  python pdf_ocr_client.py document.pdf output/

  # Use custom API endpoint
  python pdf_ocr_client.py document.pdf output/ --api-base http://192.168.1.100:5123

Note: The script automatically resumes from existing .ocr_progress.json file if found.
        """
    )

    parser.add_argument('pdf_path', help='Path to the PDF file')
    parser.add_argument('output_folder', help='Path to the output folder')
    parser.add_argument('--api-base', default='http://localhost:5123',
                        help='Base URL for the OCR API (default: http://localhost:5123)')

    args = parser.parse_args()

    # Create client and run
    client = PDFOCRClient(args.pdf_path, args.output_folder, args.api_base)
    success = client.run()

    sys.exit(0 if success else 1)


if __name__ == '__main__':
    main()
