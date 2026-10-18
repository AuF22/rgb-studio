"""Software lighting effects, rendered ~30 times per second and pushed to devices."""
import colorsys
import math
import threading
import time

FPS = 30

# id -> (title, uses colors, animated)
EFFECTS = {
    "static":     ("Статичный",      True,  False),
    "gradient":   ("Градиент",       True,  False),
    "breathing":  ("Дыхание",        True,  True),
    "cycle":      ("Смена цветов",   True,  True),
    "rainbow":    ("Радуга",         False, True),
    "wave":       ("Радужная волна", False, True),
    "color_wave": ("Цветная волна",  True,  True),
    "comet":      ("Комета",         True,  True),
    "off":        ("Выключить",      False, False),
}


def hex_to_rgb(value):
    value = value.lstrip("#")
    return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))


def rgb_to_hex(c):
    return "#%02x%02x%02x" % c


def lerp(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def scale(c, k):
    return tuple(max(0, min(255, round(x * k))) for x in c)


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


def render(cfg, n, t):
    """Return n RGB tuples for one device at time t (seconds)."""
    effect = cfg["effect"]
    colors = [hex_to_rgb(c) for c in cfg.get("colors") or ["#ffffff"]]
    speed = 0.05 + cfg.get("speed", 50) / 100 * 1.45   # cycles per second-ish
    reverse = -1 if cfg.get("reverse") else 1
    if n == 0:
        return []

    if effect == "off":
        out = [(0, 0, 0)] * n
    elif effect == "static":
        out = [colors[0]] * n
    elif effect == "gradient":
        stops = colors if len(colors) > 1 else [colors[0], (0, 0, 0)]
        out = []
        for i in range(n):
            p = i / max(1, n - 1) * (len(stops) - 1)
            k = min(int(p), len(stops) - 2)
            out.append(lerp(stops[k], stops[k + 1], p - k))
    elif effect == "breathing":
        phase = t * speed * 0.6
        idx = int(phase) % len(colors)
        level = (1 - math.cos(phase % 1.0 * 2 * math.pi)) / 2
        out = [scale(colors[idx], 0.03 + 0.97 * level)] * n
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
            k = max(0.0, 1 - d / tail) ** 2 if d <= tail else 0.0
            out.append(scale(colors[0], k))
    else:
        out = [(0, 0, 0)] * n

    return [scale(c, cfg.get("brightness", 100) / 100) for c in out]


class EffectEngine:
    def __init__(self, get_backend, get_global_brightness):
        self._get_backend = get_backend
        self._brightness = get_global_brightness
        self.assignments = {}   # device id -> cfg dict
        self._dirty = set()
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self.last_error = None
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def assign(self, dev_id, cfg):
        with self._lock:
            self.assignments[dev_id] = cfg
            self._dirty.add(dev_id)

    def release(self, dev_id):
        """Stop software control of a device (e.g. it switched to a hardware mode)."""
        with self._lock:
            self.assignments.pop(dev_id, None)
            self._dirty.discard(dev_id)

    def reset(self):
        with self._lock:
            self.assignments.clear()
            self._dirty.clear()

    def mark_all_dirty(self):
        with self._lock:
            self._dirty.update(self.assignments)

    def _run(self):
        start = time.monotonic()
        while not self._stop.is_set():
            tick = time.monotonic()
            backend = self._get_backend()
            gb = self._brightness() / 100
            with self._lock:
                jobs = [(d, dict(c), d in self._dirty) for d, c in self.assignments.items()]
                self._dirty.clear()
            for dev_id, cfg, dirty in jobs:
                animated = EFFECTS.get(cfg["effect"], ("", False, False))[2]
                if not (animated or dirty):
                    continue
                try:
                    dev = backend.devices[dev_id]
                    if dirty:
                        backend.prepare_direct(dev_id)
                    colors = [scale(c, gb) for c in render(cfg, dev["leds"], tick - start)]
                    backend.push(dev_id, colors)
                    self.last_error = None
                except Exception as exc:  # connection lost, device gone, ...
                    self.last_error = str(exc)
            self._stop.wait(max(0.0, 1 / FPS - (time.monotonic() - tick)))

    def stop(self):
        self._stop.set()
