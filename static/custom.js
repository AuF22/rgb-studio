"use strict";
/* Custom effect builder.
   An effect = keyframes on a loop; each keyframe is a gradient (colour stops along the LEDs).
   Colours blend between keyframes over time, and the whole pattern can scroll along the LEDs.
   renderCustom() mirrors custom_effect() in effects.py so the preview matches the hardware. */

const CE_TEMPLATES = {
  blank: () => ({ duration: 3, scroll: 0, ease: "smooth", hard: false,
    frames: [{ t: 0, stops: [{ pos: 0, color: "#7c5cff" }, { pos: 1, color: "#00d4ff" }] }] }),
  police: () => ({ duration: 0.8, scroll: 0, ease: "step", hard: true, frames: [
    { t: 0, stops: [{ pos: 0, color: "#ff0020" }, { pos: 0.5, color: "#000000" }] },
    { t: 0.25, stops: [{ pos: 0, color: "#000000" }] },
    { t: 0.5, stops: [{ pos: 0, color: "#000000" }, { pos: 0.5, color: "#0030ff" }] },
    { t: 0.75, stops: [{ pos: 0, color: "#000000" }] }] }),
  sunset: () => ({ duration: 12, scroll: 8, ease: "smooth", hard: false, frames: [
    { t: 0, stops: [{ pos: 0, color: "#ff5e3a" }, { pos: 0.5, color: "#ff2a68" }, { pos: 1, color: "#5b2bff" }] },
    { t: 0.5, stops: [{ pos: 0, color: "#ffb347" }, { pos: 0.5, color: "#ff5e3a" }, { pos: 1, color: "#8a2be2" }] }] }),
  fire: () => ({ duration: 1.6, scroll: 35, ease: "smooth", hard: false, frames: [
    { t: 0, stops: [{ pos: 0, color: "#ff2000" }, { pos: 0.3, color: "#ff9000" }, { pos: 0.55, color: "#ff3000" }, { pos: 0.8, color: "#ffd000" }] },
    { t: 0.5, stops: [{ pos: 0, color: "#ff5000" }, { pos: 0.35, color: "#ff1000" }, { pos: 0.6, color: "#ffb000" }, { pos: 0.9, color: "#ff2000" }] }] }),
  aurora: () => ({ duration: 10, scroll: -12, ease: "smooth", hard: false, frames: [
    { t: 0, stops: [{ pos: 0, color: "#00ff9c" }, { pos: 0.4, color: "#00b3ff" }, { pos: 0.7, color: "#7a2cff" }, { pos: 1, color: "#00ff9c" }] },
    { t: 0.5, stops: [{ pos: 0, color: "#00ffd5" }, { pos: 0.5, color: "#4dff00" }, { pos: 0.8, color: "#00a2ff" }, { pos: 1, color: "#00ffd5" }] }] }),
  heartbeat: () => ({ duration: 1.2, scroll: 0, ease: "smooth", hard: false, frames: [
    { t: 0, stops: [{ pos: 0, color: "#200000" }] }, { t: 0.08, stops: [{ pos: 0, color: "#ff0030" }] },
    { t: 0.2, stops: [{ pos: 0, color: "#300000" }] }, { t: 0.3, stops: [{ pos: 0, color: "#ff0030" }] },
    { t: 0.5, stops: [{ pos: 0, color: "#100000" }] }] }),
};

const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgb2hex = (c) => "#" + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
const mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);

function gradientColor(stops, pos, loop, hard) {
  const s = [...stops].sort((a, b) => a.pos - b.pos);
  if (s.length === 1) return hex2rgb(s[0].color);
  if (hard) {
    let pick = s[s.length - 1];  // a stop's colour holds until the next stop
    for (const st of s) if (st.pos <= pos) pick = st;
    if (pos < s[0].pos) pick = loop ? s[s.length - 1] : s[0];
    return hex2rgb(pick.color);
  }
  if (pos <= s[0].pos || pos >= s[s.length - 1].pos) {
    if (!loop) return hex2rgb(pos <= s[0].pos ? s[0].color : s[s.length - 1].color);
    const last = s[s.length - 1], first = s[0];  // wrap around between last and first stop
    const span = 1 - last.pos + first.pos || 1;
    const k = ((pos - last.pos + 1) % 1) / span;
    return mix(hex2rgb(last.color), hex2rgb(first.color), k);
  }
  for (let i = 0; i < s.length - 1; i++) {
    if (pos <= s[i + 1].pos) {
      const k = (pos - s[i].pos) / (s[i + 1].pos - s[i].pos || 1);
      return mix(hex2rgb(s[i].color), hex2rgb(s[i + 1].color), k);
    }
  }
  return hex2rgb(s[s.length - 1].color);
}

