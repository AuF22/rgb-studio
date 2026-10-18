"""Live inputs for interactive effects: system audio, the screen, and key presses.

Each source runs in its own thread only while some effect uses it (see EffectEngine).
Nothing is stored or sent anywhere: key presses keep only the key name for a few seconds
so the keyboard can light up under your fingers.
"""
import collections
import ctypes
import threading
import time

import numpy as np


class Source:
    def __init__(self):
        self._thread = None
        self._stop = threading.Event()
        self.error = None

    @property
    def running(self):
        return self._thread is not None and self._thread.is_alive()

    def start(self):
        if self.running and self._stop.is_set():
            self._thread.join(timeout=2)  # previous run still winding down
        if self.running:
            return
        self._stop.clear()
        self.error = None
        self._thread = threading.Thread(target=self._guarded, daemon=True)
        self._thread.start()

    def stop(self):
        self._stop.set()

    def _guarded(self):
        try:
            self.run()
        except Exception as exc:  # missing device, permissions, ...
            self.error = str(exc)

    def run(self):
        raise NotImplementedError


# ---------------------------------------------------------------- audio

class AudioSource(Source):
    """Analyses what is playing on the default output device (WASAPI loopback)."""

    BANDS = 24
    RATE = 48000
    BLOCK = 1024

    def __init__(self):
        super().__init__()
        self.bands = np.zeros(self.BANDS)
        self.level = 0.0
        self.bass = 0.0
        self.beat = 0  # increments on every detected beat
        edges = np.geomspace(40, 16000, self.BANDS + 1)
        freqs = np.fft.rfftfreq(self.BLOCK, 1 / self.RATE)
        self._bins = [np.where((freqs >= lo) & (freqs < hi))[0] for lo, hi in zip(edges[:-1], edges[1:])]
        self._bins = [b if len(b) else np.array([np.argmin(abs(freqs - lo))]) for b, lo in zip(self._bins, edges)]
        self._window = np.hanning(self.BLOCK)

    def run(self):
        import soundcard as sc
        import warnings
        warnings.filterwarnings("ignore", category=Warning, module="soundcard")
        peak = np.full(self.BANDS, 1e-3)
        bass_avg = 0.0
        last_beat = 0.0
        while not self._stop.is_set():
            speaker = sc.default_speaker()
            mic = sc.get_microphone(id=str(speaker.name), include_loopback=True)
            with mic.recorder(samplerate=self.RATE, channels=2, blocksize=self.BLOCK) as rec:
                started = time.monotonic()
                while not self._stop.is_set():
                    data = rec.record(numframes=self.BLOCK)
                    mono = data.mean(axis=1) if data.ndim > 1 else data
                    if len(mono) < self.BLOCK:
                        mono = np.pad(mono, (0, self.BLOCK - len(mono)))
                    spec = np.abs(np.fft.rfft(mono[-self.BLOCK:] * self._window))
                    raw = np.array([spec[b].mean() for b in self._bins])
                    peak = np.maximum(peak * 0.995, raw)          # slow auto-gain
                    norm = np.clip(raw / (peak + 1e-9), 0, 1) ** 1.4
                    self.bands = np.maximum(norm, self.bands * 0.82)  # fast attack, smooth release
                    self.level = float(self.bands.mean())
                    bass = float(norm[:4].mean())
                    now = time.monotonic()
                    if bass > 0.6 and bass > bass_avg * 1.5 and now - last_beat > 0.18:
                        self.beat += 1
                        last_beat = now
                    bass_avg = bass_avg * 0.9 + bass * 0.1
                    self.bass = max(bass, self.bass * 0.85)
                    if now - started > 5 and sc.default_speaker().name != speaker.name:
                        break  # output device changed: reopen on the new one


# ---------------------------------------------------------------- screen

class ScreenSource(Source):
    """Keeps a small, colour-averaged copy of one monitor (GRID_W x GRID_H cells)."""

    GRID_W, GRID_H = 64, 36

    def __init__(self):
        super().__init__()
        self.monitor = 1
        self.grid = np.zeros((self.GRID_H, self.GRID_W, 3))
        self.monitors = []

    def list_monitors(self):
        import mss
        with mss.mss() as sct:
            return [{"index": i, "width": m["width"], "height": m["height"]}
                    for i, m in enumerate(sct.monitors) if i > 0]

    def run(self):
        import mss
        with mss.mss() as sct:
            self.monitors = [m for m in sct.monitors[1:]]
            while not self._stop.is_set():
                tick = time.monotonic()
                mon = sct.monitors[min(self.monitor, len(sct.monitors) - 1)]
                shot = np.frombuffer(sct.grab(mon).bgra, dtype=np.uint8).reshape(mon["height"], mon["width"], 4)
                h, w = shot.shape[0] // self.GRID_H * self.GRID_H, shot.shape[1] // self.GRID_W * self.GRID_W
                img = shot[:h:4, :w:4, 2::-1].astype(np.float32)  # every 4th pixel, BGR -> RGB
                gh, gw = img.shape[0] // self.GRID_H, img.shape[1] // self.GRID_W
                img = img[:gh * self.GRID_H, :gw * self.GRID_W]
                self.grid = img.reshape(self.GRID_H, gh, self.GRID_W, gw, 3).mean(axis=(1, 3))
                self._stop.wait(max(0.0, 1 / 30 - (time.monotonic() - tick)))

    def sample(self, region, n):
        """Colours for n LEDs from a normalized region {x, y, w, h, mode: h|v|avg, reverse}."""
        g = self.grid
        x0 = int(np.clip(region.get("x", 0), 0, 0.999) * self.GRID_W)
        y0 = int(np.clip(region.get("y", 0), 0, 0.999) * self.GRID_H)
        x1 = max(x0 + 1, int(np.clip(region.get("x", 0) + region.get("w", 1), 0, 1) * self.GRID_W))
        y1 = max(y0 + 1, int(np.clip(region.get("y", 0) + region.get("h", 1), 0, 1) * self.GRID_H))
        crop = g[y0:y1, x0:x1]
        mode = region.get("mode", "avg")
        if mode == "h":
            line = crop.mean(axis=0)
        elif mode == "v":
            line = crop.mean(axis=1)
        else:
            line = crop.reshape(-1, 3).mean(axis=0, keepdims=True)
        if region.get("reverse"):
            line = line[::-1]
        idx = np.minimum((np.arange(n) * len(line) / max(n, 1)).astype(int), len(line) - 1)
        return line[idx]


