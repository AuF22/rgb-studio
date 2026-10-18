"""Lighting effects, rendered ~30 times per second and pushed to devices.

Effects are assigned to targets: a whole device ("3") or a single zone ("3:1").
Zone assignments are drawn over the device-wide one, so each part can be set separately.
"""
import colorsys
import math
import random
import threading
import time

from sources import AudioSource, KeyboardSource, ScreenSource, normalize_key

FPS = 30

# id -> (title, group, uses colors, animated, needs source, slider label)
EFFECTS = {
    "static":      ("Статичный",        "basic",   True,  False, None,       None),
    "gradient":    ("Градиент",         "basic",   True,  False, None,       None),
    "breathing":   ("Дыхание",          "basic",   True,  True,  None,       "Скорость"),
    "cycle":       ("Смена цветов",     "basic",   True,  True,  None,       "Скорость"),
    "rainbow":     ("Радуга",           "basic",   False, True,  None,       "Скорость"),
    "wave":        ("Радужная волна",   "basic",   False, True,  None,       "Скорость"),
    "color_wave":  ("Цветная волна",    "basic",   True,  True,  None,       "Скорость"),
    "comet":       ("Комета",           "basic",   True,  True,  None,       "Скорость"),
    "starry":      ("Звёздная ночь",    "basic",   True,  True,  None,       "Количество звёзд"),
    "reactive":    ("Нажатия",          "keys",    True,  True,  "keyboard", "Затухание"),
    "ripple":      ("Волна от нажатия", "keys",    True,  True,  "keyboard", "Скорость волны"),
    "music_spectrum": ("Музыка: спектр", "music",  True,  True,  "audio",    "Чувствительность"),
    "music_pulse": ("Музыка: пульс",    "music",   True,  True,  "audio",    "Чувствительность"),
    "music_level": ("Музыка: уровень",  "music",   True,  True,  "audio",    "Чувствительность"),
    "screen":      ("Повтор экрана",    "screen",  False, True,  "screen",   "Плавность"),
    "off":         ("Выключить",        "basic",   False, False, None,       None),
    "custom":      ("Свой эффект",      "custom",  False, True,  None,       "Скорость"),
}

CUSTOM_EFFECTS = {}  # id -> definition; app.py points this at the saved custom effects


def hex_to_rgb(value):
    value = value.lstrip("#")
    return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))


def rgb_to_hex(c):
    return "#%02x%02x%02x" % tuple(int(x) for x in c)


