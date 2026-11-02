// LBM rollout explorer (4 policies, one matched scene, one shared clock) and the domain-shift wall.
import { $, h, icon, badge, getJSON, poster, onVisible, whenNear } from "./util.js";
import { SyncGroup, bindScrubber } from "./sync.js";
import { C } from "./charts.js";

const POLS = ["lbm", "img", "pm", "uniflow"];
const SHORT = { lbm: "LBM", img: "Image-only", pm: "Pointmap-only", uniflow: "UniFlow" };

export async function initExplorer() {
  const root = $("#explorer");
  if (!root) return null;
  const data = await getJSON("assets/data/lbm.json");
  const st = { cond: "DS", task: 2, ep: 0 };       // default: Put red bell pepper in bin, domain shift, paper scene
  const stage = $("#ex-stage"), rail = $("#ex-tasks"), epBox = $("#ex-ep"), playBtn = $("#ex-play"), timeEl = $("#ex-time"), note = $("#ex-note");

  // ---- stage: 4 cells
  const cells = POLS.map((p) => {
    const v = h("video", { muted: true, playsinline: true, preload: "none", "aria-label": `${SHORT[p]} rollout` });
    v.muted = true;
    const fr = h("div.vframe", {}, v, h("div.ring"), h("div.spinner", {}, h("i")));
    const cap = h("div.cap", {}, h("span.k", {}, h("i", { style: { background: C[p] } }), document.createTextNode(SHORT[p])), h("small"));
    const bar = h("div.srbar", {}, h("div.tr", {}, h("i", { style: { background: C[p] } })), h("b"));
    const cell = h("div.ex-cell" + (p === "uniflow" ? ".ours" : ""), {}, cap, fr, bar);
    stage.append(cell);
    return { p, v, fr, cap, bar, cell, badge: null };
  });

  const group = new SyncGroup({
    onTick: (t, d) => { scrub.render(t, d); timeEl.textContent = `${t.toFixed(1)} / ${d.toFixed(1)} s`; },
    onClipState: (c, ended) => {
      const cell = cells.find((x) => x.v === c.v);
      cell.fr.classList.toggle("ended", ended);
      cell.badge?.classList.toggle("on", ended);
    },
    onLoading: (on) => cells.forEach((c) => c.fr.classList.toggle("loading", on && !c.fr.classList.contains("ended"))),
    onPlayState: (on) => { playBtn.replaceChildren(icon(on ? "i-pause" : "i-play")); playBtn.setAttribute("aria-label", on ? "Pause" : "Play"); },
  });
  const scrub = bindScrubber($("#ex-scrub"), group, {
    marks: () => {
      const e = curEp();
      return POLS.map((p) => ({ t: e.dur[p], color: C[p] }));
    },
  });
  playBtn.addEventListener("click", () => group.toggle());

  const task = () => data.tasks[st.task];
  const curEp = () => task().episodes[st.cond][st.ep];

  // ---- task rail
  const chips = data.tasks.map((t, i) => {
    const img = h("img", { alt: "", loading: "lazy" });
    const b = h("button.tchip", { "aria-pressed": "false", onclick: () => { st.task = i; st.ep = 0; render(); } },
      h("div.th", {}, img, h("em", { text: t.bimanual ? "bimanual" : "single-arm" })), h("div.nm", { text: t.name }));
    rail.append(b);
    return { b, img, t };
  });

  // ---- condition toggle
  const condBtns = [...document.querySelectorAll("#ex-cond button")];
  condBtns.forEach((b) => b.addEventListener("click", () => { st.cond = b.dataset.cond; st.ep = 0; render(); }));

  function renderEpisodes() {
    epBox.replaceChildren();
    task().episodes[st.cond].forEach((e, i) => {
      const b = h("button", { "aria-pressed": String(i === st.ep), title: e.kind === "paper" ? (st.cond === "DS" ? "Scene from the paper's qualitative figures, picked among scenes where UniFlow succeeds" : "Scene from the paper's qualitative figures") : "Unfiltered random matched scene",
        onclick: () => { st.ep = i; render(); } });
      b.append(document.createTextNode(`#${e.ic}`), h("span", { style: { color: "var(--muted)", marginLeft: "6px", fontWeight: 500 }, text: e.kind === "paper" ? "paper" : "random" }));
      epBox.append(b);
    });
  }

  // load = false builds the markup only (no video loading), so the panel has its final height early
  function render(load = true) {
    const t = task(), e = curEp();
    condBtns.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.cond === st.cond)));
    chips.forEach((c, i) => {
      c.b.setAttribute("aria-pressed", String(i === st.task));
      const pe = c.t.episodes[st.cond][0];
      c.img.src = poster(pe.video.uniflow);
    });
    renderEpisodes();
    const sr = t.sr[st.cond], n = t.n[st.cond];
    cells.forEach((c) => {
      c.cap.querySelector("small").textContent = "";
      c.badge?.remove();
      c.badge = badge(e.success[c.p]);
      c.badge.style.left = "10px"; c.badge.style.bottom = "10px";
      c.fr.append(c.badge);
      c.fr.classList.remove("ended", "ok", "bad");
      c.fr.classList.add(e.success[c.p] ? "ok" : "bad");
      c.v.removeAttribute("src");
      c.v.poster = poster(e.video[c.p]);
      c.v.dataset.src = e.video[c.p];
      c.bar.querySelector("i").style.width = `${sr[c.p]}%`;
      c.bar.querySelector("b").textContent = `${sr[c.p].toFixed(sr[c.p] % 1 ? 1 : 0)}%`;
      c.bar.title = `${SHORT[c.p]} success rate on this task (${st.cond === "IN" ? "in-domain" : "domain shift"}, n = ${n[c.p]})`;
    });
    const winners = POLS.filter((p) => e.success[p]).map((p) => SHORT[p]);
    note.textContent = `Matched scene #${e.ic}${e.kind === "paper" ? (st.cond === "DS" ? " (paper figure, picked among scenes where UniFlow succeeds)" : " (paper figure)") : " (random draw)"}: all four policies start from the same randomized ${st.cond === "IN" ? "in-domain" : "shifted"} scene. ` +
      (winners.length ? `Succeeded: ${winners.join(", ")}.` : "No policy succeeded on this scene.") + " Videos at 2× speed. Bars: each policy's success rate on this task and condition (n ≈ 100).";
    if (!load) return;
    group.setClips(cells.map((c) => ({ video: c.v, end: e.dur[c.p], key: c.p })));
    scrub.renderMarks();
    if (visible && !group.userPaused) group.play();
  }

  let visible = false;
  onVisible(root, (on) => { visible = on; if (on && !group.userPaused) group.play(); else if (!on) group.pause(); }, { threshold: 0.25 });
  render(false);
  whenNear(root, () => render(), "800px");
  return {
    show(taskId, cond = "DS") {
      const i = data.tasks.findIndex((t) => t.id === taskId);
      if (i < 0) return;
      st.task = i; st.cond = cond; st.ep = 0; render();
      chips[i].b.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
      root.scrollIntoView({ behavior: "smooth", block: "start" });
      chips[i].b.focus({ preventScroll: true });
    },
  };
}

