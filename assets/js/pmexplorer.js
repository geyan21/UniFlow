// Pointmap explorer: a real demonstration shown as an image you can wipe between RGB and its
// pixel-aligned pointmap (with a live (x, y, z) readout), then lifted into 3D. It runs on the
// same 4D pointmap player as the hero, so every frame of the video is a pointmap.
import { $, $$, h, icon, clamp, whenNear, onVisible, reducedMotion } from "./util.js";
import { createPointmapPlayer } from "./pm4d.js";

const TASKS = [
  { id: "plate-handoff", name: "Plate Handoff" },
  { id: "cup-stacking", name: "Cup Stacking" },
  { id: "plate-placement", name: "Plate Placement" },
  { id: "spoon-sort", name: "Spoon Sort" },
];

export function initPointmapExplorer() {
  const stage = $("#pmx-stage");
  if (!stage) return;
  // scene thumbnails right away, so the panel has its final height before anything loads
  const thumbs = $("#pmx-thumbs");
  for (const t of TASKS) {
    const b = h("button", { "aria-pressed": String(t.id === TASKS[0].id), "data-id": t.id, "aria-label": t.name, title: t.name },
      h("img", { src: `assets/pm4d/${t.id}.jpg`, alt: "", loading: "lazy" }), h("span", { text: t.name }));
    thumbs.append(b);
  }
  whenNear(stage, () => start(stage).catch((e) => console.error(e)), "500px");
}

