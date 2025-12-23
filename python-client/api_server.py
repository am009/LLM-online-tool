#!/usr/bin/env python3
"""
PDF OCR API Server - Flask-based API wrapper for pdf_ocr_client.py

This server provides a REST API endpoint to process PDF files using OCR.
It returns a zip file containing markdown results, extracted images, and log files.

Usage:
    python api_server.py [--port PORT] [--host HOST]

API Endpoint:
    POST /api/ocr

    Request:
        - Multipart form data with:
          - pdf_file: PDF file to process
          - api_base: (optional) OCR API base URL (default: http://localhost:5123)

    Response:
        - ZIP file containing:
          - *.md: Markdown output
          - *.png: Extracted images
          - stdout.log.txt: Standard output log
          - stderr.log.txt: Standard error log
"""

import os
import sys
import io
import tempfile
import shutil
import zipfile
import argparse
from pathlib import Path
from contextlib import redirect_stdout, redirect_stderr
from flask import Flask, request, send_file, jsonify
from werkzeug.utils import secure_filename

# Import PDFOCRClient
from pdf_ocr_client import PDFOCRClient

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 100MB max file size


class OutputCapture:
    """Context manager to capture stdout and stderr"""

    def __init__(self):
        self.stdout_buffer = io.StringIO()
        self.stderr_buffer = io.StringIO()

    def __enter__(self):
        self.stdout_redirect = redirect_stdout(self.stdout_buffer)
        self.stderr_redirect = redirect_stderr(self.stderr_buffer)
        self.stdout_redirect.__enter__()
        self.stderr_redirect.__enter__()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.stdout_redirect.__exit__(exc_type, exc_val, exc_tb)
        self.stderr_redirect.__exit__(exc_type, exc_val, exc_tb)

    def get_stdout(self):
        return self.stdout_buffer.getvalue()

    def get_stderr(self):
        return self.stderr_buffer.getvalue()


def create_zip_from_folder(folder_path, stdout_log, stderr_log):
    """
    Create a zip file from a folder and add log files

    Args:
        folder_path: Path to the folder containing results
        stdout_log: Standard output log content
        stderr_log: Standard error log content

    Returns:
        BytesIO object containing the zip file
    """
    zip_buffer = io.BytesIO()

    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        # Add all files from the output folder
        folder = Path(folder_path)
        for file_path in folder.rglob('*'):
            if file_path.is_file():
                arcname = file_path.relative_to(folder)
                zip_file.write(file_path, arcname)

        # Add log files
        zip_file.writestr('stdout.log.txt', stdout_log)
        zip_file.writestr('stderr.log.txt', stderr_log)

    zip_buffer.seek(0)
    return zip_buffer


@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'PDF OCR API Server'
    })


@app.route('/api/ocr', methods=['POST'])
def process_pdf():
    """
    Process PDF file using OCR

    Request:
        - Multipart form data with:
          - pdf_file: PDF file to process
          - api_base: (optional) OCR API base URL

    Response:
        - ZIP file containing results and logs
    """
    # Check if file is present
    if 'pdf_file' not in request.files:
        return jsonify({'error': 'No pdf_file provided'}), 400

    pdf_file = request.files['pdf_file']

    if pdf_file.filename == '':
        return jsonify({'error': 'Empty filename'}), 400

    if not pdf_file.filename.lower().endswith('.pdf'):
        return jsonify({'error': 'File must be a PDF'}), 400

    # Get optional parameters
    api_base = request.form.get('api_base', 'http://localhost:5123')

    # Create temporary directories
    temp_dir = tempfile.mkdtemp(prefix='pdf_ocr_api_')
    pdf_path = None
    output_folder = None

    try:
        # Save uploaded PDF to temporary location
        filename = secure_filename(pdf_file.filename)
        pdf_path = os.path.join(temp_dir, filename)
        pdf_file.save(pdf_path)

        # Create output folder
        output_folder = os.path.join(temp_dir, 'output')
        os.makedirs(output_folder, exist_ok=True)

        # Capture stdout and stderr
        with OutputCapture() as capture:
            # Create client and run OCR
            client = PDFOCRClient(pdf_path, output_folder, api_base)
            success = client.run()

            if not success:
                stderr_content = capture.get_stderr()
                stdout_content = capture.get_stdout()
                return jsonify({
                    'error': 'OCR processing failed',
                    'stdout': stdout_content,
                    'stderr': stderr_content
                }), 500

        # Get captured logs
        stdout_log = capture.get_stdout()
        stderr_log = capture.get_stderr()

        # Create zip file with results and logs
        zip_buffer = create_zip_from_folder(output_folder, stdout_log, stderr_log)

        # Send zip file
        return send_file(
            zip_buffer,
            mimetype='application/zip',
            as_attachment=True,
            download_name=f'{Path(filename).stem}_ocr_results.zip'
        )

    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        return jsonify({
            'error': str(e),
            'traceback': error_trace
        }), 500

    finally:
        # Clean up temporary directory
        if temp_dir and os.path.exists(temp_dir):
            try:
                shutil.rmtree(temp_dir)
            except Exception as e:
                print(f"Warning: Failed to clean up temporary directory: {e}", file=sys.stderr)


def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(
        description="PDF OCR API Server - Flask-based API wrapper",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Start server on default port (5000)
  python api_server.py

  # Start server on custom port
  python api_server.py --port 8080

  # Start server on all interfaces
  python api_server.py --host 0.0.0.0 --port 8080

API Usage:
  curl -X POST -F "pdf_file=@document.pdf" -F "api_base=http://localhost:5123" \\
       http://localhost:5000/api/ocr -o results.zip
        """
    )

    parser.add_argument('--port', type=int, default=5000,
                        help='Port to run the server on (default: 5000)')
    parser.add_argument('--host', default='127.0.0.1',
                        help='Host to bind to (default: 127.0.0.1)')
    parser.add_argument('--debug', action='store_true',
                        help='Run in debug mode')

    args = parser.parse_args()

    print(f"Starting PDF OCR API Server on {args.host}:{args.port}")
    print(f"Health check: http://{args.host}:{args.port}/health")
    print(f"OCR endpoint: http://{args.host}:{args.port}/api/ocr")

    app.run(host=args.host, port=args.port, debug=args.debug)


if __name__ == '__main__':
    main()
