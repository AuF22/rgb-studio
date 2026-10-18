"""Runs the bundled OpenRGB engine invisibly so the user never has to install or open OpenRGB.

Layout next to the app (or the project root in development):
    openrgb/OpenRGB.exe      portable OpenRGB build
    openrgb/PawnIO_setup.exe optional driver installer for RAM / motherboard access
"""
import ctypes
import os
import socket
import subprocess
import sys
import threading
import time
from pathlib import Path

from lang import tr

CREATE_NO_WINDOW = 0x08000000


def app_dir():
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


ENGINE_DIR = app_dir() / "openrgb"
ENGINE_EXE = ENGINE_DIR / "OpenRGB.exe"
PAWNIO_SETUP = ENGINE_DIR / "PawnIO_setup.exe"


def port_open(host, port, timeout=0.3):
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def is_admin():
    try:
        return bool(ctypes.windll.shell32.IsUserAnAdmin())
    except Exception:
        return False


def pawnio_installed():
    try:
        import winreg
        winreg.CloseKey(winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SYSTEM\CurrentControlSet\Services\PawnIO"))
        return True
    except OSError:
        return False


def kill_with_parent(proc):
    """Put the child in a Job Object so Windows kills it if this app dies unexpectedly."""
    from ctypes import wintypes
    k32 = ctypes.windll.kernel32
    k32.CreateJobObjectW.restype = wintypes.HANDLE
    k32.OpenProcess.restype = wintypes.HANDLE

    class BASIC(ctypes.Structure):
        _fields_ = [("PerProcessUserTimeLimit", ctypes.c_int64), ("PerJobUserTimeLimit", ctypes.c_int64),
                    ("LimitFlags", wintypes.DWORD), ("MinimumWorkingSetSize", ctypes.c_size_t),
                    ("MaximumWorkingSetSize", ctypes.c_size_t), ("ActiveProcessLimit", wintypes.DWORD),
                    ("Affinity", ctypes.c_size_t), ("PriorityClass", wintypes.DWORD),
                    ("SchedulingClass", wintypes.DWORD)]

    class IO(ctypes.Structure):
        _fields_ = [(n, ctypes.c_uint64) for n in ("r", "w", "o", "rb", "wb", "ob")]

    class EXTENDED(ctypes.Structure):
        _fields_ = [("BasicLimitInformation", BASIC), ("IoInfo", IO), ("ProcessMemoryLimit", ctypes.c_size_t),
                    ("JobMemoryLimit", ctypes.c_size_t), ("PeakProcessMemoryUsed", ctypes.c_size_t),
                    ("PeakJobMemoryUsed", ctypes.c_size_t)]

    job = k32.CreateJobObjectW(None, None)
    if not job:
        return None
    info = EXTENDED()
    info.BasicLimitInformation.LimitFlags = 0x2000  # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
    k32.SetInformationJobObject(job, 9, ctypes.byref(info), ctypes.sizeof(info))  # ExtendedLimitInformation
    handle = k32.OpenProcess(0x0001 | 0x0100, False, proc.pid)  # PROCESS_TERMINATE | PROCESS_SET_QUOTA
    if handle:
        k32.AssignProcessToJobObject(job, handle)
        k32.CloseHandle(handle)
    return job  # keep the handle open for the app's lifetime


def run_elevated(exe, params="", wait=False, cwd=None):
    """Start a program through the UAC prompt. Returns the exit code when wait=True."""
    from ctypes import wintypes

    class SHELLEXECUTEINFO(ctypes.Structure):
        _fields_ = [
            ("cbSize", wintypes.DWORD), ("fMask", ctypes.c_ulong), ("hwnd", wintypes.HWND),
            ("lpVerb", wintypes.LPCWSTR), ("lpFile", wintypes.LPCWSTR), ("lpParameters", wintypes.LPCWSTR),
            ("lpDirectory", wintypes.LPCWSTR), ("nShow", ctypes.c_int), ("hInstApp", wintypes.HINSTANCE),
            ("lpIDList", ctypes.c_void_p), ("lpClass", wintypes.LPCWSTR), ("hkeyClass", wintypes.HKEY),
            ("dwHotKey", wintypes.DWORD), ("hIcon", wintypes.HANDLE), ("hProcess", wintypes.HANDLE),
        ]

    info = SHELLEXECUTEINFO()
    info.cbSize = ctypes.sizeof(info)
    info.fMask = 0x00000040  # SEE_MASK_NOCLOSEPROCESS
    info.lpVerb = "runas"
    info.lpFile = str(exe)
    info.lpParameters = params
    info.lpDirectory = str(cwd) if cwd else None
    info.nShow = 0 if wait else 1
    if not ctypes.windll.shell32.ShellExecuteExW(ctypes.byref(info)):
        raise PermissionError(tr("Запуск с правами администратора отменён", "The administrator prompt was cancelled"))
    if not wait:
        return None
    ctypes.windll.kernel32.WaitForSingleObject(info.hProcess, 0xFFFFFFFF)
    code = wintypes.DWORD()
    ctypes.windll.kernel32.GetExitCodeProcess(info.hProcess, ctypes.byref(code))
    ctypes.windll.kernel32.CloseHandle(info.hProcess)
    return code.value


def install_pawnio():
    if not PAWNIO_SETUP.exists():
        raise FileNotFoundError(tr("Установщик PawnIO не найден в папке приложения", "The PawnIO installer is missing from the app folder"))
    code = run_elevated(PAWNIO_SETUP, "-install -silent", wait=True)
    if code not in (0, 3010):  # 3010 = installed, reboot required
        raise RuntimeError(tr(f"Установщик PawnIO завершился с кодом {code}", f"The PawnIO installer exited with code {code}"))
    return code == 3010


class OpenRGBRuntime:
    """States: idle, starting, running (our engine), external (someone else's OpenRGB),
    missing (no bundled engine), failed."""

    def __init__(self, host, port, config_dir):
        self.host, self.port = host, port
        self.config_dir = Path(config_dir)
        self.proc = None
        self._job = None
        self.state = "idle"
        self.error = None
        self._lock = threading.Lock()

    @property
    def bundled(self):
        return ENGINE_EXE.exists()

    def start(self, timeout=45):
        """Make sure an SDK server is listening. Blocks until ready or timeout."""
        with self._lock:
            if port_open(self.host, self.port):
                self.state = "running" if self.proc and self.proc.poll() is None else "external"
                return True
            if not self.bundled:
                self.state, self.error = "missing", tr("Встроенный движок OpenRGB не найден", "The built-in OpenRGB engine was not found")
                return False
            self.state, self.error = "starting", None
            self.config_dir.mkdir(parents=True, exist_ok=True)
            args = [str(ENGINE_EXE), "--server", "--server-host", self.host,
                    "--server-port", str(self.port), "--config", str(self.config_dir)]
            try:
                self.proc = subprocess.Popen(args, cwd=str(ENGINE_DIR), creationflags=CREATE_NO_WINDOW,
                                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            except OSError as exc:
                self.state, self.error = "failed", tr(f"Не удалось запустить движок: {exc}", f"Couldn't start the engine: {exc}")
                return False
            try:
                self._job = kill_with_parent(self.proc)
            except Exception:
                pass

        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if self.proc.poll() is not None:
                self.state, self.error = "failed", tr(f"Движок завершился с кодом {self.proc.returncode}", f"The engine exited with code {self.proc.returncode}")
                return False
            if port_open(self.host, self.port):
                self.state = "running"
                return True
            time.sleep(0.25)
        self.state, self.error = "failed", tr("Движок не ответил вовремя", "The engine did not respond in time")
        return False

    def stop(self):
        with self._lock:
            if self.proc and self.proc.poll() is None:
                self.proc.terminate()
                try:
                    self.proc.wait(5)
                except subprocess.TimeoutExpired:
                    self.proc.kill()
            self.proc = None
            if self.state == "running":
                self.state = "idle"

    def info(self):
        return {
            "state": self.state,
            "error": self.error,
            "bundled": self.bundled,
            "admin": is_admin(),
            "pawnio": pawnio_installed(),
            "pawnio_setup": PAWNIO_SETUP.exists(),
        }