async function start(stage) {
  const canvas = $("#pmx-gl"), div = $("#pmx-div"), read = $("#pmx-read"), tl = $("#pmx-tl"), tr = $("#pmx-tr");
  const posterEl = $("#pmx-poster"), playBtn = $("#pmx-play"), bar = $("#pmx-bar"), colorSeg = $("#pmx-color");
  const st = { mode: "wipe", split: 0.5, drag: false, hover: null, swept: false, touched: false, ready: false, inView: false };
  // fades blend into the stage colour, so read it from the stylesheet
  const bgc = getComputedStyle(stage).backgroundColor.match(/\d+(\.\d+)?/g)?.slice(0, 3).map((x) => +x / 255) || [0.92, 0.918, 0.886];
  const setPlayIcon = (on) => { playBtn.replaceChildren(icon(on ? "i-pause" : "i-play")); playBtn.setAttribute("aria-label", on ? "Pause" : "Play"); };
  let player = null;
  player = await createPointmapPlayer(canvas, {
    clip: TASKS[0].id, intro: false, interactive: false, liftOnDrag: false, flatFill: 1.0,
    // anchored on the head camera (same pose and field of view, so the lifted cloud starts out as the photo), then
    // turned a little lower and swung gently: depth reads clearly while the view stays where the stereo depth is dense
    anchor: true, yaw: 0, pitch: -5, swing: 12, dolly: 0.92, size: 2.0, shade: 0.55, autoplay: true, stage: bgc,
    onReady: () => { posterEl.classList.add("gone"); st.ready = true; syncUI(); demo(); },
    onTime: (t, d) => { bar.style.width = `${d ? (t / d) * 100 : 0}%`; },
    onState: (s) => { if (s.playing != null) setPlayIcon(s.playing); },
  });
  player.setFlat(true, true);
  // the divider, the pointmap tag and the readout only make sense once the pointmap is drawn (the poster is RGB only)
  function syncUI() {
    const wipe = st.mode === "wipe", live = !!player?.ok && st.ready;
    div.hidden = !wipe || !live; read.hidden = !wipe || !live; tr.hidden = !wipe || !live; colorSeg.hidden = wipe;
  }
  syncUI();
  const place = () => {
    player.setSplit(st.split);
    div.style.left = `${st.split * 100}%`;
    const pct = Math.round(st.split * 100);
    div.setAttribute("aria-valuenow", String(pct));
    div.setAttribute("aria-valuetext", `RGB on the left ${pct}%, pointmap on the right`);
  };
  place();
  if (!player.ok) { posterEl.classList.add("gone"); div.hidden = true; read.hidden = true; }

  // ---- wipe: drag anywhere on the image, or use the arrow keys on the handle
  const pos = (e) => { const r = stage.getBoundingClientRect(); return { x: clamp((e.clientX - r.left) / r.width), y: clamp((e.clientY - r.top) / r.height) }; };
  stage.addEventListener("pointerdown", (e) => {
    st.touched = true;
    if (st.mode !== "wipe" || e.target.closest("button")) return;
    st.drag = true; stage.setPointerCapture(e.pointerId); st.split = pos(e).x; place();
  });
  stage.addEventListener("pointermove", (e) => {
    if (st.mode !== "wipe") return;
    const p = pos(e);
    if (st.drag) { st.split = p.x; place(); }
    st.hover = p; readout(p);
  });
  const up = () => { st.drag = false; };
  stage.addEventListener("pointerup", up); stage.addEventListener("pointercancel", up);
  stage.addEventListener("pointerleave", () => { st.hover = null; });
  div.addEventListener("keydown", (e) => {
    const k = { ArrowLeft: -0.05, ArrowRight: 0.05 }[e.key];
    if (k) { st.split = clamp(st.split + k); place(); e.preventDefault(); }
    if (e.key === "Home") { st.split = 0; place(); e.preventDefault(); }
    if (e.key === "End") { st.split = 1; place(); e.preventDefault(); }
  });

  // live (x, y, z) under the cursor, read from the current video frame
  const f3 = (x) => (x >= 0 ? " " : "−") + Math.abs(x).toFixed(3);
  function readout(p) {
    const u = p.x * 640, v = p.y * 360, q = player.sample(u, v);
    read.replaceChildren();
    if (!q) { read.append(h("span", { text: `pixel (${Math.round(u)}, ${Math.round(v)}) · ` }), document.createTextNode("no depth here")); return; }
    read.append(h("span", { text: `pixel (${Math.round(u)}, ${Math.round(v)}) → ` }), document.createTextNode(`x ${f3(q.X)}  y ${f3(q.Y)}  z ${f3(q.Z)} m`));
  }
  setInterval(() => { if (st.hover && st.mode === "wipe" && player.playing) readout(st.hover); }, 250);

  // the first time the figure is in view and drawn: sweep the divider (photo <-> pointmap), then lift the
  // same pointmap into 3D. Any interaction before that stops the demo.
  function demo() {
    if (st.swept || !st.inView || !st.ready || st.touched || st.mode !== "wipe" || reducedMotion()) return;
    st.swept = true;
    const t0 = performance.now();
    const step = (now) => {
      const k = (now - t0) / 2600;
      if (st.drag || st.touched || st.mode !== "wipe") return;
      if (k > 1) { setTimeout(() => { if (!st.touched && st.mode === "wipe") setMode("3d"); }, 900); return; }
      st.split = 0.5 + 0.32 * Math.sin(k * Math.PI * 2) * (1 - k); place();
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  onVisible(stage, (on) => { st.inView = on; demo(); }, { threshold: 0.5 });

  // ---- view mode: image <-> pointmap wipe, or the lifted 3D cloud
  const modeBtns = $$("#pmx-mode button");
  function setMode(m) {
    modeBtns.forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.mode === m)));
    st.mode = m;
    const is3d = m === "3d";
    player.setFlat(!is3d);
    player.setInteractive(is3d);
    stage.classList.toggle("is3d", is3d);
    syncUI();
    tl.textContent = is3d ? "3D · drag to orbit" : "RGB";
  }
  modeBtns.forEach((b) => b.addEventListener("click", () => { st.touched = true; setMode(b.dataset.mode); }));
  $$("#pmx-color button").forEach((b) => b.addEventListener("click", () => {
    st.touched = true;
    $$("#pmx-color button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    player.setColor(b.dataset.color);
  }));

  // ---- task thumbnails
  $$("#pmx-thumbs button").forEach((b) => b.addEventListener("click", () => {
    st.touched = true;
    $$("#pmx-thumbs button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    posterEl.src = `assets/pm4d/${b.dataset.id}.jpg`;
    st.ready = false; syncUI();
    if (st.mode === "wipe") posterEl.classList.remove("gone");
    player.setClip(b.dataset.id);
    if (st.mode === "wipe") player.setFlat(true, true);
  }));
  playBtn.addEventListener("click", () => player.toggle());
  setPlayIcon(player.playing);
}
