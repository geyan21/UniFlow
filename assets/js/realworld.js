// Real-world (YAM) section: the Plate Handoff head-to-head on one shared clock, and a reel of
// UniFlow evaluation rollouts across the four tasks (each tile plays while it is on screen).
import { $, h, icon, badge, getJSON, poster, onVisible, whenNear } from "./util.js";
import { SyncGroup, bindScrubber } from "./sync.js";
import { C } from "./charts.js";

const PN = { pi05: "π0.5", uniflow: "UniFlow" };

export async function initRealWorld() {
  const root = $("#real");
  if (!root) return;
  const data = await getJSON("assets/data/real.json");
  initFeatured(data.featured);
  initReel(data.reel);
  initLightbox();
}

// ---- head-to-head pair
function initFeatured(f) {
  const pair = $("#rw-pair");
  if (!pair) return;
  const mk = (pol) => {
    const clip = f.clips[pol];
    const v = h("video", { muted: true, playsinline: true, preload: "none", poster: poster(clip.video), "aria-label": `${PN[pol]} rollout, ${f.task}` });
    v.muted = true; v.dataset.src = clip.video;
    const b = badge(clip.success, clip.success ? "Success" : "Failure");
    b.style.left = "10px"; b.style.bottom = "10px";
    const fr = h("div.vframe." + (clip.success ? "ok" : "bad"), {}, v, h("div.ring"), h("div.spinner", {}, h("i")), b);
    const cap = h("div.cap", {}, h("span.k", {}, h("i", { style: { background: pol === "uniflow" ? C.uniflow : C.pi05 } }), document.createTextNode(PN[pol])), h("small.note", { text: "2× speed" }));
    return { pol, v, fr, badge: b, el: h("div.rw-cell" + (pol === "uniflow" ? ".ours" : ""), {}, cap, fr, h("div.outcome", { text: clip.caption })) };
  };
  const cells = [mk("pi05"), mk("uniflow")];
  const playBtn = h("button.iconbtn", { "aria-label": "Play" }, icon("i-play"));
  const scrubEl = h("div.scrub", { role: "slider", tabindex: "0", "aria-label": "Time", "aria-valuemin": "0", "aria-valuemax": "100" }, h("div.rail"), h("div.fill"), h("div.marks"), h("div.knob"));
  const timeEl = h("span.time");
  pair.append(cells[0].el, cells[1].el, h("div.ctrl", {}, playBtn, scrubEl, timeEl));
  const group = new SyncGroup({
    loopDelay: 2,
    onTick: (t, d) => { scrub.render(t, d); timeEl.textContent = `${t.toFixed(1)} / ${d.toFixed(1)} s`; },
    onClipState: (c, ended) => { const cell = cells.find((x) => x.v === c.v); cell.fr.classList.toggle("ended", ended); cell.badge.classList.toggle("on", ended); },
    onLoading: (on) => cells.forEach((c) => c.fr.classList.toggle("loading", on && !c.fr.classList.contains("ended"))),
    onPlayState: (on) => { playBtn.replaceChildren(icon(on ? "i-pause" : "i-play")); playBtn.setAttribute("aria-label", on ? "Pause" : "Play"); },
  });
  const scrub = bindScrubber(scrubEl, group, { marks: () => cells.map((c) => ({ t: f.clips[c.pol].end, color: c.pol === "uniflow" ? C.uniflow : C.pi05 })) });
  playBtn.addEventListener("click", () => group.toggle());
  let loaded = false;
  const load = () => { if (loaded) return; loaded = true; group.setClips(cells.map((c) => ({ video: c.v, end: f.clips[c.pol].end, key: c.pol }))); scrub.renderMarks(); };
  whenNear(pair, load, "700px");
  onVisible(pair, (on) => {
    if (on) { load(); if (!group.userPaused) group.play(); }
    else group.pause();
  }, { threshold: 0.3 });
}

// ---- reel of UniFlow rollouts
function initReel(list) {
  const host = $("#rw-reel");
  if (!host) return;
  list.forEach((r, k) => {
    const v = h("video", { muted: true, loop: true, playsinline: true, preload: "none", poster: poster(r.video), "aria-hidden": "true" });
    v.muted = true;
    const b = h("button.reel-tile", { "aria-label": `Open UniFlow rollout: ${r.task}`, onclick: () => openLB(list, k) }, v,
      h("span.reel-cap", {}, h("b", { text: r.task }), h("span.ok", {}, icon("i-check"), document.createTextNode("UniFlow"))));
    host.append(b);
    let started = false;
    onVisible(b, (on) => {
      if (on) { if (!started) { v.src = r.video; started = true; } v.play().catch(() => {}); }
      else v.pause();
    }, { threshold: 0.35 });
  });
}

// ---- lightbox
let LB = null;
function initLightbox() {
  if (LB) return;
  const dlg = $("#lightbox"), v = $("#lb-video"), title = $("#lb-title");
  LB = { dlg, v, title, list: [], k: 0 };
  LB.show = () => {
    const r = LB.list[LB.k];
    v.src = r.video; v.poster = poster(r.video);
    v.play().catch(() => {});
    title.replaceChildren(document.createTextNode(`UniFlow · ${r.task}`), h("span", { text: `rollout ${LB.k + 1} of ${LB.list.length} · 2× speed` }));
  };
  $("#lb-prev").addEventListener("click", () => { LB.k = (LB.k - 1 + LB.list.length) % LB.list.length; LB.show(); });
  $("#lb-next").addEventListener("click", () => { LB.k = (LB.k + 1) % LB.list.length; LB.show(); });
  $("#lb-close").addEventListener("click", () => dlg.close());
  dlg.addEventListener("close", () => { v.pause(); v.removeAttribute("src"); v.load(); });
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener("keydown", (e) => {
    if (e.target === v) return; // arrows seek inside the video's own controls
    if (e.key === "ArrowRight") $("#lb-next").click();
    if (e.key === "ArrowLeft") $("#lb-prev").click();
  });
}
function openLB(list, k) {
  if (!LB) return;
  Object.assign(LB, { list, k });
  LB.dlg.showModal();
  LB.show();
}