function renderCustom(def, n, time, speedFactor = 1) {
  const frames = [...def.frames].sort((a, b) => a.t - b.t);
  const phase = ((time * speedFactor) / Math.max(0.1, def.duration)) % 1;
  let ai = frames.length - 1;
  for (let i = 0; i < frames.length; i++) if (frames[i].t <= phase) ai = i;
  const a = frames[ai], b = frames[(ai + 1) % frames.length];
  const span = ((b.t - a.t + 1) % 1) || 1;
  let k = frames.length === 1 ? 0 : (((phase - a.t) % 1 + 1) % 1) / span;
  k = def.ease === "step" ? 0 : k * k * (3 - 2 * k);
  const scroll = (def.scroll || 0) / 100;
  const offset = time * speedFactor * scroll * 0.5;
  const loop = scroll !== 0;
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = loop ? (((i / n - offset) % 1) + 1) % 1 : i / Math.max(1, n - 1);
    out.push(mix(gradientColor(a.stops, p, loop, def.hard), gradientColor(b.stops, p, loop, def.hard), k));
  }
  return out;
}

function gradientCss(stops, hard) {
  const s = [...stops].sort((a, b) => a.pos - b.pos);
  if (s.length === 1) return s[0].color;
  if (!hard) return `linear-gradient(90deg,${s.map((x) => `${x.color} ${Math.round(x.pos * 100)}%`).join(",")})`;
  const parts = [`${s[s.length - 1].color} 0%`];  // each colour holds until the next stop
  s.forEach((x, i) => { parts.push(`${s[i ? i - 1 : s.length - 1].color} ${Math.round(x.pos * 100)}%`, `${x.color} ${Math.round(x.pos * 100)}%`); });
  parts.push(`${s[s.length - 1].color} 100%`);
  return `linear-gradient(90deg,${parts.join(",")})`;
}

/* ---------- tiles in the effect grid ---------- */
function customTiles() {
  const list = Object.entries(st.custom_effects || {}).map(([id, def]) => ({ custom: id, def }));
  list.push({ custom: null });
  return list;
}

function customSwatch(def) {
  return `background:${gradientCss(def.frames[0].stops, def.hard)};${def.scroll ? "background-size:200% 100%;animation:slide 3s linear infinite" : ""}`;
}

function customTile(e) {
  if (e.custom === null) {
    const b = el("button", "effect effect-new", `<div class="effect-swatch new-swatch">+</div><span>${t("fx.create")}</span>`);
    b.onclick = () => openCustomEditor(null);
    return b;
  }
  const active = st.ui.effect === "custom" && st.ui.custom_id === e.custom;
  const b = el("button", "effect" + (active ? " active" : ""),
    `<div class="effect-swatch" style="${customSwatch(e.def)}"></div><span>${esc(e.def.name)}</span>`);
  b.onclick = () => { st.ui.custom_id = e.custom; selectEffect("custom"); };
  b.ondblclick = () => openCustomEditor(e.custom);
  return b;
}

/* ---------- editor ---------- */
let ce = null;  // { id, def, frame, raf }

