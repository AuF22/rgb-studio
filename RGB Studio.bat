@echo off
rem Starts the built app if present, otherwise runs from source.
cd /d "%~dp0"
if exist "dist\RGB Studio\RGB Studio.exe" (
  start "" "dist\RGB Studio\RGB Studio.exe"
) else (
  py -m pip install -q -r requirements.txt
  start "" pyw app.py
)
