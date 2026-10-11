@echo off
cd /d "%~dp0"
python tools\download_images.py
python serve.py
pause
