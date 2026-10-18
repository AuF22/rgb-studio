# Builds release\RGB Studio\RGB Studio.exe (OpenRGB engine bundled), a portable zip and the installer.
#   powershell -ExecutionPolicy Bypass -File tools\build.ps1
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Test-Path "openrgb\OpenRGB.exe")) {
    py tools\fetch_engine.py
    if ($LASTEXITCODE -ne 0) { throw "Не удалось скачать движок OpenRGB" }
}

$version = (Select-String -Path app.py -Pattern 'APP_VERSION = "([^"]+)"').Matches[0].Groups[1].Value
py -m pip install -q -r requirements.txt pyinstaller
py tools\make_icon.py

py -m PyInstaller --noconfirm --clean --windowed --uac-admin --distpath release --workpath build\pyi `
    --name "RGB Studio" `
    --icon build\icon.ico `
    --add-data "static;static" `
    --hidden-import pystray._win32 `
    --collect-data soundcard `
    app.py
if ($LASTEXITCODE -ne 0) { throw "Сборка PyInstaller не удалась" }

Copy-Item -Recurse -Force openrgb "release\RGB Studio\openrgb"
# OpenRGB is an MSVC build; ship the VC++ runtime app-locally so it starts on a clean Windows
foreach ($dll in "msvcp140.dll", "msvcp140_1.dll", "vcruntime140.dll", "vcruntime140_1.dll") {
    $src = Join-Path $env:WINDIR "System32\$dll"
    if (Test-Path $src) { Copy-Item -Force $src "release\RGB Studio\openrgb\$dll" }
}
Copy-Item -Force README.md "release\RGB Studio\README.md"
Copy-Item -Force LICENSE "release\RGB Studio\LICENSE"

$zip = "release\RGB-Studio-$version-win64-portable.zip"
if (Test-Path $zip) { Remove-Item $zip }
# antivirus may briefly lock fresh files; retry a few times
for ($i = 0; $i -lt 5; $i++) {
    try { Compress-Archive -Path "release\RGB Studio" -DestinationPath $zip -Force; break }
    catch { if ($i -eq 4) { throw }; Start-Sleep 3 }
}
# installer (Inno Setup 6)
$iscc = @("$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe", "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
          "$env:ProgramFiles\Inno Setup 6\ISCC.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($iscc) {
    & $iscc /Q "/DAppVersion=$version" installer\RGBStudio.iss
    if ($LASTEXITCODE -ne 0) { throw "Сборка установщика не удалась" }
    Write-Host "Готово: release\RGB-Studio-Setup-$version.exe"
} else {
    Write-Host "Inno Setup 6 не найден — установщик пропущен (winget install JRSoftware.InnoSetup)"
}
Write-Host "Готово: release\RGB Studio\RGB Studio.exe и $zip"
