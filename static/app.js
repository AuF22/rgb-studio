"use strict";

const $ = (s) => document.querySelector(s);
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};

const ICONS = {
  motherboard: '<rect x="3" y="3" width="18" height="18" rx="2"/><rect x="8" y="8" width="8" height="8" rx="1"/><path d="M3 8h2M3 12h2M3 16h2M19 8h2M19 12h2M19 16h2"/>',
  ram: '<rect x="2" y="7" width="20" height="10" rx="1"/><path d="M6 17v3M10 17v3M14 17v3M18 17v3M6 10v4M10 10v4M14 10v4M18 10v4"/>',
  gpu: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="9" cy="12" r="3"/><circle cx="17" cy="12" r="2"/><path d="M4 18v2"/>',
  cooler: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2"/><path d="M12 10c0-3 1-5 3-5M14 12c3 0 5 1 5 3M12 14c0 3-1 5-3 5M10 12c-3 0-5-1-5-3"/>',
  keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
  mouse: '<rect x="6" y="3" width="12" height="18" rx="6"/><path d="M12 7v4"/>',
  ledstrip: '<path d="M3 12h18"/><circle cx="6" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="18" cy="12" r="1.5"/>',
  headset: '<path d="M3 14v-2a9 9 0 0 1 18 0v2"/><rect x="2" y="14" width="5" height="7" rx="2"/><rect x="17" y="14" width="5" height="7" rx="2"/>',
  case: '<rect x="6" y="2" width="12" height="20" rx="2"/><circle cx="12" cy="15" r="3"/><path d="M9 6h6"/>',
  accessory: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
};
const TYPE_NAMES = {
  motherboard: "Материнская плата", ram: "Оперативная память", gpu: "Видеокарта", cooler: "Охлаждение",
  keyboard: "Клавиатура", mouse: "Мышь", ledstrip: "LED-лента", headset: "Гарнитура", case: "Корпус",
  mousemat: "Коврик", light: "Светильник", speaker: "Колонки", storage: "Накопитель", accessory: "Устройство",
};
const SWATCHES = ["#ff0040", "#ff6a00", "#ffd000", "#00ff6a", "#00e5ff", "#0066ff", "#7c5cff", "#ff00d4", "#ffffff", "#ffb380"];

const st = {
  devices: [], assignments: {}, effects: [], settings: {}, profiles: [], status: {},
  selected: new Set(),
  ui: { effect: "wave", colors: ["#7c5cff", "#00d4ff"], active: 0, speed: 50, brightness: 100, reverse: false },
  hwMode: null,
  ledEls: {},
};

