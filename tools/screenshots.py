"""Take README screenshots of the demo UI with headless Edge (Chrome DevTools Protocol).

    py app.py --no-window --demo --port 6830     (in another terminal)
    py tools/screenshots.py

Needs: pip install websocket-client. The screen-editor shot uses a painted picture,
never the real screen.
"""
import base64
import json
import shutil
import subprocess
import tempfile
import time
import urllib.request
from pathlib import Path

import websocket

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs"
APP = "http://127.0.0.1:6830"
PORT = 9333
W, H = 1400, 900

EDGE = next(p for p in [
    shutil.which("msedge"),
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
] if p and Path(p).exists())

PREPARE = """
document.querySelector('#bannerClose').click();
document.querySelector('.device .expand').click();
"""

FAKE_SCREEN = """
(() => {
  const w = 64, h = 36, cells = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const t = y / h, s = x / w;
    const sky = [255 * (0.35 + 0.6 * t), 90 + 80 * t * (1 - s), 160 * (1 - t) + 40];
    const sun = Math.max(0, 1 - Math.hypot(s - 0.68, t - 0.62) * 5);
    const ground = y > h * 0.72 ? 0.25 : 1;
    const c = sky.map((v, i) => Math.min(255, (v + sun * [255, 200, 90][i]) * ground));
    cells.push('#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join(''));
  }
  pollScreen = () => {};  // never fetch the real screen for docs
  toggleKey('0', true); toggleKey('3'); toggleKey('4');
  openScreenEditor();
  screenEd.grid = { w, h, cells, monitors: [], monitor: 1 };
  st.regions['0'] = { x: 0, y: 0, w: 1, h: 0.16, mode: 'h' };
  st.regions['3'] = { x: 0, y: 0.84, w: 1, h: 0.16, mode: 'h' };
  st.regions['4'] = { x: 0, y: 0.16, w: 0.12, h: 0.68, mode: 'v', reverse: true };
  screenEd.active = '4'; renderScreenTargets(); syncRegionInputs();
})();
"""


class Tab:
    def __init__(self, ws_url):
        self.ws = websocket.create_connection(ws_url, timeout=30, suppress_origin=True)
        self.n = 0

    def call(self, method, **params):
        self.n += 1
        self.ws.send(json.dumps({"id": self.n, "method": method, "params": params}))
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get("id") == self.n:
                return msg.get("result", {})

    def js(self, code):
        return self.call("Runtime.evaluate", expression=code, awaitPromise=True)

    def shot(self, name):
        data = self.call("Page.captureScreenshot", format="png")["data"]
        (OUT / name).write_bytes(base64.b64decode(data))
        print("saved", OUT / name)


def main():
    OUT.mkdir(exist_ok=True)
    profile = tempfile.mkdtemp(prefix="rgbstudio-shots-")
    edge = subprocess.Popen([EDGE, "--headless=new", f"--remote-debugging-port={PORT}",
                             f"--user-data-dir={profile}", f"--window-size={W},{H}", "about:blank"])
    try:
        for _ in range(50):
            try:
                targets = json.load(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json"))
                page = next(t for t in targets if t["type"] == "page")
                break
            except Exception:
                time.sleep(0.2)
        tab = Tab(page["webSocketDebuggerUrl"])
        tab.call("Emulation.setDeviceMetricsOverride", width=W, height=H, deviceScaleFactor=1, mobile=False)
        tab.call("Page.navigate", url=APP)
        time.sleep(4)
        tab.js(PREPARE)
        time.sleep(1.5)
        tab.shot("main.png")
        tab.js("document.querySelector('#tab-effects').scrollIntoView({block: 'start'})")
        time.sleep(1)
        tab.shot("effects.png")
        tab.js("document.querySelector('.content').scrollTo(0, 0)")
        tab.js(FAKE_SCREEN)
        time.sleep(1)
        tab.shot("screen-editor.png")
    finally:
        edge.terminate()
        shutil.rmtree(profile, ignore_errors=True)


if __name__ == "__main__":
    main()
