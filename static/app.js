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
  const ids = new Set(st.devices.map((d) => d.id));
  if (!keepSelection || firstLoad) st.selected = new Set(ids);
  else st.selected = new Set([...st.selected].filter((i) => ids.has(i)));
  syncUiFromSelection();
  renderAll();
}

function syncUiFromSelection() {
  const first = [...st.selected][0];
  const cfg = st.assignments[first];
  if (cfg) Object.assign(st.ui, cfg, { active: Math.min(st.ui.active, cfg.colors.length - 1) });
}

function targets() { return [...st.selected]; }

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

function renderStatus() {
  const s = st.status;
  const pill = $("#statusPill");
  pill.className = "status-pill " + (s.mode === "openrgb" ? "ok" : "demo");
  $("#statusText").textContent = s.mode === "openrgb" ? `OpenRGB · ${s.host}:${s.port}` : "Демо-режим";
  const banner = $("#banner");
  if (s.mode !== "openrgb") {
    banner.hidden = false;
    $("#bannerText").textContent = s.error
      ? "OpenRGB не найден — показаны демо-устройства. Запустите OpenRGB и включите SDK Server."
      : "Демо-режим: устройства виртуальные, подсветка компьютера не меняется.";
  } else {
    banner.hidden = !s.error;
    $("#bannerText").textContent = s.error || "";
  }
  $("#masterBrightness").value = st.settings.brightness;
  $("#masterValue").textContent = st.settings.brightness + "%";
}

function renderDevices() {
  const list = $("#deviceList");
  list.innerHTML = "";
  if (!st.devices.length) {
    list.append(el("div", "empty", "Устройства не найдены. Запустите OpenRGB от имени администратора и нажмите «Пересканировать»."));
  }
  for (const d of st.devices) {
    const card = el("div", "device" + (st.selected.has(d.id) ? " selected" : ""));
    const cfg = st.assignments[d.id];
    const what = cfg ? (st.effects.find((e) => e.id === cfg.effect) || {}).title : d.active_mode;
    card.innerHTML = `
      <div class="device-icon"><svg viewBox="0 0 24 24">${ICONS[d.type] || ICONS.accessory}</svg></div>
      <div style="min-width:0">
        <div class="device-name" title="${esc(d.name)}">${esc(d.name)}</div>
        <div class="device-meta">${TYPE_NAMES[d.type] || "Устройство"} · ${d.leds} LED · ${esc(what || "")}</div>
        <div class="device-strip" data-strip="${d.id}"></div>
      </div>
      <div class="check"></div>`;
    card.onclick = (ev) => toggleDevice(d.id, ev.ctrlKey || ev.metaKey);
    list.append(card);
  }
  const all = st.devices.length && st.selected.size === st.devices.length;
  $("#selectAllBtn").textContent = all ? "Снять выбор" : "Выбрать все";
  $("#targetInfo").textContent = st.selected.size
    ? `Настраиваются: ${st.selected.size} из ${st.devices.length}`
    : "Выберите устройства слева";
}

function toggleDevice(id, only) {
  if (only) st.selected = new Set([id]);
  else if (st.selected.has(id)) st.selected.delete(id);
  else st.selected.add(id);
  syncUiFromSelection();
  renderDevices(); renderPreviewSelection(); renderEffects(); renderColors(); renderSliders(); renderModes();
}

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
    for (const z of d.zones) {
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
      zone.append(box);
      if (d.zones.length > 1) zone.append(el("small", "", esc(z.name)));
      zones.append(zone);
    }
    card.append(zones);
    card.onclick = (ev) => toggleDevice(d.id, ev.ctrlKey || ev.metaKey);
    root.append(card);
    st.ledEls[d.id] = leds;
  }
  renderPreviewSelection();
}