/* ---------- api ---------- */
async function api(path, body, method) {
  const res = await fetch(path, {
    method: method || (body ? "POST" : "GET"),
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Ошибка ${res.status}`);
  return data;
}

function toast(msg, kind) {
  const t = el("div", `toast ${kind || ""}`, msg);
  $("#toasts").append(t);
  setTimeout(() => t.remove(), 3800);
}

const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

/* ---------- state ---------- */
async function loadState(keepSelection) {
  const data = await api("/api/state");
  const firstLoad = !st.devices.length;
  Object.assign(st, data);
  const ids = new Set(st.devices.map((d) => String(d.id)));
  const valid = (k) => { const [d, z] = k.split(":"); const dev = st.devices[+d]; return dev && (z === undefined || +z < dev.zones.length); };
  const known = st.knownIds || new Set();
  if (!keepSelection || firstLoad) st.selected = new Set(ids);
  else st.selected = new Set([...st.selected].filter(valid).concat([...ids].filter((i) => !known.has(i))));
  st.knownIds = ids;
  syncUiFromSelection();
  renderAll();
}

function cfgFor(key) { return st.assignments[key] || st.assignments[key.split(":")[0]]; }

function syncUiFromSelection() {
  const first = [...st.selected][0];
  const cfg = first && cfgFor(first);
  if (cfg) Object.assign(st.ui, cfg, { active: Math.min(st.ui.active, cfg.colors.length - 1) });
}

function targets() { return [...st.selected]; }
const devKey = (d) => String(d.id);
const effectTitle = (id) => (st.effects.find((e) => e.id === id) || {}).title || id;

/* ---------- render ---------- */
function renderAll() {
  renderStatus();
  renderDevices();
  renderPreview();
  renderEffects();
  renderColors();
  renderSliders();
  renderModes();
  renderProfiles();
}

const bannerHidden = new Set();

function bannerFor(s) {
  const e = s.engine || {};
  if (s.phase === "starting") return { kind: "info", key: "starting", text: "Запускаю движок подсветки и ищу устройства… Это занимает до 20 секунд." };
  if (s.mode === "demo") {
    if (s.error) return { kind: "err", key: "fail", text: `Движок подсветки не запустился: ${s.error}. Показаны демо-устройства.`, action: "Повторить", run: reconnect };
    return { kind: "", key: "demo", text: "Демо-режим: устройства виртуальные, подсветка компьютера не меняется.", action: "Подключить устройства", run: reconnect };
  }
  if (!e.admin) return { kind: "", key: "admin", text: "Оперативная память и часть устройств видны только с правами администратора.", action: "Перезапустить от администратора", run: elevate };
  if (!e.pawnio && e.pawnio_setup) return { kind: "", key: "pawnio", text: "Для управления памятью и материнской платой нужен драйвер PawnIO (ставится один раз).", action: "Установить драйвер", run: installPawnio };
  if (s.error) return { kind: "err", key: "err", text: s.error };
  return null;
}

function renderStatus() {
  const s = st.status;
  const pill = $("#statusPill");
  const ext = s.engine && s.engine.state === "external";
  pill.className = "status-pill " + (s.phase === "starting" ? "starting" : s.mode === "openrgb" ? "ok" : "demo");
  $("#statusText").textContent =
    s.phase === "starting" ? "Поиск устройств…" :
    s.mode === "openrgb" ? `${ext ? "OpenRGB" : "Подключено"} · устройств: ${st.devices.length}` : "Демо-режим";

  const banner = $("#banner");
  const b = bannerFor(s);
  if (!b || bannerHidden.has(b.key)) { banner.hidden = true; }
  else {
    banner.hidden = false;
    banner.className = "banner " + b.kind;
    $("#bannerText").textContent = b.text;
    const btn = $("#bannerAction");
    btn.hidden = !b.action;
    btn.textContent = b.action || "";
    btn.onclick = b.run || null;
    $("#bannerClose").onclick = () => { bannerHidden.add(b.key); banner.hidden = true; };
  }
  $("#masterBrightness").value = st.settings.brightness;
  $("#masterValue").textContent = st.settings.brightness + "%";
  renderEngineInfo();
}

function renderEngineInfo() {
  const e = st.status.engine || {};
  const yes = (v, good, bad) => `<b class="${v ? "good" : "bad"}">${v ? good : bad}</b>`;
  const engineText = { running: "работает (встроенный)", external: "внешний OpenRGB", starting: "запускается…",
    missing: "не найден", failed: "ошибка", idle: "остановлен" }[e.state] || "—";
  $("#engineInfo").innerHTML = `
    <span>Движок</span>${yes(["running", "external"].includes(e.state), engineText, engineText)}
    <span>Устройств найдено</span><b>${st.status.mode === "openrgb" ? st.devices.length : 0}</b>
    <span>Права администратора</span>${yes(e.admin, "есть", "нет")}
    <span>Драйвер памяти/платы (PawnIO)</span>${yes(e.pawnio, "установлен", "не установлен")}`;
}

async function reconnect() {
  st.status.phase = "starting"; renderStatus();
  try {
    const r = await api("/api/connect", {});
    await loadState(false);
    if (r.ok) toast(`Готово: найдено устройств — ${st.devices.length}`, "ok");
    else toast(r.status.error || "Не удалось запустить движок", "err");
  } catch (e) { toast(e.message, "err"); }
}

async function elevate() {
  try {
    await api("/api/elevate", {});
    toast("Перезапускаю с правами администратора…");
    setTimeout(() => window.close(), 800);
  } catch (e) { toast(e.message, "err"); }
}

async function installPawnio() {
  toast("Устанавливаю драйвер PawnIO — подтвердите запрос Windows…");
  try {
    const r = await api("/api/pawnio/install", {});
    toast(r.reboot ? "Драйвер установлен. Перезагрузите компьютер, чтобы он заработал." : "Драйвер установлен, перезапускаю движок…", "ok");
    setTimeout(() => loadState(false), 1500);
  } catch (e) { toast(e.message, "err"); }
}

function renderDevices() {
  const list = $("#deviceList");
  list.innerHTML = "";
  if (!st.devices.length) {
    list.append(el("div", "empty", st.status.phase === "starting"
      ? "Ищу устройства…"
      : "Устройства не найдены. Попробуйте «Пересканировать» или перезапустите приложение от имени администратора."));
  }
  st.expanded = st.expanded || new Set();
  for (const d of st.devices) {
    const key = devKey(d);
    const card = el("div", "device" + (st.selected.has(key) ? " selected" : ""));
    const cfg = st.assignments[key];
    const zoneCfgs = d.zones.filter((_, zi) => st.assignments[`${key}:${zi}`]).length;
    const what = cfg ? effectTitle(cfg.effect) : zoneCfgs ? "зоны по отдельности" : d.active_mode;
    const multi = d.zones.length > 1;
    card.innerHTML = `
      <div class="device-icon"><svg viewBox="0 0 24 24">${ICONS[d.type] || ICONS.accessory}</svg></div>
      <div style="min-width:0">
        <div class="device-name" title="${esc(d.name)}">${esc(d.name)}</div>
        <div class="device-meta">${TYPE_NAMES[d.type] || "Устройство"} · ${d.leds} LED · ${esc(what || "")}</div>
        <div class="device-strip" data-strip="${d.id}"></div>
      </div>
      ${multi ? `<button class="expand" title="Зоны по отдельности">${st.expanded.has(key) ? "▾" : "▸"} ${d.zones.length}</button>` : "<span></span>"}
      <div class="check"></div>`;
    card.onclick = (ev) => toggleKey(key, ev.ctrlKey || ev.metaKey);
    if (multi) card.querySelector(".expand").onclick = (ev) => {
      ev.stopPropagation();
      st.expanded.has(key) ? st.expanded.delete(key) : st.expanded.add(key);
      renderDevices();
    };
    list.append(card);
    if (multi && st.expanded.has(key)) {
      const zl = el("div", "zone-list");
      d.zones.forEach((z, zi) => {
        const zk = `${key}:${zi}`;
        const zc = st.assignments[zk];
        const row = el("div", "zone-row" + (st.selected.has(zk) ? " selected" : ""),
          `<div class="check"></div><span>${esc(z.name)}</span><span class="zone-fx">${zc ? esc(effectTitle(zc.effect)) : z.leds + " LED"}</span>`);
        row.onclick = (ev) => toggleKey(zk, ev.ctrlKey || ev.metaKey);
        zl.append(row);
      });
      list.append(zl);
    }
  }
  const all = st.devices.length && st.devices.every((d) => st.selected.has(devKey(d)));
  $("#selectAllBtn").textContent = all ? "Снять выбор" : "Выбрать все";
  const zonesSel = [...st.selected].filter((k) => k.includes(":")).length;
  const devSel = st.selected.size - zonesSel;
  $("#targetInfo").textContent = st.selected.size
    ? `Настраиваются: ${devSel ? `устройств ${devSel}` : ""}${devSel && zonesSel ? ", " : ""}${zonesSel ? `зон ${zonesSel}` : ""}`
    : "Выберите устройства слева";
}

function toggleKey(key, only) {
  const dev = key.split(":")[0];
  if (only) st.selected = new Set([key]);
  else if (st.selected.has(key)) st.selected.delete(key);
  else {
    // a device and its own zones are mutually exclusive in the selection
    if (key.includes(":")) st.selected.delete(dev);
    else [...st.selected].filter((k) => k.startsWith(dev + ":")).forEach((k) => st.selected.delete(k));
    st.selected.add(key);
  }
  syncUiFromSelection();
  renderDevices(); renderPreviewSelection(); renderEffects(); renderColors(); renderSliders(); renderModes();
}
const toggleDevice = (id, only) => toggleKey(String(id), only);

function renderPreview() {
  const root = $("#preview");
  root.innerHTML = "";
  st.ledEls = {};
  for (const d of st.devices) {
    const card = el("div", "pv-card");
    card.dataset.id = d.id;
    card.innerHTML = `<div class="pv-title"><b>${esc(d.name)}</b><span>${d.leds} LED</span></div>`;
    const zones = el("div", "pv-zones");
    const leds = [];
    d.zones.forEach((z, zi) => {
      const zone = el("div", "pv-zone");
      let box;
      if (d.type === "cooler" && z.leds >= 6) {
        box = el("div", "ring");
        for (let i = 0; i < z.leds; i++) {
          const a = (i / z.leds) * Math.PI * 2 - Math.PI / 2;
          const led = el("div", "led");
          led.style.left = 28 + Math.cos(a) * 27 + "px";
          led.style.top = 28 + Math.sin(a) * 27 + "px";
          box.append(led); leds.push(led);
        }
      } else {
        box = el("div", "leds" + (d.type === "keyboard" && z.leds > 30 ? " kbd" : ""));
        for (let i = 0; i < Math.min(z.leds, 200); i++) { const led = el("div", "led"); box.append(led); leds.push(led); }
      }
      if (z.leds) zone.append(box);
      if (d.zones.length > 1 || z.resizable) zone.append(el("small", "", esc(z.name)));
      if (z.resizable) zone.append(zoneSizer(d, z, zi));
      zones.append(zone);
    });
    card.append(zones);
    card.onclick = (ev) => toggleDevice(d.id, ev.ctrlKey || ev.metaKey);
    root.append(card);
    st.ledEls[d.id] = leds;
  }
  renderPreviewSelection();
}

function zoneSizer(d, z, zi) {
  const wrap = el("div", "sizer");
  const show = () => {
    wrap.innerHTML = "";
    const b = el("button", "sizer-btn" + (z.leds ? "" : " warn"), z.leds ? `${z.leds} LED · изменить` : "Указать число LED");
    b.title = "Сколько светодиодов в подключённых вентиляторах или ленте";
    b.onclick = (ev) => { ev.stopPropagation(); edit(); };
    const find = el("button", "sizer-btn", "Подобрать");
    find.title = "Подобрать число, глядя на подсветку";
    find.onclick = (ev) => { ev.stopPropagation(); openCountFinder(d, z, zi); };
    wrap.append(b, find);
  };
  const edit = () => {
    wrap.innerHTML = "";
    const inp = el("input");
    inp.type = "number"; inp.min = z.min; inp.max = z.max; inp.value = z.leds || 20;
    const ok = el("button", "sizer-btn", "OK");
    const save = async () => {
      try {
        await api("/api/zone", { device: d.id, zone: zi, size: +inp.value });
        toast(`«${esc(z.name)}»: ${inp.value} LED`, "ok");
        await loadState(true);
      } catch (e) { toast(e.message, "err"); show(); }
    };
    inp.onclick = (ev) => ev.stopPropagation();
    inp.onkeydown = (ev) => { if (ev.key === "Enter") save(); if (ev.key === "Escape") show(); };
    ok.onclick = (ev) => { ev.stopPropagation(); save(); };
    wrap.append(inp, ok);
    inp.focus(); inp.select();
  };
  show();
  return wrap;
}

function renderPreviewSelection() {
  document.querySelectorAll(".pv-card").forEach((c) => {
    const id = c.dataset.id;
    const sel = st.selected.has(id) || [...st.selected].some((k) => k.startsWith(id + ":"));
    c.classList.toggle("selected", sel);
    c.classList.toggle("dim", !sel);
  });
}

function effectSwatch(id, colors) {
  const c = colors.length ? colors : ["#ffffff"];
  const rainbow = "linear-gradient(90deg,#ff3d7f,#ff9a3d,#ffe53d,#3dff8a,#3dd5ff,#7c5cff,#ff3d7f)";
  const loop = (cs) => `linear-gradient(90deg,${[...cs, ...cs, cs[0]].join(",")})`;
  switch (id) {
    case "static": return `background:${c[0]}`;
    case "gradient": return `background:linear-gradient(90deg,${c.length > 1 ? c.join(",") : c[0] + ",#000"})`;
    case "breathing": return `background:${c[0]};animation:breathe 2.4s ease-in-out infinite`;
    case "cycle": return `background:${loop(c)};background-size:400% 100%;animation:slide 6s linear infinite`;
    case "rainbow": return `background:${rainbow};background-size:400% 100%;animation:slide 8s linear infinite`;
    case "wave": return `background:${rainbow};background-size:200% 100%;animation:slide 3s linear infinite`;
    case "color_wave": return `background:${loop(c)};background-size:200% 100%;animation:slide 3s linear infinite`;
    case "comet": return `background:linear-gradient(90deg,#000 0%,#000 30%,${c[0]} 48%,#fff 50%,#000 52%,#000 100%);background-size:200% 100%;animation:slide 1.8s linear infinite`;
    case "off": return "background:repeating-linear-gradient(45deg,#14161f 0 6px,#191c27 6px 12px)";
    case "reactive": return `background:radial-gradient(circle at 35% 50%,${c[0]} 0 14%,transparent 30%),${c[1] || "#0b0c12"}`;
    case "ripple": return `background:radial-gradient(circle at 50% 50%,transparent 0 18%,${c[0]} 22% 30%,transparent 36% 52%,${c[0]}88 56% 62%,transparent 66%),${c[1] || "#0b0c12"}`;
    case "screen": return "background:linear-gradient(90deg,#1e5bff,#7c5cff 30%,#ff5a3d 60%,#ffd23d)";
  }
  return "";
}

function specialSwatch(id, colors) {
  const c = colors.length ? colors : ["#ffffff"];
  if (id === "starry") {
    const pos = [[12, 30], [30, 70], [48, 25], [63, 60], [80, 35], [90, 75], [22, 55], [72, 15]];
    return pos.map(([x, y], i) => `<i class="star" style="left:${x}%;top:${y}%;background:${c[i % c.length]};animation-delay:${(i * 0.37) % 1.6}s"></i>`).join("");
  }
  if (id.startsWith("music_")) {
    return Array.from({ length: 8 }, (_, i) => `<i class="bar" style="left:${i * 12.5 + 1}%;background:${c[i % c.length]};animation-delay:${(i * 0.13) % 0.7}s"></i>`).join("");
  }
  return null;
}

const GROUPS = [
  ["basic", "Эффекты", ""],
  ["keys", "Клавиатура", "реагирует на нажатия; на других устройствах — вспышки"],
  ["music", "Музыка", "подсветка под звук, который играет на компьютере"],
  ["screen", "Экран", "повторяет цвета с монитора"],
];

function renderEffects() {
  const root = $("#effectGrid");
  root.innerHTML = "";
  for (const [group, title, hint] of GROUPS) {
    const items = st.effects.filter((e) => e.group === group);
    if (!items.length) continue;
    const box = el("div", "effect-group", `<h4>${title}${hint ? ` <small>${hint}</small>` : ""}</h4>`);
    const grid = el("div", "effect-grid");
    for (const e of items) {
      const b = el("button", "effect" + (st.ui.effect === e.id ? " active" : ""));
      const special = specialSwatch(e.id, st.ui.colors);
      b.innerHTML = special != null
        ? `<div class="effect-swatch special">${special}</div><span>${e.title}</span>`
        : `<div class="effect-swatch" style="${effectSwatch(e.id, st.ui.colors)}"></div><span>${e.title}</span>`;
      b.onclick = () => selectEffect(e.id);
      grid.append(b);
    }
    box.append(grid);
    root.append(box);
  }
  renderEffectExtra();
}

function selectEffect(id) {
  st.ui.effect = id;
  const max = maxColors(id);
  if (id === "reactive" || id === "ripple") {
    if (st.ui.colors.length < 2) st.ui.colors.push("#000000");
  }
  if (st.ui.colors.length > max) st.ui.colors = st.ui.colors.slice(0, max);
  renderEffects(); renderColors(); renderSliders(); applyNow();
  if (id === "screen" && !Object.values(st.assignments).some((c) => c.effect === "screen" && c.region)) openScreenEditor();
}

function maxColors(id) { return ["static", "comet"].includes(id) ? 1 : ["reactive", "ripple"].includes(id) ? 2 : 6; }

function renderEffectExtra() {
  const box = $("#effectExtra");
  box.innerHTML = "";
  const id = st.ui.effect;
  const err = (st.status.sources || {})[{ music_spectrum: "audio", music_pulse: "audio", music_level: "audio", screen: "screen", reactive: "keyboard", ripple: "keyboard" }[id]];
  if (id === "screen") {
    const b = el("button", "btn primary", "Настроить области экрана");
    b.onclick = openScreenEditor;
    box.append(b);
  }
  if (err) box.append(el("span", "muted", "Ошибка источника: " + esc(err)));
}

function currentEffect() { return st.effects.find((e) => e.id === st.ui.effect) || {}; }

function renderColors() {
  const eff = currentEffect();
  $("#colorRow").style.display = eff.colors ? "" : "none";
  const max = maxColors(st.ui.effect);
  const single = max === 1;
  const box = $("#colorChips");
  box.innerHTML = "";
  const shown = st.ui.colors.slice(0, max);
  $("#colorHint").textContent = { reactive: "1-й — цвет нажатия, 2-й — фон", ripple: "1-й — цвет волны, 2-й — фон",
    starry: "звёзды загораются случайными цветами из палитры", music_spectrum: "цвета от низких частот к высоким",
    music_level: "цвета от тихого к громкому", music_pulse: "цвет меняется на каждый бит" }[st.ui.effect] || "";
  if (st.ui.active >= shown.length) st.ui.active = 0;
  shown.forEach((c, i) => {
    const chip = el("div", "chip" + (i === st.ui.active ? " active" : ""));
    chip.style.background = c;
    chip.style.setProperty("--glow", c);
    const inp = el("input");
    inp.type = "color"; inp.value = c; inp.title = "Нажмите, чтобы выбрать цвет";
    inp.onclick = () => { st.ui.active = i; box.querySelectorAll(".chip").forEach((x, j) => x.classList.toggle("active", j === i)); };
    inp.oninput = () => { setColor(i, inp.value, chip); };
    chip.append(inp);
    if (shown.length > 1) {
      const rm = el("button", "rm", "✕");
      rm.title = "Убрать цвет";
      rm.onclick = (ev) => { ev.stopPropagation(); st.ui.colors.splice(i, 1); st.ui.active = 0; renderColors(); renderEffects(); applyNow(); };
      chip.append(rm);
    }
    box.append(chip);
  });
  $("#addColor").style.display = st.ui.colors.length >= max ? "none" : "";

  const sw = $("#swatches");
  if (!sw.childElementCount) {
    for (const c of SWATCHES) {
      const s = el("button", "swatch");
      s.style.background = c; s.title = c;
      s.onclick = () => { setColor(st.ui.active, c); renderColors(); };
      sw.append(s);
    }
  }
}

function setColor(i, c, chip) {
  st.ui.colors[i] = c;
  if (chip) { chip.style.background = c; chip.style.setProperty("--glow", c); }
  renderEffects();
  applySoon();
}

function renderSliders() {
  const eff = currentEffect();
  $("#speed").value = st.ui.speed; $("#speedVal").textContent = st.ui.speed;
  $("#brightness").value = st.ui.brightness; $("#brightVal").textContent = st.ui.brightness + "%";
  $("#reverse").checked = !!st.ui.reverse;
  $("#speedRow").style.visibility = eff.slider ? "" : "hidden";
  $("#speedLabel").textContent = eff.slider || "Скорость";
  $("#reverseRow").style.display = ["wave", "color_wave", "comet", "music_level"].includes(st.ui.effect) ? "" : "none";
}

function renderModes() {
  const list = $("#modeList");
  list.innerHTML = "";
  const devIds = new Set([...st.selected].map((k) => +k.split(":")[0]));
  const devs = st.devices.filter((d) => devIds.has(d.id));
  if (!devs.length) { list.append(el("div", "empty", "Выберите устройство слева.")); return; }
  let modes = devs[0].modes.filter((m) => m.toLowerCase() !== "direct");
  for (const d of devs.slice(1)) modes = modes.filter((m) => d.modes.includes(m));
  if (!modes.length) { list.append(el("div", "empty", "У выбранных устройств нет общих встроенных режимов. Выберите одно устройство.")); return; }
  const sw = (d) => Object.keys(st.assignments).some((k) => k.split(":")[0] === String(d.id));
  const active = devs.every((d) => d.active_mode === devs[0].active_mode && !sw(d)) ? devs[0].active_mode : null;
  for (const m of modes) {
    const b = el("button", "mode" + (m === active ? " active" : ""), esc(m));
    b.onclick = () => applyHardware(m);
    list.append(b);
  }
}

function renderProfiles() {
  const sel = $("#profileSelect");
  sel.innerHTML = '<option value="">Профили…</option>' + st.profiles.map((p) => `<option>${esc(p)}</option>`).join("");
  const sp = $("#startupProfile");
  sp.innerHTML = '<option value="">Не загружать</option>' + st.profiles.map((p) => `<option ${p === st.settings.startup_profile ? "selected" : ""}>${esc(p)}</option>`).join("");
  const mg = $("#profileManage");
  mg.innerHTML = st.profiles.length ? "" : '<div class="empty">Пока нет сохранённых профилей.</div>';
  for (const p of st.profiles) {
    const row = el("div", "profile-item", `<span>${esc(p)}</span>`);
    const del = el("button", "btn small ghost danger", "Удалить");
    del.type = "button";
    del.onclick = async () => {
      if (!confirm(`Удалить профиль «${p}»?`)) return;
      const r = await api(`/api/profiles/${encodeURIComponent(p)}`, null, "DELETE");
      st.profiles = r.profiles; renderProfiles(); toast("Профиль удалён");
    };
    row.append(del);
    mg.append(row);
  }
}

function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

/* ---------- actions ---------- */
async function applyNow() {
  if (!st.selected.size) { toast("Сначала выберите устройства слева"); return; }
  const cfg = { effect: st.ui.effect, colors: st.ui.colors.slice(0, maxColors(st.ui.effect)), speed: st.ui.speed, brightness: st.ui.brightness, reverse: st.ui.reverse };
  try {
    let r;
    if (cfg.effect === "screen") {
      for (const key of targets()) r = await api("/api/apply", { targets: [key], ...cfg, region: regionFor(key) });
    } else {
      r = await api("/api/apply", { targets: targets(), ...cfg });
    }
    if (r) st.assignments = r.assignments;
    renderDevices(); renderModes(); renderEffectExtra();
  } catch (e) { toast(e.message, "err"); }
}
const applySoon = debounce(applyNow, 90);

async function applyHardware(mode) {
  st.hwMode = mode;
  try {
    const r = await api("/api/hardware", { targets: targets(), mode, color: $("#hwColor").value, speed: +$("#hwSpeed").value });
    if (r.errors && r.errors.length) toast(r.errors.join("<br>"), "err");
    await loadState(true);
    toast(`Режим «${esc(mode)}» включён`, "ok");
  } catch (e) { toast(e.message, "err"); }
}

/* ---------- LED count finder ---------- */
let counting = null;
function openCountFinder(d, z, zi) {
  counting = { device: d.id, zone: zi, name: z.name };
  const dlg = $("#countDlg");
  const start = z.leds || 20;
  $("#countTitle").textContent = `${z.name}: сколько светодиодов?`;
  $("#countRange").max = Math.min(z.max || 300, 300);
  setCount(start);
  dlg.showModal();
}
const sendCount = debounce((n) => counting && api("/api/zone/test", { device: counting.device, zone: counting.zone, count: n }).catch((e) => toast(e.message, "err")), 60);
function setCount(n) {
  n = Math.max(1, Math.min(+$("#countRange").max, n));
  $("#countRange").value = n;
  $("#countValue").textContent = n;
  sendCount(n);
}
async function finishCount(save) {
  if (!counting) return;
  const c = counting; counting = null;
  try {
    const r = await api("/api/zone/test/stop", { device: c.device, zone: c.zone, save: save ? +$("#countRange").value : null });
    if (save) toast(`«${esc(c.name)}»: ${r.size} LED`, "ok");
  } catch (e) { toast(e.message, "err"); }
  $("#countDlg").close();
  loadState(true);
}

/* ---------- screen layout editor ---------- */
const PRESETS = {
  "Весь экран": { x: 0, y: 0, w: 1, h: 1, mode: "avg" },
  "Верх": { x: 0, y: 0, w: 1, h: 0.15, mode: "h" },
  "Низ": { x: 0, y: 0.85, w: 1, h: 0.15, mode: "h" },
  "Лево": { x: 0, y: 0, w: 0.12, h: 1, mode: "v" },
  "Право": { x: 0.88, y: 0, w: 0.12, h: 1, mode: "v" },
  "Центр": { x: 0.3, y: 0.3, w: 0.4, h: 0.4, mode: "avg" },
};
const TARGET_COLORS = ["#7c5cff", "#00d4ff", "#ff3d7f", "#ffd23d", "#3dff8a", "#ff8a3d", "#c86bff", "#4dd0e1"];
st.regions = {};
let screenEd = null;

function regionFor(key) {
  return st.regions[key] || (st.assignments[key] && st.assignments[key].region) || { ...PRESETS["Весь экран"] };
}
function keyLabel(key) {
  const [d, z] = key.split(":");
  const dev = st.devices[+d];
  return dev ? (z === undefined ? dev.name : `${dev.name} · ${dev.zones[+z].name}`) : key;
}

function openScreenEditor() {
  if (!st.selected.size) { toast("Сначала выберите устройства слева"); return; }
  screenEd = { keys: targets(), active: targets()[0], drag: null, grid: null, timer: null };
  for (const k of screenEd.keys) st.regions[k] = { ...regionFor(k) };
  const presets = $("#presetRow");
  presets.innerHTML = "";
  for (const name of Object.keys(PRESETS)) {
    const b = el("button", "btn small ghost", name);
    b.type = "button";
    b.onclick = () => { st.regions[screenEd.active] = { ...PRESETS[name], reverse: $("#regionReverse").checked }; syncRegionInputs(); saveRegions(); };
    presets.append(b);
  }
  renderScreenTargets();
  syncRegionInputs();
  $("#screenDlg").showModal();
  pollScreen();
}

function renderScreenTargets() {
  const box = $("#screenTargets");
  box.innerHTML = "";
  screenEd.keys.forEach((k, i) => {
    const row = el("div", "screen-target" + (k === screenEd.active ? " active" : ""),
      `<i style="background:${TARGET_COLORS[i % TARGET_COLORS.length]}"></i><span>${esc(keyLabel(k))}</span>`);
    row.onclick = () => { screenEd.active = k; renderScreenTargets(); syncRegionInputs(); drawScreen(); };
    box.append(row);
  });
}

function syncRegionInputs() {
  const r = st.regions[screenEd.active];
  $("#regionMode").value = r.mode || "avg";
  $("#regionReverse").checked = !!r.reverse;
  drawScreen();
}

const saveRegions = debounce(async () => {
  if (!screenEd) return;
  const cfg = { effect: "screen", colors: st.ui.colors, speed: st.ui.speed, brightness: st.ui.brightness };
  try {
    let r;
    for (const k of screenEd.keys) r = await api("/api/apply", { targets: [k], ...cfg, region: st.regions[k] });
    if (r) st.assignments = r.assignments;
    st.ui.effect = "screen";
    renderDevices(); renderEffects();
  } catch (e) { toast(e.message, "err"); }
}, 150);

async function pollScreen() {
  if (!screenEd || !$("#screenDlg").open) return;
  try {
    const g = await api("/api/screen/grid");
    screenEd.grid = g;
    const sel = $("#monitorSelect");
    if (sel.options.length !== g.monitors.length) {
      sel.innerHTML = g.monitors.map((m) => `<option value="${m.index}">Монитор ${m.index} · ${m.width}×${m.height}</option>`).join("");
    }
    sel.value = g.monitor;
    sel.hidden = g.monitors.length < 2;
    drawScreen();
  } catch { /* ignore */ }
  screenEd.timer = setTimeout(pollScreen, 250);
}

function drawScreen() {
  const cv = $("#screenCanvas");
  const ctx = cv.getContext("2d");
  const W = cv.width, H = cv.height;
  ctx.clearRect(0, 0, W, H);
  const g = screenEd && screenEd.grid;
  if (g) {
    const cw = W / g.w, ch = H / g.h;
    g.cells.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect((i % g.w) * cw, Math.floor(i / g.w) * ch, cw + 1, ch + 1); });
  }
  if (!screenEd) return;
  screenEd.keys.forEach((k, i) => {
    const r = st.regions[k];
    const color = TARGET_COLORS[i % TARGET_COLORS.length];
    const active = k === screenEd.active;
    ctx.lineWidth = active ? 3 : 1.5;
    ctx.setLineDash(active ? [] : [6, 4]);
    ctx.strokeStyle = color;
    ctx.strokeRect(r.x * W + 1, r.y * H + 1, r.w * W - 2, r.h * H - 2);
    ctx.fillStyle = color + (active ? "33" : "1a");
    ctx.fillRect(r.x * W, r.y * H, r.w * W, r.h * H);
    if (r.mode !== "avg") {  // direction arrow
      ctx.setLineDash([]);
      ctx.beginPath();
      const cx = (r.x + r.w / 2) * W, cy = (r.y + r.h / 2) * H;
      const len = (r.mode === "h" ? r.w * W : r.h * H) * 0.35 * (r.reverse ? -1 : 1);
      const [dx, dy] = r.mode === "h" ? [len, 0] : [0, len];
      ctx.moveTo(cx - dx, cy - dy); ctx.lineTo(cx + dx, cy + dy); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx + dx, cy + dy, 4, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
    }
  });
}

