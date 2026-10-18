"""Server-side language for messages shown to the user (errors, tray menu)."""
import ctypes

current = {"lang": ""}  # "", "ru" or "en"; empty = follow Windows


def windows_is_russian():
    try:
        return ctypes.windll.kernel32.GetUserDefaultUILanguage() & 0x3FF == 0x19  # LANG_RUSSIAN
    except Exception:
        return False


def lang():
    return current["lang"] or ("ru" if windows_is_russian() else "en")


def tr(ru, en):
    return ru if lang() == "ru" else en