function openCustomEditor(id) {
  const src = id && st.custom_effects[id];
  ce = { id, def: src ? JSON.parse(JSON.stringify(src)) : { name: t("ce.defaultName"), ...CE_TEMPLATES.blank() }, frame: 0, raf: 0 };
  $("#ceTemplate").innerHTML = Object.keys(CE_TEMPLATES).map((k) => `<option value="${k}">${t("tpl." + k)}</option>`).join("");
  $("#ceTemplate").value = "";
  $("#ceDelete").hidden = !id;
  ceSyncAll();
  $("#customDlg").showModal();
  const tick = (ts) => { if (!ce) return; ceDrawPreview(ts / 1000); ce.raf = requestAnimationFrame(tick); };
  ce.raf = requestAnimationFrame(tick);
}

function ceSyncAll() {
  const d = ce.def;
  $("#ceName").value = d.name;
  $("#ceDuration").value = Math.round(d.duration * 10);
  $("#ceDurationVal").textContent = t("ce.seconds", { n: d.duration.toFixed(1) });
  $("#ceScroll").value = d.scroll;
  $("#ceScrollVal").textContent = d.scroll;
  $("#ceEase").value = d.ease;
  $("#ceHard").checked = !!d.hard;
  ceRenderTimeline();
  ceRenderFrame();
}

function ceSorted() { return [...ce.def.frames].sort((a, b) => a.t - b.t); }

function ceRenderTimeline() {
  const tl = $("#ceTimeline");
  tl.querySelectorAll(".ce-key").forEach((k) => k.remove());
  ce.def.frames.forEach((f, i) => {
    const k = el("button", "ce-key" + (i === ce.frame ? " active" : ""));
    k.type = "button";
    k.style.left = f.t * 100 + "%";
    k.style.background = gradientCss(f.stops, ce.def.hard);
    k.onclick = () => { ce.frame = i; ceRenderTimeline(); ceRenderFrame(); };
    tl.append(k);
  });
  $("#ceDelFrame").disabled = ce.def.frames.length < 2;
}

function ceRenderFrame() {
  const f = ce.def.frames[ce.frame];
  $("#ceFrameTime").value = Math.round(f.t * 100);
  $("#ceFrameTimeVal").textContent = Math.round(f.t * 100) + "%";
  ceUpdateGradient();
  const box = $("#ceStops");
  box.innerHTML = "";
  f.stops.forEach((stop, i) => {
    const row = el("div", "ce-stop");
    const color = el("input"); color.type = "color"; color.value = stop.color;
    color.oninput = () => { stop.color = color.value; ceRenderTimeline(); ceRenderFrame(); };
    const pos = el("input"); pos.type = "range"; pos.min = 0; pos.max = 100; pos.value = Math.round(stop.pos * 100);
    pos.oninput = () => { stop.pos = +pos.value / 100; lbl.textContent = pos.value + "%"; ceRenderTimeline(); ceUpdateGradient(); };
    const lbl = el("span", "muted", Math.round(stop.pos * 100) + "%");
    const rm = el("button", "btn small ghost", "✕"); rm.type = "button"; rm.title = t("ctl.removeColor");
    rm.disabled = f.stops.length < 2;
    rm.onclick = () => { f.stops.splice(i, 1); ceRenderTimeline(); ceRenderFrame(); };
    row.append(color, pos, lbl, rm);
    box.append(row);
  });
  $("#ceAddStop").disabled = f.stops.length >= 8;
}

function ceUpdateGradient() {
  $("#ceGradient").style.background = gradientCss(ce.def.frames[ce.frame].stops, ce.def.hard);
}

function ceDrawPreview(time) {
  const cv = $("#cePreview"), ctx = cv.getContext("2d");
  const n = 48, w = cv.width / n;
  ctx.clearRect(0, 0, cv.width, cv.height);
  const colors = renderCustom(ce.def, n, time);
  colors.forEach((c, i) => {
    const hex = rgb2hex(c);
    ctx.fillStyle = hex; ctx.shadowColor = hex; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.arc(i * w + w / 2, cv.height / 2, Math.min(w, cv.height) * 0.32, 0, Math.PI * 2); ctx.fill();
  });
  const phase = (time / Math.max(0.1, ce.def.duration)) % 1;
  $("#cePlayhead").style.left = phase * 100 + "%";
}