function canvasPoint(ev) {
  const rect = $("#screenCanvas").getBoundingClientRect();
  return [Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width)), Math.min(1, Math.max(0, (ev.clientY - rect.top) / rect.height))];
}

/* ---------- live preview ---------- */
async function pollFrame() {
  try {
    const frame = await api("/api/frame");
    for (const [id, colors] of Object.entries(frame)) {
      const leds = st.ledEls[id];
      if (leds) {
        for (let i = 0; i < leds.length; i++) {
          const c = colors[i] || "#000000";
          leds[i].style.backgroundColor = c;
          leds[i].style.boxShadow = c === "#000000" ? "none" : `0 0 6px ${c}`;
        }
      }
      const strip = document.querySelector(`[data-strip="${id}"]`);
      if (strip && colors.length) {
        const step = Math.max(1, Math.floor(colors.length / 12));
        const pts = colors.filter((_, i) => i % step === 0);
        strip.style.background = pts.length > 1 ? `linear-gradient(90deg,${pts.join(",")})` : pts[0];
      }
    }
  } catch { /* server restarting */ }
  setTimeout(pollFrame, 80);
}

/* ---------- wiring ---------- */
function wire() {
  $("#selectAllBtn").onclick = () => {
    const all = st.devices.every((d) => st.selected.has(devKey(d)));
    st.selected = all ? new Set() : new Set(st.devices.map(devKey));
    syncUiFromSelection(); renderDevices(); renderPreviewSelection(); renderModes();
  };
  $("#addColor").onclick = () => {
    st.ui.colors.push(SWATCHES[(st.ui.colors.length * 3) % SWATCHES.length]);
    st.ui.active = st.ui.colors.length - 1;
    renderColors(); renderEffects(); applyNow();
  };
  $("#speed").oninput = (e) => { st.ui.speed = +e.target.value; $("#speedVal").textContent = st.ui.speed; applySoon(); };
  $("#brightness").oninput = (e) => { st.ui.brightness = +e.target.value; $("#brightVal").textContent = st.ui.brightness + "%"; applySoon(); };
  $("#reverse").onchange = (e) => { st.ui.reverse = e.target.checked; applyNow(); };

  const saveMaster = debounce((v) => api("/api/settings", { brightness: v }), 120);
  $("#masterBrightness").oninput = (e) => {
    st.settings.brightness = +e.target.value;
    $("#masterValue").textContent = e.target.value + "%";
    saveMaster(+e.target.value);
  };

  document.querySelectorAll(".tab").forEach((t) => t.onclick = () => {
    document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x === t));
    $("#tab-effects").hidden = t.dataset.tab !== "effects";
    $("#tab-hardware").hidden = t.dataset.tab !== "hardware";
  });
  $("#hwSpeed").oninput = (e) => { $("#hwSpeedVal").textContent = e.target.value; };
  const reHw = debounce(() => st.hwMode && applyHardware(st.hwMode), 250);
  $("#hwSpeed").onchange = reHw;
  $("#hwColor").onchange = reHw;

  $("#rescanBtn").onclick = async () => {
    try { await api("/api/rescan", {}); await loadState(false); toast("Устройства обновлены", "ok"); }
    catch (e) { toast(e.message, "err"); }
  };

  // profiles
  $("#saveProfileBtn").onclick = async () => {
    const name = prompt("Название профиля:", $("#profileSelect").value || "Мой профиль");
    if (!name) return;
    try { const r = await api("/api/profiles", { name }); st.profiles = r.profiles; renderProfiles(); $("#profileSelect").value = name.trim(); toast(`Профиль «${esc(name)}» сохранён`, "ok"); }
    catch (e) { toast(e.message, "err"); }
  };
  $("#profileSelect").onchange = async (e) => {
    const name = e.target.value;
    if (!name) return;
    try { await api(`/api/profiles/${encodeURIComponent(name)}/load`, {}); await loadState(true); toast(`Загружен профиль «${esc(name)}»`, "ok"); }
    catch (err) { toast(err.message, "err"); }
  };

  // LED count finder
  $("#countRange").oninput = (e) => setCount(+e.target.value);
  $("#countMinus").onclick = () => setCount(+$("#countRange").value - 1);
  $("#countPlus").onclick = () => setCount(+$("#countRange").value + 1);
  $("#countSave").onclick = () => finishCount(true);
  $("#countCancel").onclick = () => finishCount(false);
  $("#countDlg").addEventListener("close", () => finishCount(false));

  // screen editor
  const cv = $("#screenCanvas");
  cv.onmousedown = (ev) => { screenEd.drag = canvasPoint(ev); };
  window.addEventListener("mousemove", (ev) => {
    if (!screenEd || !screenEd.drag) return;
    const [x0, y0] = screenEd.drag, [x1, y1] = canvasPoint(ev);
    const prev = st.regions[screenEd.active];
    const w = Math.abs(x1 - x0), h = Math.abs(y1 - y0);
    st.regions[screenEd.active] = { ...prev, x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.max(w, 0.02), h: Math.max(h, 0.02),
      // long strips spread colours along their length, boxy areas use the average colour
      mode: w * 16 > h * 9 * 3 ? "h" : h * 9 * 3 > w * 16 ? "v" : "avg" };
    drawScreen();
  });
  window.addEventListener("mouseup", () => {
    if (!screenEd || !screenEd.drag) return;
    screenEd.drag = null;
    syncRegionInputs();
    saveRegions();
  });
  $("#regionMode").onchange = (e) => { st.regions[screenEd.active].mode = e.target.value; drawScreen(); saveRegions(); };
  $("#regionReverse").onchange = (e) => { st.regions[screenEd.active].reverse = e.target.checked; drawScreen(); saveRegions(); };
  $("#monitorSelect").onchange = (e) => api("/api/screen/monitor", { monitor: +e.target.value });
  $("#screenDlg").addEventListener("close", () => { if (screenEd) clearTimeout(screenEd.timer); screenEd = null; });

  // settings dialog
  const dlg = $("#settingsDlg");
  const openSettings = async () => {
    $("#hostInput").value = st.settings.host;
    $("#portInput").value = st.settings.port;
    renderProfiles();
    renderEngineInfo();
    dlg.showModal();
    try { $("#autostart").checked = (await api("/api/autostart")).enabled; } catch { /* ignore */ }
  };
  $("#settingsBtn").onclick = openSettings;
  $("#statusPill").onclick = openSettings;
  $("#restartEngineBtn").onclick = () => { dlg.close(); reconnect(); };
  $("#connectBtn").onclick = async () => {
    const btn = $("#connectBtn");
    btn.disabled = true; btn.textContent = "Подключаюсь…";
    try {
      const r = await api("/api/connect", { host: $("#hostInput").value, port: +$("#portInput").value });
      await loadState(false);
      if (r.ok) { toast(`Подключено: найдено устройств — ${st.devices.length}`, "ok"); dlg.close(); }
      else toast(r.status.error || "Не удалось подключиться", "err");
    } finally { btn.disabled = false; btn.textContent = "Подключиться"; }
  };
  $("#demoBtn").onclick = async () => { await api("/api/connect", { demo: true }); await loadState(false); dlg.close(); toast("Включён демо-режим"); };
  $("#autostart").onchange = async (e) => {
    try { const r = await api("/api/autostart", { enabled: e.target.checked }); e.target.checked = r.enabled; toast(r.enabled ? "Автозапуск включён" : "Автозапуск выключен", "ok"); }
    catch (err) { e.target.checked = !e.target.checked; toast(err.message, "err"); }
  };
  $("#startupProfile").onchange = (e) => api("/api/settings", { startup_profile: e.target.value }).then((r) => { st.settings = r.settings; toast("Сохранено", "ok"); });
}

wire();
loadState(false).then(() => {
  // first launch: give the user something alive to look at
  if (!Object.keys(st.assignments).length && st.status.phase === "demo") applyNow();
  pollFrame();
}).catch((e) => toast("Сервер недоступен: " + e.message, "err"));
// follow engine start-up and device discovery
async function pollStatus() {
  try {
    const s = await api("/api/status");
    if (s.version !== st.status.version) await loadState(true);
    else if (JSON.stringify(s) !== JSON.stringify(st.status)) { st.status = s; renderStatus(); }
  } catch { /* server restarting */ }
  setTimeout(pollStatus, st.status.phase === "starting" ? 700 : 3000);
}
setTimeout(pollStatus, 700);