def lerp(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def scale(c, k):
    return tuple(max(0, min(255, round(x * k))) for x in c)


def add(a, b):
    return tuple(min(255, x + y) for x, y in zip(a, b))


def hsv(h, s=1.0, v=1.0):
    r, g, b = colorsys.hsv_to_rgb(h % 1.0, s, v)
    return round(r * 255), round(g * 255), round(b * 255)


def palette_at(colors, t):
    """Colour at position t (0..1) along a looping palette."""
    if len(colors) == 1:
        return colors[0]
    t = (t % 1.0) * len(colors)
    i = int(t)
    return lerp(colors[i], colors[(i + 1) % len(colors)], t - i)


def gradient_at(colors, t):
    """Colour at position t (0..1) along a non-looping gradient."""
    if len(colors) == 1:
        return colors[0]
    p = max(0.0, min(1.0, t)) * (len(colors) - 1)
    k = min(int(p), len(colors) - 2)
    return lerp(colors[k], colors[k + 1], p - k)


class Ctx:
    """Everything an effect may need about the LEDs it draws."""

    def __init__(self, n, t, dt, state, names, positions, sources):
        self.n, self.t, self.dt = n, t, dt
        self.state = state            # per-target dict that survives between frames
        self.names = names            # normalized key names (keyboards) or ""
        self.positions = positions    # (row, col) per LED, or None
        self.sources = sources


def render(cfg, ctx):
    """Return ctx.n RGB tuples."""
    effect = cfg["effect"]
    colors = [hex_to_rgb(c) for c in cfg.get("colors") or ["#ffffff"]]
    s = cfg.get("speed", 50) / 100
    speed = 0.05 + s * 1.45
    reverse = -1 if cfg.get("reverse") else 1
    n, t, st = ctx.n, ctx.t, ctx.state
    if n == 0:
        return []

    if effect == "off":
        out = [(0, 0, 0)] * n
    elif effect == "static":
        out = [colors[0]] * n
    elif effect == "count_test":  # used by the LED count finder
        k = cfg.get("count", 1)
        out = [(255, 255, 255) if i < k - 1 else (255, 0, 40) if i == k - 1 else (0, 0, 0) for i in range(n)]
    elif effect == "gradient":
        stops = colors if len(colors) > 1 else [colors[0], (0, 0, 0)]
        out = [gradient_at(stops, i / max(1, n - 1)) for i in range(n)]
    elif effect == "breathing":
        phase = t * speed * 0.6
        level = (1 - math.cos(phase % 1.0 * 2 * math.pi)) / 2
        out = [scale(colors[int(phase) % len(colors)], 0.03 + 0.97 * level)] * n
    elif effect == "cycle":
        out = [palette_at(colors, t * speed * 0.25)] * n
    elif effect == "rainbow":
        out = [hsv(t * speed * 0.2)] * n
    elif effect == "wave":
        out = [hsv(i / n - reverse * t * speed * 0.4) for i in range(n)]
    elif effect == "color_wave":
        out = [palette_at(colors, i / n - reverse * t * speed * 0.4) for i in range(n)]
    elif effect == "comet":
        head = (reverse * t * speed * n * 0.6) % n
        tail = max(3, n // 4)
        out = []
        for i in range(n):
            d = (head - i) % n
            out.append(scale(colors[0], max(0.0, 1 - d / tail) ** 2 if d <= tail else 0.0))
    elif effect == "starry":
        out = starry(colors, s, ctx)
    elif effect in ("reactive", "ripple"):
        out = keys_effect(effect, colors, s, ctx)
    elif effect.startswith("music_"):
        out = music_effect(effect, colors, s, ctx)
    elif effect == "screen":
        out = screen_effect(cfg, s, ctx)
    elif effect == "custom":
        defn = CUSTOM_EFFECTS.get(cfg.get("custom_id"))
        out = custom_effect(defn, s, ctx) if defn else [(0, 0, 0)] * n
    else:
        out = [(0, 0, 0)] * n

    k = cfg.get("brightness", 100) / 100
    return [scale(c, k) for c in out]


def starry(colors, density, ctx):
    """Stars randomly fade in and out over a dark sky (like Armoury Crate's Starry Night)."""
    st, n = ctx.state, ctx.n
    stars = st.setdefault("stars", {})  # led -> [age, life, color]
    rate = (0.3 + density * 4.0) * n / 20  # new stars per second
    st["acc"] = st.get("acc", 0.0) + rate * ctx.dt
    while st["acc"] >= 1:
        st["acc"] -= 1
        led = random.randrange(n)
        if led not in stars:
            stars[led] = [0.0, random.uniform(0.8, 2.2), random.choice(colors)]
    out = [(0, 0, 0)] * n
    for led in list(stars):
        star = stars[led]
        star[0] += ctx.dt
        if star[0] >= star[1] or led >= n:
            del stars[led]
            continue
        out[led] = scale(star[2], math.sin(math.pi * star[0] / star[1]) ** 1.5)
    return out


def keys_effect(effect, colors, s, ctx):
    """Light the key you press (reactive) or send a ring out from it (ripple)."""
    kb = ctx.sources.get("keyboard")
    st, n = ctx.state, ctx.n
    press = colors[0]
    base = colors[1] if len(colors) > 1 else (0, 0, 0)
    hits = st.setdefault("hits", [])  # [led index, time]
    seen = st.get("seen", 0)
    if kb:
        index = st.get("index")
        if index is None:
            index = {}
            for i, name in enumerate(ctx.names):
                if name:
                    index.setdefault(name, i)
            st["index"] = index
        for seq, name, _ in list(kb.presses):
            if seq > seen:
                seen = seq
                led = index.get(name)
                if led is None and ctx.names and not any(ctx.names):
                    led = random.randrange(n)  # non-keyboard zone: flash a random LED
                if led is not None:
                    hits.append([led, ctx.t])
        st["seen"] = seen
    out = [base] * n
    if effect == "reactive":
        fade = 0.25 + (1 - s) * 2.0
        for led, t0 in hits:
            k = 1 - (ctx.t - t0) / fade
            if k > 0:
                out[led] = lerp(base, press, k)
        hits[:] = [h for h in hits if ctx.t - h[1] < fade]
    else:
        vel = 4 + s * 26  # cells per second
        width, life = 1.6, 1.2
        pos = ctx.positions or [(0, i) for i in range(n)]
        for led, t0 in hits:
            age = ctx.t - t0
            radius = age * vel
            r0, c0 = pos[led]
            for i, (r, c) in enumerate(pos):
                d = abs(math.hypot(r - r0, (c - c0) * 0.9) - radius)
                if d < width:
                    k = (1 - d / width) * max(0.0, 1 - age / life)
                    out[i] = lerp(out[i], press, min(1.0, k))
        hits[:] = [h for h in hits if ctx.t - h[1] < life]
    return out


def music_effect(effect, colors, sens, ctx):
    audio = ctx.sources.get("audio")
    n = ctx.n
    if audio is None:
        return [(0, 0, 0)] * n
    gain = 0.5 + sens * 1.5
    if effect == "music_spectrum":
        bands = audio.bands
        out = []
        for i in range(n):
            b = min(len(bands) - 1, int(i / n * len(bands)))
            out.append(scale(gradient_at(colors, i / max(1, n - 1)), min(1.0, bands[b] * gain)))
        return out
    if effect == "music_pulse":
        color = colors[audio.beat % len(colors)]
        return [scale(color, min(1.0, 0.05 + audio.bass * gain))] * n
    lit = min(1.0, audio.level * gain * 1.6) * n  # music_level: VU meter
    stops = colors if len(colors) > 1 else [colors[0], colors[0]]
    return [scale(gradient_at(stops, i / max(1, n - 1)), max(0.0, min(1.0, lit - i))) for i in range(n)]


def _gradient(stops, pos, loop, hard):
    """Colour at pos (0..1) of a gradient given as [{pos, color}]. Mirrors gradientColor() in custom.js."""
    s = sorted(stops, key=lambda x: x["pos"])
    cols = [hex_to_rgb(x["color"]) for x in s]
    if len(s) == 1:
        return cols[0]
    if hard:
        pick = len(s) - 1  # a stop's colour holds until the next stop
        for i, x in enumerate(s):
            if x["pos"] <= pos:
                pick = i
        if pos < s[0]["pos"]:
            pick = len(s) - 1 if loop else 0
        return cols[pick]
    if pos <= s[0]["pos"] or pos >= s[-1]["pos"]:
        if not loop:
            return cols[0] if pos <= s[0]["pos"] else cols[-1]
        span = (1 - s[-1]["pos"] + s[0]["pos"]) or 1
        return lerp(cols[-1], cols[0], ((pos - s[-1]["pos"] + 1) % 1) / span)
    for i in range(len(s) - 1):
        if pos <= s[i + 1]["pos"]:
            k = (pos - s[i]["pos"]) / ((s[i + 1]["pos"] - s[i]["pos"]) or 1)
            return lerp(cols[i], cols[i + 1], k)
    return cols[-1]


def custom_effect(defn, s, ctx):
    """User-built effect: keyframed gradients on a loop, optionally scrolling. Mirrors renderCustom() in custom.js."""
    n = ctx.n
    factor = 2 ** ((s * 100 - 50) / 50)  # speed slider: 50 = as designed, 0 = half, 100 = double
    frames = sorted(defn["frames"], key=lambda f: f["t"])
    phase = (ctx.t * factor / max(0.1, defn.get("duration", 3))) % 1
    ai = len(frames) - 1
    for i, f in enumerate(frames):
        if f["t"] <= phase:
            ai = i
    a, b = frames[ai], frames[(ai + 1) % len(frames)]
    span = ((b["t"] - a["t"] + 1) % 1) or 1
    k = 0.0 if len(frames) == 1 else ((phase - a["t"]) % 1) / span
    k = 0.0 if defn.get("ease") == "step" else k * k * (3 - 2 * k)
    scroll = defn.get("scroll", 0) / 100
    offset = ctx.t * factor * scroll * 0.5
    loop = scroll != 0
    hard = defn.get("hard", False)
    out = []
    for i in range(n):
        p = ((i / n - offset) % 1) if loop else i / max(1, n - 1)
        out.append(lerp(_gradient(a["stops"], p, loop, hard), _gradient(b["stops"], p, loop, hard), k))
    return out


def screen_effect(cfg, smooth, ctx):
    screen = ctx.sources.get("screen")
    n = ctx.n
    if screen is None:
        return [(0, 0, 0)] * n
    region = cfg.get("region") or {"x": 0, "y": 0, "w": 1, "h": 1, "mode": "avg"}
    target = screen.sample(region, n)
    prev = ctx.state.get("prev")
    k = 0.15 + (1 - smooth) * 0.85  # how far to move towards the new colour each frame
    if prev is not None and len(prev) == n:
        target = prev + (target - prev) * k
    ctx.state["prev"] = target
    out = []
    for r, g, b in target:  # boost saturation a bit: LEDs look washed out otherwise
        h, s_, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
        out.append(hsv(h, min(1.0, s_ * 1.35), v))
    return out


class EffectEngine:
    def __init__(self, get_backend, get_global_brightness):
        self._get_backend = get_backend
        self._brightness = get_global_brightness
        self.assignments = {}   # target key -> cfg
        self.overrides = {}     # target key -> cfg drawn on top (LED count finder)
        self._states = {}
        self._frames = {}       # device id -> unscaled colours we last drew
        self._dirty = set()
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self.sources = {"audio": AudioSource(), "screen": ScreenSource(), "keyboard": KeyboardSource()}
        self.last_error = None
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    # ---- assignment API (keys: "dev" or "dev:zone")
    def assign(self, key, cfg):
        key = str(key)
        with self._lock:
            dev = key.split(":")[0]
            if ":" not in key:  # whole device: drop its per-zone settings
                for k in [k for k in self.assignments if k.startswith(dev + ":")]:
                    del self.assignments[k]
            self.assignments[key] = cfg
            self._states.pop(key, None)
            self._dirty.add(dev)
        self._update_sources()

    def release(self, dev_id):
        """Stop software control of a device (e.g. it switched to a hardware mode)."""
        dev = str(dev_id)
        with self._lock:
            for k in [k for k in self.assignments if k == dev or k.startswith(dev + ":")]:
                del self.assignments[k]
            self._dirty.discard(dev)
        self._update_sources()

    def set_override(self, key, cfg):
        with self._lock:
            if cfg is None:
                self.overrides.pop(str(key), None)
            else:
                self.overrides[str(key)] = cfg
            self._dirty.add(str(key).split(":")[0])

    def reset(self):
        with self._lock:
            self.assignments.clear()
            self.overrides.clear()
            self._states.clear()
            self._frames.clear()
            self._dirty.clear()
        self._update_sources()

    def mark_all_dirty(self):
        with self._lock:
            self._dirty.update(k.split(":")[0] for k in self.assignments)

    def _update_sources(self):
        needed = {EFFECTS.get(c["effect"], (None,) * 5)[4] for c in self.assignments.values()}
        for name, src in self.sources.items():
            if name in needed:
                src.start()
            elif src.running:
                src.stop()

    def source_errors(self):
        return {k: s.error for k, s in self.sources.items() if s.error}

    # ---- rendering
    @staticmethod
    def _layout(dev):
        """Zone LED ranges, normalized key names and (row, col) per LED for one device."""
        ranges, start = [], 0
        for z in dev["zones"]:
            ranges.append((start, z["leds"]))
            start += z["leds"]
        names = [normalize_key(x) if x else "" for x in dev.get("led_names", [])]
        positions = [None] * dev["leds"]
        for zi, z in enumerate(dev["zones"]):
            matrix = z.get("matrix")
            zs = ranges[zi][0]
            if matrix:
                for r, row in enumerate(matrix):
                    for c, led in enumerate(row):
                        if led is not None and zs + led < len(positions):
                            positions[zs + led] = (r, c)
            for i in range(z["leds"]):
                if positions[zs + i] is None:
                    positions[zs + i] = (zi * 2, i)
        return ranges, names, positions

    def _ctx(self, key, n, t, dt, names, positions):
        return Ctx(n, t, dt, self._states.setdefault(key, {}), names, positions,
                   {k: s for k, s in self.sources.items() if s.running})

    def _run(self):
        start = time.monotonic()
        last = start
        while not self._stop.is_set():
            tick = time.monotonic()
            t, dt = tick - start, tick - last
            last = tick
            backend = self._get_backend()
            gb = self._brightness() / 100
            with self._lock:
                jobs = {}
                for k, c in list(self.assignments.items()) + [(k, c) for k, c in self.overrides.items()]:
                    jobs.setdefault(k.split(":")[0], []).append((k, dict(c)))
                dirty, self._dirty = self._dirty, set()
                has_override = {k.split(":")[0] for k in self.overrides}
            for dev_key, items in jobs.items():
                animated = any(EFFECTS.get(c["effect"], ("",) * 4)[3] for _, c in items) or dev_key in has_override
                if not (animated or dev_key in dirty):
                    continue
                try:
                    dev_id = int(dev_key)
                    dev = backend.devices[dev_id]
                    if dev_key in dirty:
                        backend.prepare_direct(dev_id)
                    ranges, names, positions = self._layout(dev)
                    frame = list(self._frames.get(dev_id) or backend.frame.get(dev_id, []))[:dev["leds"]]
                    frame += [(0, 0, 0)] * (dev["leds"] - len(frame))
                    # device-wide first, then zones, then overrides
                    items.sort(key=lambda kc: (kc[0] in self.overrides and kc[1].get("effect") == "count_test",
                                               ":" in kc[0]))
                    for key, cfg in items:
                        if ":" in key:
                            zi = int(key.split(":")[1])
                            if zi >= len(ranges):
                                continue
                            lo, cnt = ranges[zi]
                        else:
                            lo, cnt = 0, dev["leds"]
                        ctx = self._ctx(key, cnt, t, dt, names[lo:lo + cnt], positions[lo:lo + cnt])
                        frame[lo:lo + cnt] = render(cfg, ctx)
                    self._frames[dev_id] = frame
                    backend.push(dev_id, [scale(c, gb) for c in frame])
                    self.last_error = None
                except Exception as exc:  # connection lost, device gone, ...
                    self.last_error = str(exc)
            self._stop.wait(max(0.0, 1 / FPS - (time.monotonic() - tick)))

    def stop(self):
        self._stop.set()
        for src in self.sources.values():
            src.stop()
