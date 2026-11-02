// Page bootstrap: top bar + section list, reveals, the overview video, charts, and components.
import { $, $$, h, icon, getJSON, onVisible, whenNear, reducedMotion, clamp } from "./util.js";
import { C, slopeChart, dotPlot, hbars, groupedColumns, legend, table, bindTableToggle } from "./charts.js";
import { drawArchitecture } from "./arch.js";
import { initPointmapExplorer } from "./pmexplorer.js";
import { initExplorer, initWall } from "./explorer.js";
import { initShiftLab } from "./shiftlab.js";
import { initRealWorld } from "./realworld.js";

// ---------------------------------------------------------------- top bar + section list
function initNav() {
  const nav = $("#nav"), prog = $("#progress"), title = $("#title"), toc = $("#toc"), menu = $("#menubtn");
  const links = $$("#toc a");
  // the paper title slides into the top bar once the title block has scrolled away
  onVisible(title, (on, e) => nav.classList.toggle("scrolled", !on && e.boundingClientRect.top < 0), { threshold: 0 });
  const onScroll = () => {
    const d = document.documentElement, max = d.scrollHeight - innerHeight;
    prog.style.transform = `scaleX(${max > 0 ? clamp(scrollY / max) : 0})`;
  };
  addEventListener("scroll", onScroll, { passive: true }); onScroll();
  // active section: the last section whose top has passed 30% of the viewport
  const targets = links.map((a) => ({ a, el: $(a.getAttribute("href")) })).filter((x) => x.el);
  let ticking = false;
  const mark = () => {
    ticking = false;
    const y = innerHeight * 0.3;
    let cur = null;
    for (const t of targets) if (t.el.getBoundingClientRect().top <= y) cur = t;
    // at the very bottom the last sections can never reach that line: prefer the one the reader jumped to
    const d = document.documentElement;
    if (scrollY >= d.scrollHeight - innerHeight - 2) {
      const hit = targets.find((t) => location.hash === "#" + t.el.id), r = hit?.el.getBoundingClientRect();
      cur = r && r.bottom > 0 && r.top < innerHeight ? hit : targets.at(-1);
    }
    // a sub-entry keeps its parent highlighted too
    links.forEach((a) => a.classList.remove("active"));
    if (cur) {
      cur.a.classList.add("active");
      const parent = cur.a.closest("ul ul")?.parentElement?.querySelector(":scope > a");
      parent?.classList.add("active");
    }
  };
  addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(mark); } }, { passive: true });
  addEventListener("hashchange", mark);
  mark();
  // narrow screens: the section list opens as a panel under the top bar
  const close = () => { toc.classList.remove("open"); menu.setAttribute("aria-expanded", "false"); };
  menu.addEventListener("click", (e) => { e.stopPropagation(); const open = !toc.classList.contains("open"); toc.classList.toggle("open", open); menu.setAttribute("aria-expanded", String(open)); });
  links.forEach((a) => a.addEventListener("click", close));
  addEventListener("keydown", (e) => { if (e.key === "Escape" && toc.classList.contains("open")) { close(); menu.focus(); } });
  document.addEventListener("click", (e) => { if (toc.classList.contains("open") && !toc.contains(e.target)) close(); });
}

// ---------------------------------------------------------------- in-page links
// Media above the target can still change height during the smooth scroll, so once the
// scroll settles, re-align the target (unless the reader has started scrolling themselves).
function initAnchors() {
  document.addEventListener("click", (e) => {
    const href = e.target.closest?.('a[href^="#"]')?.getAttribute("href");
    const el = href && href.length > 1 && document.getElementById(href.slice(1));
    if (!el) return;
    let user = false, tries = 0, lastY = -1, still = 0;
    const stop = () => (user = true);
    for (const t of ["wheel", "touchstart", "keydown"]) addEventListener(t, stop, { once: true, passive: true });
    const pad = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
    const tick = () => {
      if (user) return;
      if (scrollY !== lastY) { lastY = scrollY; still = 0; requestAnimationFrame(tick); return; }
      if (++still < 8) { requestAnimationFrame(tick); return; }
      const off = el.getBoundingClientRect().top - pad;
      if (Math.abs(off) > 8 && tries++ < 4) { scrollTo({ top: scrollY + off }); still = 0; requestAnimationFrame(tick); }
    };
    requestAnimationFrame(tick);
  });
}