# ---------------------------------------------------------------- keyboard

VK_NAMES = {
    0x1B: "Escape", 0x09: "Tab", 0x14: "Caps Lock", 0xA0: "Left Shift", 0xA1: "Right Shift",
    0xA2: "Left Control", 0xA3: "Right Control", 0x5B: "Left Windows", 0x5C: "Right Windows",
    0xA4: "Left Alt", 0xA5: "Right Alt", 0x20: "Space", 0x0D: "Enter", 0x08: "Backspace",
    0x2E: "Delete", 0x2D: "Insert", 0x24: "Home", 0x23: "End", 0x21: "Page Up", 0x22: "Page Down",
    0x25: "Left Arrow", 0x26: "Up Arrow", 0x27: "Right Arrow", 0x28: "Down Arrow",
    0xC0: "`", 0xBD: "-", 0xBB: "=", 0xDB: "[", 0xDD: "]", 0xDC: "\\", 0xE2: "\\",
    0xBA: ";", 0xDE: "'", 0xBC: ",", 0xBE: ".", 0xBF: "/",
    0x2C: "Print Screen", 0x91: "Scroll Lock", 0x13: "Pause/Break", 0x5D: "Menu", 0x90: "Num Lock",
    0x6A: "Number Pad *", 0x6B: "Number Pad +", 0x6D: "Number Pad -", 0x6E: "Number Pad .", 0x6F: "Number Pad /",
}
VK_NAMES.update({0x41 + i: chr(0x41 + i) for i in range(26)})
VK_NAMES.update({0x30 + i: str(i) for i in range(10)})
VK_NAMES.update({0x70 + i: f"F{i + 1}" for i in range(12)})
VK_NAMES.update({0x60 + i: f"Number Pad {i}" for i in range(10)})


def normalize_key(name):
    """'Key: \\ (ANSI)' -> '\\', 'Key: Enter' -> 'enter'."""
    name = name.split(":", 1)[-1].strip()
    if "(" in name:
        name = name[:name.index("(")].strip()
    return name.lower()


class KeyboardSource(Source):
    """Low-level keyboard hook. Keeps only (sequence number, key name) of recent presses."""

    def __init__(self):
        super().__init__()
        self.presses = collections.deque(maxlen=64)
        self.seq = 0
        self._tid = None

    def run(self):
        from ctypes import wintypes
        user32, kernel32 = ctypes.windll.user32, ctypes.windll.kernel32

        class KBDLLHOOKSTRUCT(ctypes.Structure):
            _fields_ = [("vkCode", wintypes.DWORD), ("scanCode", wintypes.DWORD), ("flags", wintypes.DWORD),
                        ("time", wintypes.DWORD), ("dwExtraInfo", ctypes.c_void_p)]

        HOOKPROC = ctypes.WINFUNCTYPE(ctypes.c_ssize_t, ctypes.c_int, wintypes.WPARAM, wintypes.LPARAM)
        user32.CallNextHookEx.argtypes = [wintypes.HHOOK, ctypes.c_int, wintypes.WPARAM, wintypes.LPARAM]
        user32.CallNextHookEx.restype = ctypes.c_ssize_t
        user32.SetWindowsHookExW.argtypes = [ctypes.c_int, HOOKPROC, wintypes.HINSTANCE, wintypes.DWORD]
        user32.SetWindowsHookExW.restype = wintypes.HHOOK
        down = set()

        def proc(code, wparam, lparam):
            if code == 0:
                kb = ctypes.cast(lparam, ctypes.POINTER(KBDLLHOOKSTRUCT)).contents
                if wparam in (0x100, 0x104):  # WM_KEYDOWN, WM_SYSKEYDOWN
                    if kb.vkCode not in down:  # ignore auto-repeat
                        down.add(kb.vkCode)
                        name = VK_NAMES.get(kb.vkCode)
                        if name:
                            self.seq += 1
                            self.presses.append((self.seq, name.lower(), time.monotonic()))
                elif wparam in (0x101, 0x105):
                    down.discard(kb.vkCode)
            return user32.CallNextHookEx(None, code, wparam, lparam)

        callback = HOOKPROC(proc)
        hook = user32.SetWindowsHookExW(13, callback, None, 0)  # WH_KEYBOARD_LL
        if not hook:
            raise OSError("Не удалось подключиться к клавиатуре")
        self._tid = kernel32.GetCurrentThreadId()
        msg = wintypes.MSG()
        try:
            while not self._stop.is_set() and user32.GetMessageW(ctypes.byref(msg), None, 0, 0) > 0:
                pass
        finally:
            user32.UnhookWindowsHookEx(hook)
            self.presses.clear()

    def stop(self):
        super().stop()
        if self._tid:
            ctypes.windll.user32.PostThreadMessageW(self._tid, 0x0012, 0, 0)  # WM_QUIT
