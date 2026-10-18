"""RGB Studio — simple, friendly lighting control on top of the OpenRGB SDK server.

Run:  py app.py            (opens a desktop window)
      py app.py --no-window (server only, open http://127.0.0.1:6750)
"""
import argparse
import json
import os
import shutil
import subprocess
import threading
import webbrowser
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory

from effects import EFFECTS, EffectEngine, rgb_to_hex
from rgb_backend import DemoBackend, OpenRGBBackend

BASE = Path(__file__).resolve().parent
DATA = Path(os.environ.get("APPDATA", BASE)) / "RGBStudio"
DATA.mkdir(parents=True, exist_ok=True)
SETTINGS_FILE = DATA / "settings.json"
PROFILES_FILE = DATA / "profiles.json"

DEFAULT_SETTINGS = {
    "host": "127.0.0.1",
    "port": 6742,
    "brightness": 100,
    "startup_profile": "",
    "demo_fallback": True,
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
state = {"backend": DemoBackend(), "connect_error": None}

engine = EffectEngine(lambda: state["backend"], lambda: settings["brightness"])
app = Flask(__name__, static_folder=str(BASE / "static"), static_url_path="/static")


def connect(host=None, port=None, allow_demo=True):
    host = host or settings["host"]
    port = int(port or settings["port"])
    engine.reset()
    old = state["backend"]
    try:
        state["backend"] = OpenRGBBackend(host, port)
        state["connect_error"] = None
    except Exception as exc:
        state["connect_error"] = f"Не удалось подключиться к OpenRGB на {host}:{port} — {exc}"
        state["backend"] = DemoBackend() if allow_demo else old
    if old is not state["backend"]:
        old.close()
    return state["backend"].kind == "openrgb"


def status():
    b = state["backend"]
    return {
        "mode": b.kind,
        "host": settings["host"],
        "port": settings["port"],
        "error": state["connect_error"] or engine.last_error,
    }


def targets_from(body):
    ids = body.get("targets")
    devices = state["backend"].devices
    if ids in (None, "all"):
        return [d["id"] for d in devices]
    return [i for i in ids if 0 <= i < len(devices)]


def effect_cfg(body):
    effect = body.get("effect", "static")
    if effect not in EFFECTS:
        raise ValueError("Неизвестный эффект")
    return {
        "effect": effect,
        "colors": body.get("colors") or ["#ffffff"],
        "speed": int(body.get("speed", 50)),
        "brightness": int(body.get("brightness", 100)),
        "reverse": bool(body.get("reverse", False)),
    }


def snapshot_by_name():
    """Current lighting keyed by device name (ids can change between sessions)."""
    devs = state["backend"].devices
    out = {}
    for d in devs:
        cfg = engine.assignments.get(d["id"])
        if cfg:
            out[d["name"]] = {"kind": "effect", **cfg}
        else:
            out[d["name"]] = {"kind": "hardware", "mode": d["active_mode"]}
    return out


def apply_profile(data):
    backend = state["backend"]
    by_name = {d["name"]: d["id"] for d in backend.devices}
    for name, cfg in data.get("devices", {}).items():
        dev_id = by_name.get(name)
        if dev_id is None:
            continue
        if cfg.get("kind") == "hardware":
            engine.release(dev_id)
            try:
                backend.set_hardware_mode(dev_id, cfg["mode"])
            except Exception:
                pass
        else:
            engine.assign(dev_id, effect_cfg(cfg))


# ---------- routes ----------

@app.get("/")
def index():
    return send_from_directory(BASE / "static", "index.html")


@app.get("/api/state")
def api_state():
    return jsonify({
        "status": status(),
        "devices": state["backend"].describe(),
        "assignments": {str(k): v for k, v in engine.assignments.items()},
        "effects": [{"id": k, "title": v[0], "colors": v[1], "animated": v[2]} for k, v in EFFECTS.items()],
        "settings": settings,
        "profiles": sorted(profiles),
    })


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
    for dev_id in targets_from(body):
        engine.assign(dev_id, dict(cfg))
    return jsonify({"ok": True})


@app.post("/api/hardware")
def api_hardware():
    body = request.get_json(force=True)
    backend = state["backend"]
    color = body.get("color")
    color = tuple(int(color.lstrip("#")[i:i + 2], 16) for i in (0, 2, 4)) if color else None
    errors = []
    for dev_id in targets_from(body):
        engine.release(dev_id)
        try:
            backend.set_hardware_mode(dev_id, body["mode"], color, body.get("speed"))
        except Exception as exc:
            errors.append(f'{backend.devices[dev_id]["name"]}: {exc}')
    return jsonify({"ok": not errors, "errors": errors})


@app.post("/api/connect")
def api_connect():
    body = request.get_json(force=True) or {}
    if body.get("demo"):
        engine.reset()
        state["backend"].close()
        state["backend"] = DemoBackend()
        state["connect_error"] = None
        return jsonify({"ok": True, "status": status()})
    if "host" in body:
        settings["host"] = body["host"].strip() or "127.0.0.1"
    if "port" in body:
        settings["port"] = int(body["port"])
    save_json(SETTINGS_FILE, settings)
    ok = connect(allow_demo=settings["demo_fallback"])
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
    return jsonify({"ok": True})


@app.post("/api/settings")
def api_settings():
    body = request.get_json(force=True)
    for key in ("brightness", "startup_profile", "demo_fallback"):
        if key in body:
            settings[key] = body[key]
    settings["brightness"] = max(0, min(100, int(settings["brightness"])))
    save_json(SETTINGS_FILE, settings)
    engine.mark_all_dirty()
    return jsonify({"ok": True, "settings": settings})


@app.post("/api/profiles")
def api_profile_save():
    name = (request.get_json(force=True).get("name") or "").strip()
    if not name:
        return jsonify({"error": "Введите название профиля"}), 400
    profiles[name] = {"devices": snapshot_by_name()}
    save_json(PROFILES_FILE, profiles)
    return jsonify({"ok": True, "profiles": sorted(profiles)})


@app.post("/api/profiles/<name>/load")
def api_profile_load(name):
    if name not in profiles:
        return jsonify({"error": "Профиль не найден"}), 404
    apply_profile(profiles[name])
    return jsonify({"ok": True})


@app.delete("/api/profiles/<name>")
def api_profile_delete(name):
    profiles.pop(name, None)
    if settings["startup_profile"] == name:
        settings["startup_profile"] = ""
        save_json(SETTINGS_FILE, settings)
    save_json(PROFILES_FILE, profiles)
    return jsonify({"ok": True, "profiles": sorted(profiles)})


# ---------- launcher ----------

def open_window(url):
    """Open the UI as a standalone app window (Edge/Chrome app mode), else a browser tab."""
    candidates = [
        shutil.which("msedge"),
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        shutil.which("chrome"),
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    ]
    for exe in candidates:
        if exe and os.path.exists(exe):
            profile = DATA / "window"
            subprocess.Popen([exe, f"--app={url}", "--window-size=1280,820",
                              f"--user-data-dir={profile}"])
            return
    webbrowser.open(url)


def main():
    parser = argparse.ArgumentParser(description="RGB Studio")
    parser.add_argument("--port", type=int, default=6750)
    parser.add_argument("--no-window", action="store_true")
    parser.add_argument("--demo", action="store_true", help="не подключаться к OpenRGB")
    args = parser.parse_args()

    if not args.demo:
        connect(allow_demo=True)
    start = settings.get("startup_profile")
    if start in profiles:
        apply_profile(profiles[start])

    url = f"http://127.0.0.1:{args.port}"
    if not args.no_window:
        threading.Timer(0.8, open_window, args=(url,)).start()
    print(f"RGB Studio: {url}  (режим: {state['backend'].kind})")
    app.run(host="127.0.0.1", port=args.port, threaded=True)


if __name__ == "__main__":
    main()
