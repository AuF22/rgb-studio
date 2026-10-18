"""RGB Studio — simple, friendly lighting control. Ships its own OpenRGB engine and runs it invisibly.

Run:  py app.py              (window + tray icon)
      py app.py --minimized  (tray only, used for autostart)
      py app.py --no-window  (server only, open http://127.0.0.1:6750)
      py app.py --demo       (virtual devices, no engine)
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import threading
import time
import urllib.request
import webbrowser
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory

import effects
import lang
import openrgb_runtime as rt
from lang import tr
from effects import EFFECTS, EffectEngine, rgb_to_hex
from rgb_backend import DemoBackend, OpenRGBBackend

RES = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))
DATA = Path(os.environ.get("APPDATA", rt.app_dir())) / "RGBStudio"
DATA.mkdir(parents=True, exist_ok=True)
SETTINGS_FILE = DATA / "settings.json"
PROFILES_FILE = DATA / "profiles.json"
APP_VERSION = "1.1.0"  # keep in sync with UI_VERSION in static/app.js
TASK_NAME = "RGB Studio"
PORT_SPAN = 20  # ports tried after the default one
DEFAULT_HEADER_LEDS = 40

DEFAULT_SETTINGS = {
    "host": "127.0.0.1",
    "port": 6742,
    "brightness": 100,
    "startup_profile": "",
    "zone_sizes": {},  # device name -> {zone name: LED count} for addressable headers
    "monitor": 1,
    "last_lighting": {},  # snapshot restored on the next start when no startup profile is set
    "language": "",       # "", "ru" or "en"; empty = follow the system
    "custom_effects": {},  # id -> user-built effect definition
}


def load_json(path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return default


def save_json(path, data):
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


settings = {**DEFAULT_SETTINGS, **load_json(SETTINGS_FILE, {})}
profiles = load_json(PROFILES_FILE, {})
lang.current["lang"] = settings.get("language", "")
effects.CUSTOM_EFFECTS = settings["custom_effects"]
state = {"backend": DemoBackend(), "phase": "starting", "error": None, "version": 0, "port": 6750}
runtime = rt.OpenRGBRuntime(settings["host"], settings["port"], DATA / "engine")

engine = EffectEngine(lambda: state["backend"], lambda: settings["brightness"])
engine.sources["screen"].monitor = settings.get("monitor", 1)
app = Flask(__name__, static_folder=str(RES / "static"), static_url_path="/static")


def set_backend(backend):
    engine.reset()
    old, state["backend"] = state["backend"], backend
    if old is not backend:
        old.close()
    state["version"] += 1


def connect_openrgb():
    """Start (or find) the engine and connect to it. Falls back to demo devices on failure."""
    state["phase"], state["error"] = "starting", None
    state["version"] += 1
    runtime.host, runtime.port = settings["host"], int(settings["port"])
    if not runtime.start():
        state["phase"], state["error"] = "demo", runtime.error
        set_backend(DemoBackend())
        return False
    last_exc = None
    for _ in range(20):  # the server can accept connections a moment before it answers
        try:
            set_backend(OpenRGBBackend(runtime.host, runtime.port))
            break
        except Exception as exc:
            last_exc = exc
            time.sleep(0.5)
    else:
        state["phase"], state["error"] = "demo", tr(f"Не удалось подключиться к движку: {last_exc}", f"Couldn't connect to the engine: {last_exc}")
        set_backend(DemoBackend())
        return False
    apply_zone_sizes()
    state["phase"] = "ready"
    start = settings.get("startup_profile")
    if start in profiles:
        apply_profile(profiles[start])
    elif settings.get("last_lighting"):
        apply_profile({"devices": settings["last_lighting"]})
    threading.Thread(target=settle_devices, daemon=True).start()
    return True


def settle_devices():
    """Devices keep appearing for a few seconds while the engine scans; pick them up."""
    backend = state["backend"]
    for _ in range(10):
        time.sleep(2)
        if state["backend"] is not backend:
            return
        before = len(backend.devices)
        try:
            backend.rescan()
        except Exception:
            return
        if len(backend.devices) != before:
            apply_zone_sizes()
            engine.mark_all_dirty()
            state["version"] += 1


def apply_zone_sizes():
    """Re-apply the LED counts the user set for addressable headers (the engine forgets them)."""
    backend = state["backend"]
    if not hasattr(backend, "resize_zone"):
        return
    for dev in list(backend.devices):
        wanted = settings["zone_sizes"].get(dev["name"], {})
        for idx, zone in enumerate(dev["zones"]):
            size = wanted.get(zone["name"])
            if size is None and zone["resizable"] and zone["leds"] == 0:
                # unconfigured addressable header: guess generously so attached fans/strips light up;
                # LEDs beyond what is physically connected are simply ignored by the controller
                size = min(DEFAULT_HEADER_LEDS, zone["max"])
            if zone["resizable"] and size is not None and size != zone["leds"]:
                try:
                    backend.resize_zone(dev["id"], idx, size)
                except Exception:
                    pass


def status():
    b = state["backend"]
    return {
        "mode": b.kind,
        "phase": state["phase"],
        "host": settings["host"],
        "port": settings["port"],
        "error": state["error"] or engine.last_error,
        "version": state["version"],
        "engine": runtime.info(),
        "sources": engine.source_errors(),
    }


def parse_key(key):
    """'3' -> (3, None), '3:1' -> (3, 1); validated against current devices."""
    dev, _, zone = str(key).partition(":")
    dev = int(dev)
    devices = state["backend"].devices
    if not 0 <= dev < len(devices):
        raise ValueError(tr(f"Нет устройства {dev}", f"No device {dev}"))
    if zone != "":
        zone = int(zone)
        if not 0 <= zone < len(devices[dev]["zones"]):
            raise ValueError(tr(f"Нет зоны {zone}", f"No zone {zone}"))
        return dev, zone
    return dev, None


def targets_from(body):
    """Target keys from a request: list of 'dev' / 'dev:zone' (ints accepted), or all devices."""
    ids = body.get("targets")
    if ids in (None, "all"):
        return [str(d["id"]) for d in state["backend"].devices]
    out = []
    for key in ids:
        try:
            parse_key(key)
            out.append(str(key))
        except (ValueError, TypeError):
            pass
    return out


def devices_of(keys):
    return sorted({int(str(k).split(":")[0]) for k in keys})


def effect_cfg(body):
    effect = body.get("effect", "static")
    if effect not in EFFECTS:
        raise ValueError(tr("Неизвестный эффект", "Unknown effect"))
    cfg = {
        "effect": effect,
        "colors": body.get("colors") or ["#ffffff"],
        "speed": int(body.get("speed", 50)),
        "brightness": int(body.get("brightness", 100)),
        "reverse": bool(body.get("reverse", False)),
    }
    if effect == "custom":
        if body.get("custom_id") not in settings["custom_effects"]:
            raise ValueError(tr("Такого эффекта нет", "No such effect"))
        cfg["custom_id"] = body["custom_id"]
    region = body.get("region")
    if isinstance(region, dict):
        cfg["region"] = {k: region[k] for k in ("x", "y", "w", "h", "mode", "reverse") if k in region}
    return cfg


def remember_lighting():
    """Persist what is on screen now so a restart (or autostart) brings it back."""
    if state["backend"].kind != "openrgb":
        return
    settings["last_lighting"] = snapshot_by_name()
    save_json(SETTINGS_FILE, settings)


def snapshot_by_name():
    """Current lighting keyed by device name and 'device::zone' (ids can change between sessions)."""
    out = {}
    for d in state["backend"].devices:
        cfg = engine.assignments.get(str(d["id"]))
        if cfg:
            out[d["name"]] = {"kind": "effect", **cfg}
        elif not any(k.startswith(f'{d["id"]}:') for k in engine.assignments):
            out[d["name"]] = {"kind": "hardware", "mode": d["active_mode"]}
        for zi, z in enumerate(d["zones"]):
            zcfg = engine.assignments.get(f'{d["id"]}:{zi}')
            if zcfg:
                out[f'{d["name"]}::{z["name"]}'] = {"kind": "effect", **zcfg}
    return out


def apply_profile(data):
    backend = state["backend"]
    by_name = {d["name"]: d for d in backend.devices}
    items = sorted(data.get("devices", {}).items(), key=lambda kv: "::" in kv[0])  # devices before zones
    for name, cfg in items:
        dev_name, _, zone_name = name.partition("::")
        dev = by_name.get(dev_name)
        if dev is None:
            continue
        if zone_name:
            zi = next((i for i, z in enumerate(dev["zones"]) if z["name"] == zone_name), None)
            if zi is not None:
                engine.assign(f'{dev["id"]}:{zi}', effect_cfg(cfg))
        elif cfg.get("kind") == "hardware":
            if str(cfg.get("mode", "")).lower() == "direct":
                continue  # "Direct" just means software control; nothing to restore
            engine.release(dev["id"])
            try:
                backend.set_hardware_mode(dev["id"], cfg["mode"])
            except Exception:
                pass
        else:
            engine.assign(str(dev["id"]), effect_cfg(cfg))


# ---------- autostart (Task Scheduler, so it starts elevated without a UAC prompt) ----------

def launch_command():
    if getattr(sys, "frozen", False):
        return f'"{sys.executable}" --minimized'
    pyw = Path(sys.executable).with_name("pythonw.exe")
    return f'"{pyw if pyw.exists() else sys.executable}" "{Path(__file__).resolve()}" --minimized'


def autostart_enabled():
    r = subprocess.run(["schtasks", "/Query", "/TN", TASK_NAME], capture_output=True,
                       creationflags=rt.CREATE_NO_WINDOW)
    return r.returncode == 0


def set_autostart(on):
    if on:
        args = ["schtasks", "/Create", "/TN", TASK_NAME, "/TR", launch_command(),
                "/SC", "ONLOGON", "/RL", "HIGHEST", "/F"]
    else:
        args = ["schtasks", "/Delete", "/TN", TASK_NAME, "/F"]
    r = subprocess.run(args, capture_output=True, text=True, creationflags=rt.CREATE_NO_WINDOW)
    if r.returncode != 0:
        raise RuntimeError((r.stderr or r.stdout).strip() or "schtasks error")


# ---------- routes ----------

@app.get("/")
def index():
    return send_from_directory(RES / "static", "index.html")


@app.get("/api/ping")
def api_ping():
    return jsonify({"app": "rgb-studio", "version": APP_VERSION})


@app.get("/api/state")
def api_state():
    return jsonify({
        "status": status(),
        "app_version": APP_VERSION,
        "devices": [] if state["phase"] == "starting" else state["backend"].describe(),
        "assignments": dict(engine.assignments),
        "effects": [{"id": k, "title": v[0], "group": v[1], "colors": v[2], "animated": v[3],
                     "source": v[4], "slider": v[5]} for k, v in EFFECTS.items()],
        "settings": settings,
        "profiles": sorted(profiles),
        "custom_effects": settings["custom_effects"],
    })


@app.get("/api/status")
def api_status():
    return jsonify(status())


@app.get("/api/frame")
def api_frame():
    frame = state["backend"].frame
    return jsonify({str(k): [rgb_to_hex(c) for c in v] for k, v in frame.items()})


@app.post("/api/apply")
def api_apply():
    body = request.get_json(force=True)
    try:
        cfg = effect_cfg(body)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    for key in targets_from(body):
        engine.assign(key, dict(cfg))
    remember_lighting()
    return jsonify({"ok": True, "assignments": dict(engine.assignments)})


@app.post("/api/hardware")
def api_hardware():
    body = request.get_json(force=True)
    backend = state["backend"]
    color = body.get("color")
    color = tuple(int(color.lstrip("#")[i:i + 2], 16) for i in (0, 2, 4)) if color else None
    errors = []
    for dev_id in devices_of(targets_from(body)):
        engine.release(dev_id)
        try:
            backend.set_hardware_mode(dev_id, body["mode"], color, body.get("speed"))
        except Exception as exc:
            errors.append(f'{backend.devices[dev_id]["name"]}: {exc}')
    remember_lighting()
    return jsonify({"ok": not errors, "errors": errors})


# ---------- user-built effects

def clean_custom(body):
    """Validate a custom effect definition coming from the editor."""
    import re
    is_hex = re.compile(r"^#[0-9a-fA-F]{6}$").match
    frames = []
    for f in (body.get("frames") or [])[:16]:
        stops = [{"pos": min(1.0, max(0.0, float(x["pos"]))), "color": x["color"].lower()}
                 for x in (f.get("stops") or [])[:8] if is_hex(str(x.get("color", "")))]
        if stops:
            frames.append({"t": min(0.999, max(0.0, float(f.get("t", 0)))), "stops": stops})
    if not frames:
        raise ValueError(tr("В эффекте нет ни одного кадра", "The effect has no frames"))
    return {
        "name": (str(body.get("name") or "").strip() or "Effect")[:40],
        "duration": min(20.0, max(0.3, float(body.get("duration", 3)))),
        "scroll": int(min(100, max(-100, float(body.get("scroll", 0))))),
        "ease": "step" if body.get("ease") == "step" else "smooth",
        "hard": bool(body.get("hard")),
        "frames": frames,
    }


@app.post("/api/custom")
def api_custom_save():
    import uuid
    body = request.get_json(force=True)
    try:
        defn = clean_custom(body)
    except (ValueError, TypeError, KeyError) as exc:
        return jsonify({"error": str(exc)}), 400
    cid = body.get("id") if body.get("id") in settings["custom_effects"] else uuid.uuid4().hex[:8]
    settings["custom_effects"][cid] = defn
    save_json(SETTINGS_FILE, settings)
    engine.mark_all_dirty()
    return jsonify({"ok": True, "id": cid, "custom_effects": settings["custom_effects"]})


@app.delete("/api/custom/<cid>")
def api_custom_delete(cid):
    settings["custom_effects"].pop(cid, None)
    for key, cfg in list(engine.assignments.items()):
        if cfg.get("custom_id") == cid:
            engine.assign(key, effect_cfg({"effect": "off"}))
    save_json(SETTINGS_FILE, settings)
    remember_lighting()
    return jsonify({"ok": True, "custom_effects": settings["custom_effects"]})


# ---------- LED count finder: light the first N LEDs of a header so the user sees where it ends

count_test = {}  # "dev:zone" -> original size


@app.post("/api/zone/test")
def api_zone_test():
    body = request.get_json(force=True)
    backend = state["backend"]
    try:
        dev_id, zi = parse_key(f'{body["device"]}:{body["zone"]}')
    except (ValueError, KeyError) as exc:
        return jsonify({"error": str(exc)}), 400
    key = f"{dev_id}:{zi}"
    zone = backend.devices[dev_id]["zones"][zi]
    count = max(1, int(body.get("count", 1)))
    if key not in count_test:
        count_test[key] = zone["leds"]
        if hasattr(backend, "resize_zone") and zone.get("resizable"):
            backend.resize_zone(dev_id, zi, min(zone["max"], max(300, count)))  # address every LED present
            state["version"] += 1
    engine.set_override(key, {"effect": "count_test", "count": count, "brightness": 100})
    return jsonify({"ok": True})


@app.post("/api/zone/test/stop")
def api_zone_test_stop():
    body = request.get_json(force=True)
    backend = state["backend"]
    key = f'{int(body["device"])}:{int(body["zone"])}'
    engine.set_override(key, None)
    original = count_test.pop(key, None)
    dev_id, zi = parse_key(key)
    dev = backend.devices[dev_id]
    size = body.get("save")
    if hasattr(backend, "resize_zone"):
        if size is not None:
            size = backend.resize_zone(dev_id, zi, int(size))
            settings["zone_sizes"].setdefault(dev["name"], {})[dev["zones"][zi]["name"]] = size
            save_json(SETTINGS_FILE, settings)
        elif original is not None:
            backend.resize_zone(dev_id, zi, original)
    engine.mark_all_dirty()
    state["version"] += 1
    return jsonify({"ok": True, "size": size})


# ---------- screen mode helpers

@app.get("/api/screen/grid")
def api_screen_grid():
    """Small live picture of the screen for the layout editor (starts capture if needed)."""
    screen = engine.sources["screen"]
    screen.start()
    state["screen_preview_until"] = time.monotonic() + 5
    g = screen.grid
    return jsonify({"w": g.shape[1], "h": g.shape[0],
                    "cells": [rgb_to_hex(c) for row in g for c in row],
                    "monitor": screen.monitor, "monitors": screen.list_monitors(),
                    "error": screen.error})


@app.post("/api/screen/monitor")
def api_screen_monitor():
    engine.sources["screen"].monitor = max(1, int(request.get_json(force=True).get("monitor", 1)))
    settings["monitor"] = engine.sources["screen"].monitor
    save_json(SETTINGS_FILE, settings)
    return jsonify({"ok": True})


def stop_idle_preview():
    """The editor keeps capture alive by polling; stop it once nobody looks and no effect needs it."""
    while True:
        time.sleep(2)
        until = state.get("screen_preview_until")
        if until and time.monotonic() > until:
            state["screen_preview_until"] = None
            if not any(c["effect"] == "screen" for c in engine.assignments.values()):
                engine.sources["screen"].stop()


@app.post("/api/connect")
def api_connect():
    body = request.get_json(force=True) or {}
    if body.get("demo"):
        runtime.stop()
        state["phase"], state["error"] = "demo", None
        set_backend(DemoBackend())
        return jsonify({"ok": True, "status": status()})
    if "host" in body:
        settings["host"] = body["host"].strip() or "127.0.0.1"
    if "port" in body:
        settings["port"] = int(body["port"])
    save_json(SETTINGS_FILE, settings)
    runtime.stop()
    ok = connect_openrgb()
    return jsonify({"ok": ok, "status": status()})


@app.post("/api/rescan")
def api_rescan():
    backend = state["backend"]
    if hasattr(backend, "rescan"):
        engine.reset()
        try:
            backend.rescan()
        except Exception as exc:
            return jsonify({"ok": False, "error": str(exc)}), 500
        state["version"] += 1
    return jsonify({"ok": True})


@app.post("/api/zone")
def api_zone():
    body = request.get_json(force=True)
    backend = state["backend"]
    if not hasattr(backend, "resize_zone"):
        return jsonify({"error": tr("В демо-режиме размер зон не меняется", "Zone sizes can't be changed in demo mode")}), 400
    dev_id, zone_idx = int(body["device"]), int(body["zone"])
    try:
        dev = backend.devices[dev_id]
        zone_name = dev["zones"][zone_idx]["name"]
        size = backend.resize_zone(dev_id, zone_idx, body["size"])
    except Exception as exc:
        return jsonify({"error": tr(f"Не удалось изменить зону: {exc}", f"Couldn't change the zone: {exc}")}), 500
    settings["zone_sizes"].setdefault(dev["name"], {})[zone_name] = size
    save_json(SETTINGS_FILE, settings)
    engine.mark_all_dirty()
    state["version"] += 1
    return jsonify({"ok": True, "size": size})


@app.post("/api/elevate")
def api_elevate():
    """Relaunch the whole app with administrator rights (needed for RAM / motherboard)."""
    if getattr(sys, "frozen", False):
        exe, params = sys.executable, "--restarted"
    else:
        exe, params = sys.executable, f'"{Path(__file__).resolve()}" --restarted'
    try:
        shutdown(restart_elevated=(exe, params))
    except PermissionError as exc:
        return jsonify({"error": str(exc)}), 403
    return jsonify({"ok": True})


@app.post("/api/pawnio/install")
def api_pawnio():
    try:
        reboot = rt.install_pawnio()
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
    runtime.stop()
    threading.Thread(target=connect_openrgb, daemon=True).start()
    return jsonify({"ok": True, "reboot": reboot})


@app.get("/api/autostart")
def api_autostart_get():
    return jsonify({"enabled": autostart_enabled()})


@app.post("/api/autostart")
def api_autostart_set():
    on = bool(request.get_json(force=True).get("enabled"))
    try:
        set_autostart(on)
    except Exception as exc:
        return jsonify({"error": tr(f"Не удалось изменить автозапуск: {exc}", f"Couldn't change autostart: {exc}")}), 500
    return jsonify({"enabled": autostart_enabled()})


@app.post("/api/settings")
def api_settings():
    body = request.get_json(force=True)
    for key in ("brightness", "startup_profile"):
        if key in body:
            settings[key] = body[key]
    if body.get("language") in ("", "ru", "en"):
        settings["language"] = lang.current["lang"] = body["language"]
        tray = state.get("tray")
        if tray:
            tray.update_menu()
    settings["brightness"] = max(0, min(100, int(settings["brightness"])))
    save_json(SETTINGS_FILE, settings)
    engine.mark_all_dirty()
    return jsonify({"ok": True, "settings": settings})


@app.post("/api/profiles")
def api_profile_save():
    name = (request.get_json(force=True).get("name") or "").strip()
    if not name:
        return jsonify({"error": tr("Введите название профиля", "Enter a profile name")}), 400
    profiles[name] = {"devices": snapshot_by_name()}
    save_json(PROFILES_FILE, profiles)
    return jsonify({"ok": True, "profiles": sorted(profiles)})


@app.post("/api/profiles/<name>/load")
def api_profile_load(name):
    if name not in profiles:
        return jsonify({"error": tr("Профиль не найден", "Profile not found")}), 404
    apply_profile(profiles[name])
    remember_lighting()
    return jsonify({"ok": True})


@app.delete("/api/profiles/<name>")
def api_profile_delete(name):
    profiles.pop(name, None)
    if settings["startup_profile"] == name:
        settings["startup_profile"] = ""
        save_json(SETTINGS_FILE, settings)
    save_json(PROFILES_FILE, profiles)
    return jsonify({"ok": True, "profiles": sorted(profiles)})


# ---------- window, tray, lifecycle ----------

def open_window():
    """Open the UI as a standalone app window (Edge/Chrome app mode), else a browser tab."""
    url = f"http://127.0.0.1:{state['port']}"
    candidates = [
        shutil.which("msedge"),
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        shutil.which("chrome"),
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    ]
    for exe in candidates:
        if exe and os.path.exists(exe):
            subprocess.Popen([exe, f"--app={url}", "--window-size=1280,820",
                              f"--user-data-dir={DATA / 'window'}"])
            return
    webbrowser.open(url)


def shutdown(restart_elevated=None):
    if restart_elevated:
        rt.run_elevated(*restart_elevated)  # raises if the user declines UAC; then we keep running
    engine.stop()
    runtime.stop()
    tray = state.get("tray")
    if tray:
        tray.stop()
    threading.Timer(0.3, lambda: os._exit(0)).start()


def make_icon():
    from PIL import Image, ImageDraw
    size = 64
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    colors = [(255, 61, 127), (255, 229, 61), (61, 255, 138), (61, 213, 255), (124, 92, 255)]
    for i, c in enumerate(colors):
        d.arc((6, 6, 58, 58), start=i * 72 - 90, end=(i + 1) * 72 - 90, fill=c, width=12)
    return img


def run_tray():
    import pystray
    menu = pystray.Menu(
        pystray.MenuItem(lambda item: tr("Открыть RGB Studio", "Open RGB Studio"), lambda: open_window(), default=True),
        pystray.MenuItem(lambda item: tr("Выход", "Exit"), lambda: shutdown()),
    )
    icon = pystray.Icon("RGB Studio", make_icon(), "RGB Studio", menu)
    state["tray"] = icon
    icon.run()


def already_running(port):
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/ping", timeout=0.5) as r:
            return json.load(r).get("app") == "rgb-studio"
    except Exception:
        return False


INSTANCE_FILE = DATA / "instance.json"


def find_running(base):
    """Port of a live RGB Studio instance, if any. Probing closed ports is slow on Windows,
    so only the default port and the one the last instance recorded are checked."""
    recorded = load_json(INSTANCE_FILE, {}).get("port")
    for port in dict.fromkeys(p for p in (recorded, base) if p):
        if already_running(port):
            return port
    return None


def bind_server(base):
    """Bind exclusively to the first free port from base. Windows otherwise lets a second process
    share a port, and requests then randomly land in a stale copy of the app (404s)."""
    import socket
    from werkzeug.serving import BaseWSGIServer, make_server

    if not getattr(BaseWSGIServer, "_rgbstudio_exclusive", False):
        original = BaseWSGIServer.server_bind

        def server_bind(self):
            if hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
                self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
            original(self)

        BaseWSGIServer.allow_reuse_address = False
        BaseWSGIServer.server_bind = server_bind
        BaseWSGIServer._rgbstudio_exclusive = True

    for port in range(base, base + PORT_SPAN):
        probe = socket.socket()
        try:
            if hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
                probe.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
            probe.bind(("127.0.0.1", port))
        except OSError:
            continue
        finally:
            probe.close()
        try:  # werkzeug exits the process instead of raising when the port is taken
            return make_server("127.0.0.1", port, app, threaded=True), port
        except (OSError, SystemExit):
            continue
    raise SystemExit(f"No free port in {base}-{base + PORT_SPAN - 1}")


def main():
    parser = argparse.ArgumentParser(description="RGB Studio")
    parser.add_argument("--port", type=int, default=6750)
    parser.add_argument("--no-window", action="store_true", help="server only, no window or tray")
    parser.add_argument("--minimized", action="store_true", help="start in the tray without a window")
    parser.add_argument("--demo", action="store_true", help="virtual devices, no engine")
    parser.add_argument("--restarted", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args()

    if args.restarted:  # give the previous instance time to shut down
        for _ in range(40):
            if find_running(args.port) is None:
                break
            time.sleep(0.25)

    running = find_running(args.port)
    if running is not None:
        state["port"] = running
        if args.no_window:
            print(f"RGB Studio is already running: http://127.0.0.1:{running}")
        else:
            open_window()
        return

    httpd, state["port"] = bind_server(args.port)
    args.port = state["port"]
    if not args.no_window:  # server-only runs (tests, tools) must not hijack the main instance
        save_json(INSTANCE_FILE, {"port": args.port, "pid": os.getpid()})

    if args.demo:
        state["phase"] = "demo"
    else:
        threading.Thread(target=connect_openrgb, daemon=True).start()

    threading.Thread(target=stop_idle_preview, daemon=True).start()
    server = threading.Thread(target=httpd.serve_forever, daemon=True)
    server.start()
    print(f"RGB Studio: http://127.0.0.1:{args.port}")

    if args.no_window:
        try:
            server.join()
        except KeyboardInterrupt:
            pass
        runtime.stop()
        return
    if not args.minimized:
        threading.Timer(0.8, open_window).start()
    run_tray()


if __name__ == "__main__":
    main()
