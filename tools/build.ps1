# Builds dist\RGB Studio\RGB Studio.exe with the OpenRGB engine bundled next to it.
#   powershell -ExecutionPolicy Bypass -File tools\build.ps1
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Test-Path "openrgb\OpenRGB.exe")) {
    py tools\fetch_engine.py
    if ($LASTEXITCODE -ne 0) { throw "Не удалось скачать движок OpenRGB" }
}

py -m pip install -q -r requirements.txt pyinstaller
py tools\make_icon.py

py -m PyInstaller --noconfirm --clean --windowed --uac-admin `
    --name "RGB Studio" `
    --icon build\icon.ico `
    --add-data "static;static" `
    --hidden-import pystray._win32 `
    --collect-data soundcard `
    app.py
if ($LASTEXITCODE -ne 0) { throw "Сборка PyInstaller не удалась" }

Copy-Item -Recurse -Force openrgb "dist\RGB Studio\openrgb"
# OpenRGB is an MSVC build; ship the VC++ runtime app-locally so it starts on a clean Windows
foreach ($dll in "msvcp140.dll", "msvcp140_1.dll", "vcruntime140.dll", "vcruntime140_1.dll") {
    $src = Join-Path $env:WINDIR "System32\$dll"
    if (Test-Path $src) { Copy-Item -Force $src "dist\RGB Studio\openrgb\$dll" }
}
Copy-Item -Force README.md "dist\RGB Studio\README.md"

$zip = "dist\RGB-Studio-win64.zip"
if (Test-Path $zip) { Remove-Item $zip }
# antivirus may briefly lock fresh files; retry a few times
for ($i = 0; $i -lt 5; $i++) {
    try { Compress-Archive -Path "dist\RGB Studio" -DestinationPath $zip -Force; break }
    catch { if ($i -eq 4) { throw }; Start-Sleep 3 }
}
Write-Host "Готово: dist\RGB Studio\RGB Studio.exe и $zip"