// ---------------------------------------------------------------- reveal
function initReveal() {
  const els = $$(".reveal");
  if (reducedMotion()) { els.forEach((e) => e.classList.add("in")); return; }
  const io = new IntersectionObserver((ents) => ents.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -8% 0px", threshold: 0.06 });
  els.forEach((e) => io.observe(e));
}

// ---------------------------------------------------------------- teaser
function initTeaser() {
  const th = $("#theater"), v = $("#teaser"), ph = $("#teaser-ph"), big = $("#teaser-big");
  const bPlay = $("#teaser-play"), bFull = $("#teaser-full"), bar = $("#teaser-bar");
  const src = innerWidth < 900 ? "assets/videos/teaser_720.mp4" : "assets/videos/teaser.mp4";
  let failed = false;
  const fail = () => {
    if (failed) return;
    if (v.dataset.alt !== "1" && src.includes("_720")) { v.dataset.alt = "1"; v.src = "assets/videos/teaser.mp4"; return; }
    failed = true; ph.hidden = false; big.hidden = true; th.querySelector(".controls").hidden = true; v.hidden = true;
  };
  v.addEventListener("error", fail);
  // setting src starts the load. Set it once only: assigning it again (even the same URL) restarts the load and aborts a pending play()
  whenNear(th, () => { if (!v.getAttribute("src")) v.src = src; }, "900px");
  const sync = () => {
    th.classList.toggle("paused", v.paused);
    big.tabIndex = v.paused ? 0 : -1;
    bPlay.replaceChildren(icon(v.paused ? "i-play" : "i-pause")); bPlay.setAttribute("aria-label", v.paused ? "Play" : "Pause");
  };
  let userPaused = false;
  v.addEventListener("play", sync); v.addEventListener("pause", sync);
  v.addEventListener("timeupdate", () => { if (v.duration) bar.style.width = `${(v.currentTime / v.duration) * 100}%`; });
  big.addEventListener("click", () => { userPaused = false; v.play().catch(() => {}); });
  bPlay.addEventListener("click", () => { if (v.paused) { userPaused = false; v.play().catch(() => {}); } else { userPaused = true; v.pause(); } });
  bFull.addEventListener("click", () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else (th.requestFullscreen?.() || v.webkitEnterFullscreen?.());
  });
  // muted, looping and pausable, so it plays whenever it is on screen (also with reduced motion: the reader can pause it).
  // A play() that loses a race with the source loading is retried once the first frames are in.
  let visible = false;
  const tryPlay = () => {
    if (!visible || userPaused || failed || !v.paused) return;
    if (!v.getAttribute("src")) v.src = src;   // never call play() before the source is set: the load would abort it
    v.play().catch((e) => { if (e && e.name === "NotAllowedError") armGesture(); });
  };
  // a browser that blocks autoplay (a setting, power saving, an extension or an embedded viewer) gets its first
  // click or key press anywhere on the page; the hero's own buttons handle clicks on it
  let armed = false;
  const GESTURES = ["pointerdown", "keydown", "touchstart"];
  const onGesture = (e) => { if (th.contains(e.target)) return; GESTURES.forEach((n) => removeEventListener(n, onGesture, true)); armed = false; tryPlay(); };
  function armGesture() { if (armed) return; armed = true; GESTURES.forEach((n) => addEventListener(n, onGesture, { capture: true, passive: true })); }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) tryPlay(); });   // e.g. opened in a background tab
  v.addEventListener("canplay", tryPlay);
  onVisible(th, (on) => {
    if (failed) return;
    visible = on;
    if (on) tryPlay(); else v.pause();
  }, { threshold: 0.45 });
  sync();
}

