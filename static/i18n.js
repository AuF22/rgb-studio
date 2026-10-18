"use strict";
/* UI translations. t("key", {var}) returns the text in the current language.
   Elements with data-i18n / data-i18n-title / data-i18n-html are filled by applyI18n(). */

const I18N = {
  ru: {
    "status.connecting": "Подключение…", "status.searching": "Поиск устройств…", "status.connected": "Подключено",
    "status.devices": "устройств: {n}", "status.demo": "Демо-режим",
    "top.brightness": "Общая яркость всех устройств", "top.profiles": "Профили…", "top.save": "Сохранить",
    "top.saveTitle": "Сохранить текущую подсветку как профиль", "top.settings": "Настройки", "common.hide": "Скрыть",
    "common.close": "Закрыть", "common.save": "Сохранить", "common.cancel": "Отмена", "common.delete": "Удалить",
    "common.error": "Ошибка {code}",

    "side.devices": "Устройства", "side.selectAll": "Выбрать все", "side.deselect": "Снять выбор",
    "side.rescan": "Пересканировать", "side.searching": "Ищу устройства…",
    "side.none": "Устройства не найдены. Попробуйте «Пересканировать» или перезапустите приложение от имени администратора.",
    "side.zones": "Зоны по отдельности", "side.zonesSeparately": "зоны по отдельности",
    "side.target": "Настраиваются: {what}", "side.targetDevices": "устройств {n}", "side.targetZones": "зон {n}",
    "side.pick": "Выберите устройства слева",

    "type.motherboard": "Материнская плата", "type.ram": "Оперативная память", "type.gpu": "Видеокарта",
    "type.cooler": "Охлаждение", "type.keyboard": "Клавиатура", "type.mouse": "Мышь", "type.ledstrip": "LED-лента",
    "type.headset": "Гарнитура", "type.case": "Корпус", "type.mousemat": "Коврик", "type.light": "Светильник",
    "type.speaker": "Колонки", "type.storage": "Накопитель", "type.accessory": "Устройство",

    "preview.title": "Предпросмотр", "zone.change": "{n} LED · изменить", "zone.set": "Указать число LED",
    "zone.setTitle": "Сколько светодиодов в подключённых вентиляторах или ленте", "zone.find": "Подобрать",
    "zone.findTitle": "Подобрать число, глядя на подсветку",

    "tab.effects": "Эффекты", "tab.hardware": "Встроенные режимы",
    "group.basic": "Эффекты", "group.keys": "Клавиатура", "group.keysHint": "реагирует на нажатия; на других устройствах — вспышки",
    "group.music": "Музыка", "group.musicHint": "подсветка под звук, который играет на компьютере",
    "group.screen": "Экран", "group.screenHint": "повторяет цвета с монитора",
    "group.custom": "Мои эффекты", "group.customHint": "соберите свой эффект из кадров и градиентов",

    "fx.static": "Статичный", "fx.gradient": "Градиент", "fx.breathing": "Дыхание", "fx.cycle": "Смена цветов",
    "fx.rainbow": "Радуга", "fx.wave": "Радужная волна", "fx.color_wave": "Цветная волна", "fx.comet": "Комета",
    "fx.starry": "Звёздная ночь", "fx.reactive": "Нажатия", "fx.ripple": "Волна от нажатия",
    "fx.music_spectrum": "Музыка: спектр", "fx.music_pulse": "Музыка: пульс", "fx.music_level": "Музыка: уровень",
    "fx.screen": "Повтор экрана", "fx.off": "Выключить", "fx.custom": "Свой эффект", "fx.create": "Создать эффект",

    "slider.speed": "Скорость", "slider.stars": "Количество звёзд", "slider.fade": "Затухание",
    "slider.rippleSpeed": "Скорость волны", "slider.sensitivity": "Чувствительность", "slider.smooth": "Плавность",
    "ctl.colors": "Цвета", "ctl.addColor": "Добавить цвет", "ctl.pickColor": "Нажмите, чтобы выбрать цвет",
    "ctl.removeColor": "Убрать цвет", "ctl.brightness": "Яркость эффекта", "ctl.reverse": "Обратное направление",
    "ctl.hint": "Изменения применяются сразу к выбранным устройствам.",
    "hint.reactive": "1-й — цвет нажатия, 2-й — фон", "hint.ripple": "1-й — цвет волны, 2-й — фон",
    "hint.starry": "звёзды загораются случайными цветами из палитры", "hint.music_spectrum": "цвета от низких частот к высоким",
    "hint.music_level": "цвета от тихого к громкому", "hint.music_pulse": "цвет меняется на каждый бит",
    "extra.screen": "Настроить области экрана", "extra.sourceError": "Ошибка источника: {err}", "extra.editCustom": "Изменить эффект",

    "hw.hint": "Режимы, которые хранятся в самом устройстве. Работают даже когда RGB Studio закрыта.",
    "hw.color": "Цвет режима", "hw.pick": "Выберите устройство слева.",
    "hw.none": "У выбранных устройств нет общих встроенных режимов. Выберите одно устройство.", "hw.on": "Режим «{mode}» включён",

    "banner.version": "Работает старая копия RGB Studio, а интерфейс уже новый, поэтому часть функций не видна. Закройте её: значок у часов → «Выход», затем снова запустите RGB Studio.",
    "banner.starting": "Запускаю движок подсветки и ищу устройства… Это занимает до 20 секунд.",
    "banner.fail": "Движок подсветки не запустился: {err}. Показаны демо-устройства.", "banner.retry": "Повторить",
    "banner.demo": "Демо-режим: устройства виртуальные, подсветка компьютера не меняется.", "banner.connect": "Подключить устройства",
    "banner.admin": "Оперативная память и часть устройств видны только с правами администратора.",
    "banner.elevate": "Перезапустить от администратора",
    "banner.pawnio": "Для управления памятью и материнской платой нужен драйвер PawnIO (ставится один раз).",
    "banner.installDriver": "Установить драйвер",

    "engine.title": "Движок подсветки", "engine.engine": "Движок", "engine.found": "Устройств найдено",
    "engine.admin": "Права администратора", "engine.pawnio": "Драйвер памяти/платы (PawnIO)",
    "engine.yes": "есть", "engine.no": "нет", "engine.installed": "установлен", "engine.notInstalled": "не установлен",
    "engine.running": "работает (встроенный)", "engine.external": "внешний OpenRGB", "engine.starting": "запускается…",
    "engine.missing": "не найден", "engine.failed": "ошибка", "engine.idle": "остановлен",
    "engine.restart": "Перезапустить движок", "engine.demo": "Демо-режим", "engine.other": "Подключиться к другому OpenRGB",
    "engine.host": "Адрес", "engine.port": "Порт", "engine.connect": "Подключиться", "engine.connecting": "Подключаюсь…",

    "set.title": "Настройки", "set.language": "Язык", "set.startup": "Запуск",
    "set.autostart": "Запускать вместе с Windows (в трей)", "set.startupProfile": "Профиль при запуске",
    "set.noProfile": "Не загружать", "set.profiles": "Профили", "set.noProfiles": "Пока нет сохранённых профилей.",
    "set.about": "О программе",
    "set.aboutText": "RGB Studio управляет подсветкой через встроенный движок <b>OpenRGB</b> (GPL-2.0, openrgb.org) — отдельно ничего устанавливать не нужно. Закрытие окна не выключает подсветку: приложение продолжает работать в трее, выйти можно через значок у часов. Приложение написал Claude (Anthropic).",

    "count.title": "Сколько светодиодов?", "count.titleZone": "{zone}: сколько светодиодов?",
    "count.text": "Светодиоды ARGB не сообщают, сколько их подключено, поэтому подберём на глаз. Двигайте ползунок, пока <b>красный</b> огонёк не окажется на <b>последнем</b> светодиоде вентилятора или ленты. Если вентиляторы соединены цепочкой — до конца последнего.",

    "screen.title": "Области экрана", "screen.text": "Выберите устройство или зону справа и обведите мышкой часть экрана, цвет которой оно будет повторять.",
    "screen.monitor": "Монитор", "screen.monitorN": "Монитор {n} · {w}×{h}", "screen.mode": "Как раскладывать цвета",
    "screen.avg": "Средний цвет области", "screen.h": "Слева направо", "screen.v": "Сверху вниз", "screen.reverse": "В обратную сторону",
    "preset.full": "Весь экран", "preset.top": "Верх", "preset.bottom": "Низ", "preset.left": "Лево", "preset.right": "Право", "preset.center": "Центр",

    "toast.found": "Готово: найдено устройств — {n}", "toast.engineFail": "Не удалось запустить движок",
    "toast.elevating": "Перезапускаю с правами администратора…", "toast.installing": "Устанавливаю драйвер PawnIO — подтвердите запрос Windows…",
    "toast.reboot": "Драйвер установлен. Перезагрузите компьютер, чтобы он заработал.", "toast.driverOk": "Драйвер установлен, перезапускаю движок…",
    "toast.zoneLeds": "«{zone}»: {n} LED", "toast.pickFirst": "Сначала выберите устройства слева", "toast.rescanned": "Устройства обновлены",
    "toast.profileName": "Название профиля:", "toast.profileDefault": "Мой профиль", "toast.profileSaved": "Профиль «{name}» сохранён",
    "toast.profileLoaded": "Загружен профиль «{name}»", "toast.profileDeleted": "Профиль удалён", "toast.profileConfirm": "Удалить профиль «{name}»?",
    "toast.connected": "Подключено: найдено устройств — {n}", "toast.connectFail": "Не удалось подключиться",
    "toast.demoOn": "Включён демо-режим", "toast.autostartOn": "Автозапуск включён", "toast.autostartOff": "Автозапуск выключен",
    "toast.saved": "Сохранено", "toast.serverDown": "Сервер недоступен: {err}",

    "ce.title": "Конструктор эффекта", "ce.name": "Название", "ce.defaultName": "Мой эффект",
    "ce.intro": "Эффект — это кадры с градиентами. Между кадрами цвета плавно перетекают, а градиент можно пустить бежать по светодиодам.",
    "ce.template": "Шаблон", "ce.timeline": "Кадры", "ce.addFrame": "+ Кадр", "ce.removeFrame": "Удалить кадр",
    "ce.frameTime": "Момент кадра", "ce.stops": "Градиент кадра", "ce.addStop": "+ Цвет", "ce.duration": "Длина цикла",
    "ce.scroll": "Движение по светодиодам", "ce.scrollHint": "0 — стоит на месте, минус — в обратную сторону",
    "ce.transition": "Переход между кадрами", "ce.smooth": "Плавный", "ce.step": "Резкий",
    "ce.hard": "Резкие границы цветов", "ce.saved": "Эффект «{name}» сохранён", "ce.deleted": "Эффект удалён",
    "ce.confirmDelete": "Удалить эффект «{name}»?", "ce.seconds": "{n} с",
    "tpl.blank": "Пустой", "tpl.police": "Полицейские огни", "tpl.sunset": "Закат", "tpl.fire": "Огонь",
    "tpl.aurora": "Северное сияние", "tpl.heartbeat": "Сердцебиение",
  },

  en: {
    "status.connecting": "Connecting…", "status.searching": "Looking for devices…", "status.connected": "Connected",
    "status.devices": "devices: {n}", "status.demo": "Demo mode",
    "top.brightness": "Brightness of all devices", "top.profiles": "Profiles…", "top.save": "Save",
    "top.saveTitle": "Save the current lighting as a profile", "top.settings": "Settings", "common.hide": "Hide",
    "common.close": "Close", "common.save": "Save", "common.cancel": "Cancel", "common.delete": "Delete",
    "common.error": "Error {code}",

    "side.devices": "Devices", "side.selectAll": "Select all", "side.deselect": "Deselect all",
    "side.rescan": "Rescan", "side.searching": "Looking for devices…",
    "side.none": "No devices found. Try “Rescan” or restart the app as administrator.",
    "side.zones": "Zones separately", "side.zonesSeparately": "zones set separately",
    "side.target": "Editing: {what}", "side.targetDevices": "{n} devices", "side.targetZones": "{n} zones",
    "side.pick": "Pick devices on the left",

    "type.motherboard": "Motherboard", "type.ram": "Memory", "type.gpu": "Graphics card",
    "type.cooler": "Cooling", "type.keyboard": "Keyboard", "type.mouse": "Mouse", "type.ledstrip": "LED strip",
    "type.headset": "Headset", "type.case": "Case", "type.mousemat": "Mouse mat", "type.light": "Light",
    "type.speaker": "Speakers", "type.storage": "Storage", "type.accessory": "Device",

    "preview.title": "Preview", "zone.change": "{n} LEDs · change", "zone.set": "Set LED count",
    "zone.setTitle": "How many LEDs the attached fans or strip have", "zone.find": "Find",
    "zone.findTitle": "Find the count while watching the lights",

    "tab.effects": "Effects", "tab.hardware": "Hardware modes",
    "group.basic": "Effects", "group.keys": "Keyboard", "group.keysHint": "reacts to key presses; other devices flash",
    "group.music": "Music", "group.musicHint": "lighting follows whatever is playing on the PC",
    "group.screen": "Screen", "group.screenHint": "mirrors the colours on your monitor",
    "group.custom": "My effects", "group.customHint": "build your own effect from frames and gradients",

    "fx.static": "Static", "fx.gradient": "Gradient", "fx.breathing": "Breathing", "fx.cycle": "Color cycle",
    "fx.rainbow": "Rainbow", "fx.wave": "Rainbow wave", "fx.color_wave": "Color wave", "fx.comet": "Comet",
    "fx.starry": "Starry Night", "fx.reactive": "Key press", "fx.ripple": "Ripple",
    "fx.music_spectrum": "Music: spectrum", "fx.music_pulse": "Music: pulse", "fx.music_level": "Music: level",
    "fx.screen": "Screen mirror", "fx.off": "Off", "fx.custom": "Custom effect", "fx.create": "Create effect",

    "slider.speed": "Speed", "slider.stars": "Number of stars", "slider.fade": "Fade time",
    "slider.rippleSpeed": "Ripple speed", "slider.sensitivity": "Sensitivity", "slider.smooth": "Smoothing",
    "ctl.colors": "Colors", "ctl.addColor": "Add color", "ctl.pickColor": "Click to pick a color",
    "ctl.removeColor": "Remove color", "ctl.brightness": "Effect brightness", "ctl.reverse": "Reverse direction",
    "ctl.hint": "Changes apply right away to the selected devices.",
    "hint.reactive": "1st: key color, 2nd: background", "hint.ripple": "1st: ripple color, 2nd: background",
    "hint.starry": "stars light up in random colors from the palette", "hint.music_spectrum": "colors from low to high frequencies",
    "hint.music_level": "colors from quiet to loud", "hint.music_pulse": "the color changes on every beat",
    "extra.screen": "Set up screen regions", "extra.sourceError": "Source error: {err}", "extra.editCustom": "Edit effect",

    "hw.hint": "Modes stored in the device itself. They keep running even when RGB Studio is closed.",
    "hw.color": "Mode color", "hw.pick": "Pick a device on the left.",
    "hw.none": "The selected devices share no hardware modes. Pick a single device.", "hw.on": "Mode “{mode}” is on",

    "banner.version": "An old copy of RGB Studio is running behind the new interface, so some features are hidden. Close it (tray icon → Exit) and start RGB Studio again.",
    "banner.starting": "Starting the lighting engine and looking for devices… This takes up to 20 seconds.",
    "banner.fail": "The lighting engine did not start: {err}. Showing demo devices.", "banner.retry": "Retry",
    "banner.demo": "Demo mode: devices are virtual, your PC lighting does not change.", "banner.connect": "Connect devices",
    "banner.admin": "Memory and some devices are only visible with administrator rights.",
    "banner.elevate": "Restart as administrator",
    "banner.pawnio": "Memory and motherboard control needs the PawnIO driver (one-time install).",
    "banner.installDriver": "Install driver",

    "engine.title": "Lighting engine", "engine.engine": "Engine", "engine.found": "Devices found",
    "engine.admin": "Administrator rights", "engine.pawnio": "Memory/motherboard driver (PawnIO)",
    "engine.yes": "yes", "engine.no": "no", "engine.installed": "installed", "engine.notInstalled": "not installed",
    "engine.running": "running (built-in)", "engine.external": "external OpenRGB", "engine.starting": "starting…",
    "engine.missing": "not found", "engine.failed": "error", "engine.idle": "stopped",
    "engine.restart": "Restart engine", "engine.demo": "Demo mode", "engine.other": "Connect to another OpenRGB",
    "engine.host": "Address", "engine.port": "Port", "engine.connect": "Connect", "engine.connecting": "Connecting…",

    "set.title": "Settings", "set.language": "Language", "set.startup": "Startup",
    "set.autostart": "Start with Windows (in the tray)", "set.startupProfile": "Profile at startup",
    "set.noProfile": "Don't load", "set.profiles": "Profiles", "set.noProfiles": "No saved profiles yet.",
    "set.about": "About",
    "set.aboutText": "RGB Studio controls your lighting through the built-in <b>OpenRGB</b> engine (GPL-2.0, openrgb.org), so there is nothing else to install. Closing the window keeps the lighting on: the app stays in the tray, and you can exit from the tray icon. Written by Claude (Anthropic).",

    "count.title": "How many LEDs?", "count.titleZone": "{zone}: how many LEDs?",
    "count.text": "ARGB LEDs can't report how many there are, so let's find it by eye. Move the slider until the <b>red</b> light sits on the <b>last</b> LED of the fan or strip. If fans are daisy-chained, go to the end of the last one.",

    "screen.title": "Screen regions", "screen.text": "Pick a device or zone on the right and drag over the part of the screen whose color it should follow.",
    "screen.monitor": "Monitor", "screen.monitorN": "Monitor {n} · {w}×{h}", "screen.mode": "How colors are laid out",
    "screen.avg": "Average color of the area", "screen.h": "Left to right", "screen.v": "Top to bottom", "screen.reverse": "Reverse direction",
    "preset.full": "Full screen", "preset.top": "Top", "preset.bottom": "Bottom", "preset.left": "Left", "preset.right": "Right", "preset.center": "Center",

    "toast.found": "Done: {n} devices found", "toast.engineFail": "Couldn't start the engine",
    "toast.elevating": "Restarting with administrator rights…", "toast.installing": "Installing the PawnIO driver, please confirm the Windows prompt…",
    "toast.reboot": "Driver installed. Restart your PC to activate it.", "toast.driverOk": "Driver installed, restarting the engine…",
    "toast.zoneLeds": "“{zone}”: {n} LEDs", "toast.pickFirst": "Pick devices on the left first", "toast.rescanned": "Devices refreshed",
    "toast.profileName": "Profile name:", "toast.profileDefault": "My profile", "toast.profileSaved": "Profile “{name}” saved",
    "toast.profileLoaded": "Profile “{name}” loaded", "toast.profileDeleted": "Profile deleted", "toast.profileConfirm": "Delete profile “{name}”?",
    "toast.connected": "Connected: {n} devices found", "toast.connectFail": "Couldn't connect",
    "toast.demoOn": "Demo mode on", "toast.autostartOn": "Autostart on", "toast.autostartOff": "Autostart off",
    "toast.saved": "Saved", "toast.serverDown": "Server unavailable: {err}",

    "ce.title": "Effect builder", "ce.name": "Name", "ce.defaultName": "My effect",
    "ce.intro": "An effect is a set of frames with gradients. Colors flow smoothly from frame to frame, and the gradient can run along the LEDs.",
    "ce.template": "Template", "ce.timeline": "Frames", "ce.addFrame": "+ Frame", "ce.removeFrame": "Remove frame",
    "ce.frameTime": "Frame time", "ce.stops": "Frame gradient", "ce.addStop": "+ Color", "ce.duration": "Loop length",
    "ce.scroll": "Movement along LEDs", "ce.scrollHint": "0 stands still, negative runs the other way",
    "ce.transition": "Transition between frames", "ce.smooth": "Smooth", "ce.step": "Instant",
    "ce.hard": "Hard color edges", "ce.saved": "Effect “{name}” saved", "ce.deleted": "Effect deleted",
    "ce.confirmDelete": "Delete effect “{name}”?", "ce.seconds": "{n} s",
    "tpl.blank": "Blank", "tpl.police": "Police lights", "tpl.sunset": "Sunset", "tpl.fire": "Fire",
    "tpl.aurora": "Aurora", "tpl.heartbeat": "Heartbeat",
  },
};

let LANG = "ru";

function detectLang(saved) {
  if (saved && I18N[saved]) return saved;
  return (navigator.language || "en").toLowerCase().startsWith("ru") ? "ru" : "en";
}

function t(key, vars) {
  let s = (I18N[LANG] && I18N[LANG][key]) ?? I18N.ru[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(v);
  return s;
}

function applyI18n(root = document) {
  document.documentElement.lang = LANG;
  root.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll("[data-i18n-html]").forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
  root.querySelectorAll("[data-i18n-title]").forEach((el) => { el.title = t(el.dataset.i18nTitle); });
}
