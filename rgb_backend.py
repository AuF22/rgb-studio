"""Backends that talk to the lighting hardware.

OpenRGBBackend wraps the OpenRGB SDK server (TCP, default 127.0.0.1:6742).
DemoBackend emulates a typical PC so the UI works without OpenRGB running.
Both expose the same small interface used by the effect engine.
"""
import threading

DEVICE_TYPES = {
    0: "motherboard", 1: "ram", 2: "gpu", 3: "cooler", 4: "ledstrip",
    5: "keyboard", 6: "mouse", 7: "mousemat", 8: "headset", 9: "headset_stand",
    10: "gamepad", 11: "light", 12: "speaker", 13: "virtual", 14: "storage",
    15: "case", 16: "microphone", 17: "accessory", 18: "keypad",
}


class BaseBackend:
    kind = "base"

    def __init__(self):
        self.lock = threading.Lock()
        self.devices = []  # list of dicts, see _describe()
        self.frame = {}    # device id -> list of (r, g, b)

    def describe(self):
        return self.devices

    def push(self, dev_id, colors):
        """Send a full LED colour list to one device."""
        self.frame[dev_id] = colors

    def set_hardware_mode(self, dev_id, mode_name, color=None, speed=None):
        raise NotImplementedError

    def prepare_direct(self, dev_id):
        """Switch a device into a mode that accepts per-LED colours."""

    def close(self):
        pass


class DemoBackend(BaseBackend):
    kind = "demo"

    LAYOUT = [
        ("ASUS ROG STRIX B650-A", "motherboard", [("Подсветка платы", 6), ("ARGB разъём 1", 12)]),
        ("Kingston FURY Beast DDR5 #1", "ram", [("Планка", 8)]),
        ("Kingston FURY Beast DDR5 #2", "ram", [("Планка", 8)]),
        ("NVIDIA GeForce RTX 4070", "gpu", [("Логотип", 4), ("Боковая полоса", 10)]),
        ("Lian Li UNI FAN SL120 x3", "cooler", [("Вентилятор 1", 16), ("Вентилятор 2", 16), ("Вентилятор 3", 16)]),
        ("HyperX Alloy Origins", "keyboard", [("Клавиши", 87)]),
        ("Logitech G502", "mouse", [("Логотип", 1), ("Полоса", 1)]),
    ]
    MODES = ["Direct", "Static", "Breathing", "Spectrum Cycle", "Rainbow Wave", "Off"]

    def __init__(self):
        super().__init__()
        for i, (name, dtype, zones) in enumerate(self.LAYOUT):
            leds = sum(n for _, n in zones)
            self.devices.append({
                "id": i, "name": name, "type": dtype, "vendor": name.split()[0],
                "zones": [{"name": z, "leds": n} for z, n in zones],
                "leds": leds, "modes": list(self.MODES), "active_mode": "Direct",
            })
            self.frame[i] = [(40, 40, 60)] * leds

    def set_hardware_mode(self, dev_id, mode_name, color=None, speed=None):
        self.devices[dev_id]["active_mode"] = mode_name
        n = self.devices[dev_id]["leds"]
        self.frame[dev_id] = [(0, 0, 0) if mode_name == "Off" else (color or (255, 255, 255))] * n

    def prepare_direct(self, dev_id):
        self.devices[dev_id]["active_mode"] = "Direct"


def _patch_zone_limits():
    """openrgb-python drops a zone's min/max LED count; keep them so the UI can offer resizing."""
    from openrgb import orgb
    if getattr(orgb.Zone, "_rgbstudio_patched", False):
        return
    original = orgb.Zone._update

    def _update(self, data):
        original(self, data)
        self.leds_min, self.leds_max = data.leds_min, data.leds_max

    orgb.Zone._update = _update
    orgb.Zone._rgbstudio_patched = True


class OpenRGBBackend(BaseBackend):
    kind = "openrgb"

    def __init__(self, host="127.0.0.1", port=6742):
        super().__init__()
        from openrgb import OpenRGBClient  # imported lazily so demo works without the package
        from openrgb.utils import RGBColor
        _patch_zone_limits()
        self._RGBColor = RGBColor
        self.host, self.port = host, port
        self.client = OpenRGBClient(host, port, "RGB Studio")
        self._direct = set()
        self._refresh()

    def _refresh(self):
        self.devices = []
        for dev in self.client.devices:
            modes = [m.name for m in dev.modes]
            active = dev.modes[dev.active_mode].name if 0 <= dev.active_mode < len(dev.modes) else ""
            self.devices.append({
                "id": dev.id, "name": dev.name,
                "type": DEVICE_TYPES.get(int(dev.type), "accessory"),
                "vendor": (getattr(dev.metadata, "vendor", "") or "") if getattr(dev, "metadata", None) else "",
                "zones": [self._zone_info(z) for z in dev.zones],
                "leds": len(dev.leds), "modes": modes, "active_mode": active,
            })
            self.frame[dev.id] = [(c.red, c.green, c.blue) for c in dev.colors]

    @staticmethod
    def _zone_info(z):
        lo, hi = getattr(z, "leds_min", 0), getattr(z, "leds_max", 0)
        return {"name": z.name, "leds": len(z.leds), "resizable": hi > lo, "min": lo, "max": hi}

    def resize_zone(self, dev_id, zone_idx, size):
        zone = self._dev(dev_id).zones[zone_idx]
        size = max(zone.leds_min, min(zone.leds_max, int(size)))
        with self.lock:
            zone.resize(size)
        self.rescan()
        return size

    def rescan(self):
        with self.lock:
            self.client.update()
            self._direct.clear()
            self._refresh()

    def _dev(self, dev_id):
        return self.client.devices[dev_id]

    def prepare_direct(self, dev_id):
        if dev_id in self._direct:
            return
        dev = self._dev(dev_id)
        with self.lock:
            try:
                dev.set_custom_mode()
            except Exception:
                pass  # some devices have no Direct/Custom mode; set_colors may still work
        self._direct.add(dev_id)
        self.devices[dev_id]["active_mode"] = dev.modes[dev.active_mode].name

    def push(self, dev_id, colors):
        super().push(dev_id, colors)
        dev = self._dev(dev_id)
        rgb = [self._RGBColor(*c) for c in colors]
        with self.lock:
            dev.set_colors(rgb, fast=True)

    def set_hardware_mode(self, dev_id, mode_name, color=None, speed=None):
        dev = self._dev(dev_id)
        self._direct.discard(dev_id)
        mode = next((m for m in dev.modes if m.name == mode_name), None)
        if mode is None:
            raise ValueError(f"У устройства нет режима «{mode_name}»")
        from openrgb.utils import ModeFlags
        if speed is not None and ModeFlags.HAS_SPEED in mode.flags and mode.speed_min is not None:
            lo, hi = mode.speed_min, mode.speed_max
            mode.speed = round(lo + (hi - lo) * speed / 100)
        if color is not None and mode.colors:
            mode.colors = [self._RGBColor(*color) for _ in mode.colors]
        with self.lock:
            dev.set_mode(mode)
        self.devices[dev_id]["active_mode"] = mode_name
        if color is not None:
            self.frame[dev_id] = [color] * self.devices[dev_id]["leds"]

    def close(self):
        try:
            self.client.disconnect()
        except Exception:
            pass