// ---------------------------------------------------------------- charts
async function initCharts() {
  // label widths are measured on a canvas (textW): wait briefly for the serif face so they match the drawn text
  const font = document.fonts ? document.fonts.load('400 13px "Source Serif 4"').catch(() => {}) : null;
  const [lbm, res] = await Promise.all([getJSON("assets/data/lbm.json"), getJSON("assets/data/results.json"),
    Promise.race([font, new Promise((r) => setTimeout(r, 1200))])]);
  // the LBM charts compare UniFlow with the RGB-only LBM policy (the single-modality variants stay in the rollout panel)
  const P = lbm.policies.filter((p) => p.id === "lbm" || p.id === "uniflow");
  const NAME = { lbm: "LBM (RGB only)", uniflow: "UniFlow" };
  // slope chart
  const series = P.map((p) => ({ id: p.id, name: NAME[p.id], color: C[p.id], a: lbm.avg.IN[p.id], b: lbm.avg.DS[p.id], emph: p.id === "uniflow" }));
  legend($("#slope-legend"), series.map((s) => ({ name: s.name, color: s.color })), "line");
  slopeChart($("#slope"), { series });
  bindTableToggle($('[data-table="slope"]'), $("#slope"), () => table(["Policy", "In-domain", "Domain shift", "Change"],
    series.map((s) => [s.name, s.a, s.b, `${(s.b - s.a).toFixed(1)}`]), { bestCols: [1, 2], oursRow: 1 }), [$("#slope-legend")]);

  // per-task dot plot
  legend($("#dot-legend"), P.map((p) => ({ name: NAME[p.id], color: C[p.id] })), "dot");
  const NOTES = {
    DS: "Under domain shift, UniFlow is ahead of the RGB-only policy on all 13 tasks. Highlighted rows: UniFlow is ahead or tied.",
    IN: "In-domain, the two are close: UniFlow is ahead on 9 of 13 tasks. Highlighted rows: UniFlow is ahead or tied.",
  };
  const dots = dotPlot($("#dots"), { tasks: lbm.tasks, policies: P, cond: "DS", onNote: (c) => ($("#dot-note").textContent = NOTES[c]) });
  $$("#dot-cond button").forEach((b) => b.addEventListener("click", () => {
    $$("#dot-cond button").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); dots.setCond(b.dataset.cond); dotTable.refresh();
  }));
  const sortBtn = $("#dot-sort");
  sortBtn.addEventListener("click", () => { const on = sortBtn.getAttribute("aria-pressed") !== "true"; sortBtn.setAttribute("aria-pressed", String(on)); dots.setSorted(on); dotTable.refresh(); });
  const dotTable = bindTableToggle($('[data-table="dots"]'), $("#dots"), () => {
    const c = dots.cond, tasks = lbm.tasks.slice();
    if (sortBtn.getAttribute("aria-pressed") === "true") tasks.sort((a, b) => b.sr[c].uniflow - a.sr[c].uniflow);
    const rows = tasks.map((t) => [t.name, ...P.map((p) => t.sr[c][p.id])]);
    rows.push(["Average (weighted)", ...P.map((p) => lbm.avg[c][p.id])]);
    const tb = table(["Task · " + (c === "IN" ? "in-domain" : "domain shift"), ...P.map((p) => NAME[p.id])], rows, { bestCols: [1, 2] });
    // per-row best highlighting
    tb.querySelectorAll("tbody tr").forEach((tr) => {
      const tds = [...tr.children].slice(1), vals = tds.map((td) => parseFloat(td.textContent)), mx = Math.max(...vals);
      tds.forEach((td, i) => td.classList.toggle("best", vals[i] === mx));
    });
    return tb;
  }, [$("#dot-legend")]);

  // RoboTwin
  const rt = res.robotwin;
  const rs = [{ id: "pi05", name: "π0.5", color: C.pi05, values: rt.pi05 }, { id: "maniflow", name: "ManiFlow", color: C.maniflow, values: rt.maniflow }, { id: "uniflow", name: "UniFlow", color: C.uniflow, values: rt.uniflow }];
  legend($("#rt-legend"), rs);
  groupedColumns($("#rt-chart"), { groups: rt.tasks, series: rs, max: 80, labelGroups: [rt.tasks.length - 1], short: ["Hand over", "Lift pot", "Can → pot", "Bottles", "Switch", "Avg."] });
  bindTableToggle($('[data-table="rt"]'), $("#rt-chart"), () => table(["Task", "π0.5", "ManiFlow", "UniFlow"], rt.tasks.map((t, i) => [t, rt.pi05[i], rt.maniflow[i], rt.uniflow[i]])), [$("#rt-legend")]);

  // ablations
  const encPaper = () => res.encoder_liftpot.map((r) => ({ label: r.name + (r.init === "pretrained" && !r.ours ? " (pretrained)" : ""), value: r.sr, ours: !!r.ours }));
  const encReb = () => res.encoder_extra.rows.map((r) => ({ label: r.name, value: r.v[2], ours: !!r.ours, tip: `Adjust bottle ${r.v[0]} · Lift pot ${r.v[1]}` }));
  const encChart = hbars($("#enc-chart"), encPaper(), { max: 100, fmt: (v) => (v % 1 ? v.toFixed(1) : String(v)), sub: "success rate", title: "Success rate by geometry encoder" });
  const ENC = {
    paper: ["Only the geometry stream is swapped; the RGB stream, backbone, objective and action head stay fixed. Single-task RoboTwin Lift Pot, 50 demos, 100 rollouts.",
      "Point-cloud encoders get the same head-camera depth (cropped, 512 FPS points, XYZRGB). Uni3D starts from its released pretrained checkpoint; all encoders are fine-tuned end-to-end."],
    reb: ["A Sonata-pretrained point transformer and a from-scratch PointNet in place of the pointmap stream. Average of Adjust bottle and Lift pot, head camera, 50 demos per task.",
      "Every point-cloud variant receives 256 points. Even pretrained, a point-cloud encoder stays far behind the pointmap stream (55.0 vs. 89.5)."],
  };
  const setEnc = (k) => { $("#enc-desc").textContent = ENC[k][0]; $("#enc-foot").textContent = ENC[k][1]; encChart.update(k === "paper" ? encPaper() : encReb()); };
  $$("#enc-tab button").forEach((b) => b.addEventListener("click", () => { $$("#enc-tab button").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); setEnc(b.dataset.k); }));
  setEnc("paper");
  hbars($("#pre-chart"), [{ label: "Pretrained ConvNeXt V2", value: res.pretrain.pretrained, ours: true }, { label: "Random initialization", value: res.pretrain.random }], { max: 100, sub: "success rate", title: "Success rate by pointmap-encoder initialization" });
}

// ---------------------------------------------------------------- bibtex
function initBib() {
  const b = $("#copybib");
  b.addEventListener("click", async () => {
    const txt = $("#bibtext").textContent;
    try { await navigator.clipboard.writeText(txt); } catch (e) {
      const r = document.createRange(); r.selectNodeContents($("#bibtext")); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); document.execCommand("copy");
    }
    b.querySelector("span").textContent = "Copied"; setTimeout(() => (b.querySelector("span").textContent = "Copy"), 1600);
  });
}

// ---------------------------------------------------------------- go
initNav();
initAnchors();
initReveal();
initTeaser();
initBib();
{ // a static SVG: drawn right away so it never shifts the page later
  const a = $("#arch");
  drawArchitecture(a);
  // on narrow screens the diagram scrolls sideways: open it on the transformer, not the left margin
  requestAnimationFrame(() => { if (a.scrollWidth > a.clientWidth + 4) a.scrollLeft = (a.scrollWidth - a.clientWidth) * 0.55; });
}
initCharts().catch((e) => console.error(e));
initPointmapExplorer();
initExplorer().then((ex) => initWall(ex)).catch((e) => console.error(e));
initShiftLab().catch((e) => console.error(e));
initRealWorld().catch((e) => console.error(e));
