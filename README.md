<div align="center">

# RGB Studio

**A simple, friendly app for controlling your PC's RGB lighting on Windows.**
Powered by the [OpenRGB](https://openrgb.org) engine, which comes built in, so there is nothing else to install.

[![License: GPL v2](https://img.shields.io/badge/License-GPL_v2-blue.svg)](LICENSE)
![Platform: Windows 10/11](https://img.shields.io/badge/Windows-10%20%7C%2011-0078D6?logo=windows)
[![Based on OpenRGB](https://img.shields.io/badge/based%20on-OpenRGB-ff3d7f)](https://openrgb.org)
[![Made with Claude](https://img.shields.io/badge/made%20with-Claude-d97757)](https://claude.com/claude-code)

[**Download**](https://github.com/AuF22/rgb-studio/releases/latest) · [Русская версия](README.ru.md)

![RGB Studio main window](docs/main.png)

</div>

> [!NOTE]
> **RGB Studio is an independent front end built on [OpenRGB](https://openrgb.org).** OpenRGB does the hard part:
> drivers and protocols for hundreds of motherboards, RAM sticks, GPUs, keyboards and fans.
> RGB Studio adds an approachable interface on top. It is not affiliated with the OpenRGB project.
>
> **This project was designed and written by [Claude](https://claude.com/claude-code)**, Anthropic's AI,
> working in Claude Code at the request of [@AuF22](https://github.com/AuF22).

## Features

- **One app for all your RGB.** Motherboard, RAM, GPU, keyboard, mouse, ARGB fans and strips: anything OpenRGB supports.
- **Live preview** of every LED, with fans drawn as rings and keyboards as a key grid.
- **Every device and every zone on its own.** Give each ARGB header, GPU zone or RAM stick its own effect.
- **Effects:** static, gradient, breathing, color cycle, rainbow, rainbow wave, color wave, comet,
  **Starry Night** (like Armoury Crate's), off.
- **Keyboard:** keys light up as you press them, or send a ripple across the keyboard.
- **Music:** spectrum, beat pulse and VU-meter modes driven by whatever is playing on the PC.
- **Screen mirroring (ambilight):** each device or zone follows its own part of the screen, set up in a visual editor.
- **LED count finder** for ARGB headers. A slider lights exactly N LEDs, so you can see where the fan or strip ends.
- **Hardware modes** stored in the device itself, so they keep running when the app is closed.
- **Profiles**, global brightness, start with Windows into the tray, and it remembers your lighting between restarts.

> The interface is in Russian for now. Translations are welcome.

| Effects | Screen regions |
|---|---|
| ![Effects](docs/effects.png) | ![Screen region editor](docs/screen-editor.png) |

<sub>Screenshots use the built-in demo mode with virtual devices. The screen editor shows a painted picture.</sub>

## Install

1. Download **`RGB-Studio-Setup-x.y.z.exe`** from [Releases](https://github.com/AuF22/rgb-studio/releases/latest).
2. Run it. You can choose to start with Windows and to install the **PawnIO** driver
   (needed for RAM and some motherboards).
3. Launch RGB Studio and confirm the administrator prompt.

A **portable zip** is also available: unpack it anywhere and run `RGB Studio.exe`.

> [!TIP]
> Windows SmartScreen may warn about an unknown publisher because the app is not code-signed.
> Click **More info → Run anyway**. You can always [build it yourself](#build-from-source).

### First steps

- **Why administrator rights?** RAM and many motherboards are controlled over the SMBus,
  which Windows only allows for administrators. The autostart option uses a scheduled task,
  so there is no UAC prompt at every logon.
- **ARGB fans or strips stay dark?** ARGB LEDs cannot report how many there are,
  not to RGB Studio and not to any other software. Click **Подобрать** (Find) under the header in the preview and move the slider
  until the red LED sits on the last one. Until you do, each header defaults to 40 LEDs.
- **A device is missing?** RGB Studio sees what OpenRGB supports.
  Check the [OpenRGB supported devices list](https://openrgb.org/devices.html).
  Gamepads that use the Xbox 360 protocol, for example, have no lighting control.

## Privacy

Everything runs locally. The UI is served on `127.0.0.1` only.
The keyboard effects use a low-level keyboard hook only while such an effect is on. They keep just the name
of the last keys pressed, in memory, for about two seconds. Audio and screen capture are analysed on the fly
and never saved or sent anywhere.

## Build from source

Requirements: Windows 10/11 x64 and Python 3.12 or newer (developed on 3.14)
([Inno Setup 6](https://jrsoftware.org/isinfo.php) only for the installer).

```bash
py -m pip install -r requirements.txt
```

```bash
py tools/fetch_engine.py
```

```bash
py app.py
```

`fetch_engine.py` downloads OpenRGB 1.1 and the PawnIO installer from their official releases
and checks their SHA-256. Useful flags for `app.py`: `--demo` (virtual devices), `--minimized` (tray only),
`--no-window` (server only at http://127.0.0.1:6750).

Build the exe, the portable zip and the installer into `release/`:

```bash
powershell -ExecutionPolicy Bypass -File tools\build.ps1
```

## How it works

```
 ┌──────────────┐   HTTP (localhost)   ┌──────────────────────────┐   OpenRGB SDK (TCP 6742)   ┌──────────────┐
 │ UI (web view │ ───────────────────▶ │ RGB Studio (Python)      │ ─────────────────────────▶ │ OpenRGB 1.1  │──▶ devices
 │ in Edge app  │ ◀─────────────────── │ effects @30 fps, audio,  │                            │ (headless,   │
 │ window)      │    live LED frames   │ screen, keys, profiles   │                            │  bundled)    │
 └──────────────┘                      └──────────────────────────┘                            └──────────────┘
```

| Path | Purpose |
|---|---|
| `app.py` | Flask server and REST API, app window, tray, autostart, single instance |
| `openrgb_runtime.py` | Starts the bundled OpenRGB headless and ties its lifetime to the app; admin and PawnIO helpers |
| `rgb_backend.py` | Devices over the OpenRGB SDK, plus the virtual demo devices |
| `effects.py` | Effect engine: per-device and per-zone effects at ~30 fps |
| `sources.py` | Live inputs: WASAPI loopback audio, screen capture, keyboard hook |
| `static/` | The interface (plain HTML, CSS and JS) |
| `installer/` | Inno Setup script |
| `tools/` | Engine download, icon, screenshots, build |

Settings and profiles live in `%APPDATA%\RGBStudio`.

## Credits

- **[OpenRGB](https://openrgb.org)** by Adam Honse and contributors, GPL-2.0. It is the engine behind all device support.
  RGB Studio ships an unmodified build and talks to it over the OpenRGB SDK protocol.
  Source: <https://codeberg.org/OpenRGB/OpenRGB>.
- **[PawnIO](https://pawnio.eu)** by namazso. It is the signed driver OpenRGB uses for SMBus access.
- Python libraries: Flask, openrgb-python, NumPy, SoundCard, MSS, pystray, Pillow.
- **Written by [Claude](https://claude.com/claude-code)** (Anthropic) in Claude Code.

## License

RGB Studio is released under the [GNU General Public License v2.0](LICENSE), the same license as OpenRGB.