// ---- domain-shift wall: UniFlow's paper scene on every task; one featured tile (2 x 2) and twelve small
const FEATURED = "BimanualPutSpatulaOnPlateFromDryingRack";
export async function initWall(explorer) {
  const wall = $("#wall");
  if (!wall) return;
  const data = await getJSON("assets/data/lbm.json");
  const tasks = [...data.tasks].sort((a, b) => (b.id === FEATURED) - (a.id === FEATURED));
  const tiles = tasks.map((t) => {
    const e = t.episodes.DS.find((x) => x.kind === "paper");
    const v = h("video", { muted: true, loop: true, playsinline: true, preload: "none", poster: poster(e.video.uniflow), "aria-label": `UniFlow, ${t.name}, domain shift` });
    v.muted = true; v.dataset.src = e.video.uniflow;
    const b = badge(e.success.uniflow); b.classList.add("on");
    const tile = h("button.wt" + (t.id === FEATURED ? ".big" : ""), { title: `Compare all four policies on “${t.name}”`, onclick: () => explorer?.show(t.id, "DS") }, v,
      h("div.wcap", {}, h("b", { text: t.name }), b));
    return { tile, v };
  });
  wall.replaceChildren(...tiles.map((x) => x.tile));
  for (const { tile, v } of tiles) {
    onVisible(tile, (on) => {
      if (on) { if (!v.getAttribute("src")) v.src = v.dataset.src; v.play().catch(() => {}); }
      else v.pause();
    }, { threshold: 0.2 });
  }
}
