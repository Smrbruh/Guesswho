#!/bin/sh
cd "$(dirname "$0")"
python3 tools/download_images.py
python3 serve.py