function renderPreviewSelection() {
  document.querySelectorAll(".pv-card").forEach((c) => {
    const sel = st.selected.has(+c.dataset.id);
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
  }
  return "";
}

function renderEffects() {
  const grid = $("#effectGrid");
  grid.innerHTML = "";
  for (const e of st.effects) {
    const b = el("button", "effect" + (st.ui.effect === e.id ? " active" : ""));
    b.innerHTML = `<div class="effect-swatch" style="${effectSwatch(e.id, st.ui.colors)}"></div><span>${e.title}</span>`;
    b.onclick = () => { st.ui.effect = e.id; renderEffects(); renderColors(); renderSliders(); applyNow(); };
    grid.append(b);
  }
}

function currentEffect() { return st.effects.find((e) => e.id === st.ui.effect) || {}; }

function renderColors() {
  const eff = currentEffect();
  $("#colorRow").style.display = eff.colors ? "" : "none";
  const single = ["static", "comet"].includes(st.ui.effect);
  const box = $("#colorChips");
  box.innerHTML = "";
  const shown = single ? st.ui.colors.slice(0, 1) : st.ui.colors;
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
  $("#addColor").style.display = single || st.ui.colors.length >= 6 ? "none" : "";

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
  $("#speedRow").style.visibility = eff.animated ? "" : "hidden";
  $("#reverseRow").style.display = ["wave", "color_wave", "comet"].includes(st.ui.effect) ? "" : "none";
}

function renderModes() {
  const list = $("#modeList");
  list.innerHTML = "";
  const devs = st.devices.filter((d) => st.selected.has(d.id));
  if (!devs.length) { list.append(el("div", "empty", "Выберите устройство слева.")); return; }
  let modes = devs[0].modes.filter((m) => m.toLowerCase() !== "direct");
  for (const d of devs.slice(1)) modes = modes.filter((m) => d.modes.includes(m));
  if (!modes.length) { list.append(el("div", "empty", "У выбранных устройств нет общих встроенных режимов. Выберите одно устройство.")); return; }
  const active = devs.every((d) => d.active_mode === devs[0].active_mode && !st.assignments[d.id]) ? devs[0].active_mode : null;
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
  const cfg = { effect: st.ui.effect, colors: st.ui.colors, speed: st.ui.speed, brightness: st.ui.brightness, reverse: st.ui.reverse };
  try {
    await api("/api/apply", { targets: targets(), ...cfg });
    for (const id of st.selected) st.assignments[id] = { ...cfg, colors: [...cfg.colors] };
    renderDevices(); renderModes();
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
    st.selected = st.selected.size === st.devices.length ? new Set() : new Set(st.devices.map((d) => d.id));
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

  // settings dialog
  const dlg = $("#settingsDlg");
  const openSettings = (help) => {
    $("#hostInput").value = st.settings.host;
    $("#portInput").value = st.settings.port;
    $("#demoFallback").checked = !!st.settings.demo_fallback;
    renderProfiles();
    dlg.showModal();
    if (help) { const h = $("#helpSection"); h.scrollIntoView({ behavior: "smooth" }); h.classList.remove("flash"); void h.offsetWidth; h.classList.add("flash"); }
  };
  $("#settingsBtn").onclick = () => openSettings(false);
  $("#statusPill").onclick = () => openSettings(false);
  $("#bannerAction").onclick = () => openSettings(true);
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
  $("#demoFallback").onchange = (e) => api("/api/settings", { demo_fallback: e.target.checked }).then((r) => st.settings = r.settings);
  $("#startupProfile").onchange = (e) => api("/api/settings", { startup_profile: e.target.value }).then((r) => { st.settings = r.settings; toast("Сохранено", "ok"); });
}

wire();
loadState(false).then(() => {
  // first launch: give the user something alive to look at
  if (!Object.keys(st.assignments).length && st.status.mode === "demo") applyNow();
  pollFrame();
}).catch((e) => toast("Сервер недоступен: " + e.message, "err"));
setInterval(async () => {
  try {
    const d = await api("/api/state");
    if (JSON.stringify(d.status) !== JSON.stringify(st.status)) { st.status = d.status; renderStatus(); }
  } catch { /* ignore */ }
}, 5000);
