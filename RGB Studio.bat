@echo off
rem Starts the installed app, else the local build, else runs from source.
cd /d "%~dp0"
if exist "%ProgramFiles%\RGB Studio\RGB Studio.exe" (
  start "" "%ProgramFiles%\RGB Studio\RGB Studio.exe"
) else if exist "release\RGB Studio\RGB Studio.exe" (
  start "" "release\RGB Studio\RGB Studio.exe"
) else (
  py -m pip install -q -r requirements.txt
  start "" pyw app.py
)