async function ceSave() {
  const d = ce.def;
  d.name = ($("#ceName").value || "").trim() || t("ce.defaultName");
  try {
    const r = await api("/api/custom", { id: ce.id, ...d });
    st.custom_effects = r.custom_effects;
    st.ui.custom_id = r.id;
    toast(t("ce.saved", { name: esc(d.name) }), "ok");
    ceClose();
    selectEffect("custom");
  } catch (e) { toast(e.message, "err"); }
}

async function ceDelete() {
  if (!ce.id || !confirm(t("ce.confirmDelete", { name: ce.def.name }))) return;
  try {
    const r = await api(`/api/custom/${encodeURIComponent(ce.id)}`, null, "DELETE");
    st.custom_effects = r.custom_effects;
    toast(t("ce.deleted"));
    ceClose();
    await loadState(true);
  } catch (e) { toast(e.message, "err"); }
}

function ceClose() {
  if (ce) cancelAnimationFrame(ce.raf);
  ce = null;
  if ($("#customDlg").open) $("#customDlg").close();
  renderEffects();
}

function wireCustomEditor() {
  $("#ceName").oninput = (e) => { ce.def.name = e.target.value; };
  $("#ceTemplate").onchange = (e) => {
    if (!e.target.value) return;
    const name = ce.def.name;
    ce.def = { name, ...CE_TEMPLATES[e.target.value]() };
    if (!ce.id || name === t("ce.defaultName")) ce.def.name = t("tpl." + e.target.value);
    ce.frame = 0;
    ceSyncAll();
  };
  $("#ceDuration").oninput = (e) => { ce.def.duration = +e.target.value / 10; $("#ceDurationVal").textContent = t("ce.seconds", { n: ce.def.duration.toFixed(1) }); };
  $("#ceScroll").oninput = (e) => { ce.def.scroll = +e.target.value; $("#ceScrollVal").textContent = e.target.value; };
  $("#ceEase").onchange = (e) => { ce.def.ease = e.target.value; };
  $("#ceHard").onchange = (e) => { ce.def.hard = e.target.checked; ceRenderTimeline(); ceUpdateGradient(); };
  $("#ceFrameTime").oninput = (e) => {
    ce.def.frames[ce.frame].t = +e.target.value / 100;
    $("#ceFrameTimeVal").textContent = e.target.value + "%";
    ceRenderTimeline();
  };
  $("#ceAddFrame").onclick = () => {
    if (ce.def.frames.length >= 16) return;
    const cur = ce.def.frames[ce.frame];
    const taken = new Set(ce.def.frames.map((f) => Math.round(f.t * 100)));
    let tt = (Math.round(cur.t * 100) + 25) % 100;
    while (taken.has(tt)) tt = (tt + 7) % 100;
    ce.def.frames.push({ t: tt / 100, stops: JSON.parse(JSON.stringify(cur.stops)) });
    ce.frame = ce.def.frames.length - 1;
    ceRenderTimeline(); ceRenderFrame();
  };
  $("#ceDelFrame").onclick = () => {
    if (ce.def.frames.length < 2) return;
    ce.def.frames.splice(ce.frame, 1);
    ce.frame = 0;
    ceRenderTimeline(); ceRenderFrame();
  };
  $("#ceAddStop").onclick = () => {
    const f = ce.def.frames[ce.frame];
    if (f.stops.length >= 8) return;
    const s = [...f.stops].sort((a, b) => a.pos - b.pos);
    let gap = 0, at = 1;  // put the new stop in the widest gap
    for (let i = 0; i < s.length - 1; i++) if (s[i + 1].pos - s[i].pos > gap) { gap = s[i + 1].pos - s[i].pos; at = (s[i].pos + s[i + 1].pos) / 2; }
    if (s.length === 1) at = s[0].pos < 0.5 ? 1 : 0;
    f.stops.push({ pos: at, color: rgb2hex(gradientColor(f.stops, at, false, false)) });
    ceRenderTimeline(); ceRenderFrame();
  };
  $("#ceSave").onclick = ceSave;
  $("#ceCancel").onclick = ceClose;
  $("#ceDelete").onclick = ceDelete;
  $("#customDlg").addEventListener("close", () => { if (ce) ceClose(); });
}
