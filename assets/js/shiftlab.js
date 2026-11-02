// Shift Lab: the same initial scene, nominal vs. one shift axis, compared with a draggable wipe.
import { $, h, badge, getJSON, poster, clamp, onVisible, whenNear } from "./util.js";
import { SyncGroup } from "./sync.js";
import { hbars } from "./charts.js";

const AXES = [
  { k: "lighting", name: "Lighting", d: "a second light, shifted intensity & direction" },
  { k: "texture", name: "Texture", d: "objects, distractors & table re-textured" },
  { k: "background", name: "Background", d: "one of 20 unseen environment maps" },
  { k: "camera", name: "Camera", d: "scene-camera pose & intrinsics perturbed" },
];
const NICE = (id, lbm) => lbm.tasks.find((t) => t.id === id)?.name || id;

export async function initShiftLab() {
  const root = $("#shiftlab");
  if (!root) return;
  const [data, lbm] = await Promise.all([getJSON("assets/data/shift.json"), getJSON("assets/data/lbm.json")]);
  const st = { task: "TurnCupUpsideDown", axis: "texture", split: 0.5 };
  const stage = $("#sl-stage"), bot = stage.querySelector("video.bot"), top = stage.querySelector("video.top"), handle = $("#sl-handle");
  const b0 = $("#sl-b0"), b1 = $("#sl-b1"), axName = $("#sl-axname"), meta = $("#sl-meta");
  bot.muted = true; top.muted = true;

  const sel = $("#sl-task");
  const order = lbm.tasks.map((t) => t.id).filter((id) => data.tasks[id]);
  for (const id of order) sel.append(h("option", { value: id, text: NICE(id, lbm) }));
  sel.value = st.task;
  sel.addEventListener("change", () => { st.task = sel.value; render(); });

  const axBox = $("#sl-axes");
  const axBtns = AXES.map((a) => {
    const b = h("button", { "aria-pressed": "false", onclick: () => { st.axis = a.k; render(); } }, h("b", { text: a.name }), h("span", { text: a.d }));
    axBox.append(b);
    return { a, b };
  });

  const setBadge = (el, ok) => {
    el.className = "badge pop " + (ok ? "ok" : "bad");
    el.replaceChildren(...badge(ok).childNodes);
  };
  const group = new SyncGroup({
    onClipState: (c, ended) => (c.key === "nom" ? b0 : b1).classList.toggle("on", ended),
    onLoading: (on) => stage.classList.toggle("loading", on),
  });

  const avgRows = () => [
    { label: "In-domain (nominal)", value: data.avg.nominal },
    ...AXES.map((a) => ({ label: a.name, value: data.avg[a.k] })),
    { label: "All axes combined", value: data.avg.all },
  ].map((r) => ({ ...r, ours: true }));
  const chart = hbars($("#sl-chart"), avgRows(), { max: 80, highlight: 2, barH: 14, gap: 12, labelW: 150, sub: "13-task average", title: "UniFlow average success with one shift axis at a time" });

  // load = false builds the markup only (no video loading), so the section has its final height early
  function render(load = true) {
    const T = data.tasks[st.task], nom = T.axes.nominal, ax = T.axes[st.axis];
    axBtns.forEach(({ a, b }) => b.setAttribute("aria-pressed", String(a.k === st.axis)));
    axName.textContent = AXES.find((a) => a.k === st.axis).name;
    setBadge(b0, nom.success); setBadge(b1, ax.success);
    for (const [v, c] of [[bot, nom], [top, ax]]) { v.removeAttribute("src"); v.poster = poster(c.video); v.dataset.src = c.video; }
    if (load) group.setClips([{ video: bot, end: nom.dur, key: "nom" }, { video: top, end: ax.dur, key: "ax" }]);
    const t = lbm.tasks.find((x) => x.id === st.task);
    const fields = (ax.fields || []).map((f) => f.replace(/_/g, " ")).join(", ");
    meta.replaceChildren(
      document.createTextNode(`${t.name}, scene #0, videos at 2× speed. Perturbed: ${fields}. `),
      h("strong", { text: `UniFlow success rate on this task: ${t.sr.IN.uniflow.toFixed(1)}% nominal → ${ax.task_sr.toFixed(1)}% with ${AXES.find((a) => a.k === st.axis).name.toLowerCase()} shift.` }));
    chart.update(avgRows(), { highlight: 1 + AXES.findIndex((a) => a.k === st.axis) });
    if (load && visible && !group.userPaused) group.play();
  }

  // wipe handle
  const setSplit = (x) => {
    st.split = clamp(x, 0.02, 0.98);
    top.style.clipPath = `inset(0 0 0 ${st.split * 100}%)`;
    handle.style.left = `${st.split * 100}%`;
    handle.setAttribute("aria-valuenow", String(Math.round(st.split * 100)));
    handle.setAttribute("aria-valuetext", `nominal on the left ${Math.round(st.split * 100)}%, shifted on the right`);
  };
  let drag = false;
  const px = (e) => { const r = stage.getBoundingClientRect(); return (e.clientX - r.left) / r.width; };
  stage.addEventListener("pointerdown", (e) => { drag = true; stage.setPointerCapture(e.pointerId); setSplit(px(e)); });
  stage.addEventListener("pointermove", (e) => { if (drag) setSplit(px(e)); });
  stage.addEventListener("pointerup", () => (drag = false));
  handle.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") { setSplit(st.split - 0.05); e.preventDefault(); }
    if (e.key === "ArrowRight") { setSplit(st.split + 0.05); e.preventDefault(); }
    if (e.key === "Home") { setSplit(0); e.preventDefault(); }
    if (e.key === "End") { setSplit(1); e.preventDefault(); }
  });
  setSplit(0.5);

  let visible = false;
  onVisible(root, (on) => { visible = on; if (on && !group.userPaused) group.play(); else if (!on) group.pause(); }, { threshold: 0.25 });
  render(false);
  whenNear(root, () => render(), "800px");
}
