// Inline-SVG charts. Rules: thin marks, 4px rounded data ends, hairline solid grid,
// legend for >= 2 series + selective direct labels, text in text tokens, a hover
// tooltip on every mark (keyboard focus shows the same; each focusable mark is named), and a table twin.
import { s, h, clamp, easeInOut, reducedMotion } from "./util.js";

export const C = {
  lbm: "#a3a29a", img: "#c8642c", pm: "#1c8a6c", uniflow: "#5646c2",
  pi05: "#a3a29a", maniflow: "#cbcac2", surface: "#fbfbf7",
};

// ---------------------------------------------------------------- tooltip
const tipEl = () => document.getElementById("tip");
export function showTip(ev, title, rows = [], foot) {
  const t = tipEl();
  t.replaceChildren();
  t.append(h("div.t-title", { text: title }));
  for (const r of rows) {
    const row = h("div.t-row");
    row.append(h("i.key", { style: { background: r.color || "transparent" } }), h("b", { text: r.value }), h("span", { text: r.label }));
    t.append(row);
  }
  if (foot) t.append(h("div", { style: { marginTop: "6px", fontSize: "12px", color: "var(--muted)" }, text: foot }));
  t.classList.add("on");
  moveTip(ev);
}
export function moveTip(ev) {
  const t = tipEl();
  let x, y;
  if (ev && "clientX" in ev && ev.clientX) { x = ev.clientX; y = ev.clientY; }
  else { const r = ev.target.getBoundingClientRect(); x = r.left + r.width / 2; y = r.top; }
  const w = t.offsetWidth, hh = t.offsetHeight;
  let left = x + 16, top = y - hh - 14;
  if (left + w > innerWidth - 8) left = x - w - 16;
  if (top < 8) top = y + 18;
  t.style.left = `${clamp(left, 8, innerWidth - w - 8)}px`;
  t.style.top = `${top}px`;
}
export function hideTip() { tipEl().classList.remove("on"); }
function hover(node, fn, label) {
  node.setAttribute("tabindex", "0");
  node.setAttribute("role", "img");
  if (label) node.setAttribute("aria-label", label);
  node.addEventListener("pointerenter", (e) => fn(e, true));
  node.addEventListener("pointermove", moveTip);
  node.addEventListener("pointerleave", (e) => fn(e, false));
  node.addEventListener("focus", (e) => fn(e, true));
  node.addEventListener("blur", (e) => fn(e, false));
}

// ---------------------------------------------------------------- text measure
let _ctx;
export function textW(str, size = 13, weight = 400) {
  _ctx = _ctx || document.createElement("canvas").getContext("2d");
  _ctx.font = `${weight} ${size}px "Source Serif 4", Georgia, serif`;   // same face as the chart text (.chart svg)
  return _ctx.measureText(str).width;
}
// Balanced two-line split; falls back to greedy filling (up to three lines) when two are not enough.
function wrap2(str, maxW, size, weight = 400) {
  if (textW(str, size, weight) <= maxW) return [str];
  const words = str.split(" ");
  let best = [str], bestW = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" "), b = words.slice(i).join(" ");
    const w = Math.max(textW(a, size, weight), textW(b, size, weight));
    if (w < bestW) { bestW = w; best = [a, b]; }
  }
  if (bestW <= maxW || words.length < 3) return best;
  const out = [];
  for (const wd of words) {
    const cur = out[out.length - 1];
    if (cur != null && out.length >= 3) out[out.length - 1] = `${cur} ${wd}`;
    else if (cur != null && textW(`${cur} ${wd}`, size, weight) <= maxW) out[out.length - 1] = `${cur} ${wd}`;
    else out.push(wd);
  }
  return out;
}

export function legend(ul, items, kind = "rect") {
  ul.replaceChildren(...items.map((it) => {
    const li = h("li");
    li.append(h("span.sw" + (kind === "line" ? ".line" : kind === "dot" ? ".dot" : ""), { style: { background: it.color } }), document.createTextNode(it.name));
    return li;
  }));
}

function drawIn(svg) { // animate once when it enters the viewport
  if (reducedMotion()) return;
  svg.classList.add("pending");
}

// ---------------------------------------------------------------- slope chart
export function slopeChart(el, { series, labels = ["In-domain", "Domain shift"], max = 80 }) {
  let first = true;
  const render = () => {
    const W = Math.max(300, el.clientWidth);
    const small = W < 520;
    const H = small ? 300 : 360, top = 16, bot = 40, left = 34, right = small ? 120 : 168;
    const x0 = left + (small ? 46 : 70), x1 = W - right;
    const y = (v) => top + (1 - v / max) * (H - top - bot);
    const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, role: "group", "aria-label": "Slope chart of average success, in-domain to domain shift" });
    for (let v = 0; v <= max; v += 20) {
      svg.append(s("line", { class: "gridline", x1: left + 6, x2: x1, y1: y(v), y2: y(v) }));
      svg.append(s("text", { class: "tick", x: left, y: y(v) + 4, "text-anchor": "end" }, String(v)));
    }
    for (const [i, x] of [x0, x1].entries()) {
      svg.append(s("line", { class: "axisline", x1: x, x2: x, y1: top, y2: H - bot }));
      svg.append(s("text", { class: "lab", x, y: H - 14, "text-anchor": "middle", style: "font-weight:600;fill:var(--text)" }, labels[i]));
    }
    // end-label placement without collisions
    const place = (vals, gap) => {
      const idx = vals.map((v, i) => [y(v), i]).sort((a, b) => a[0] - b[0]);
      for (let k = 1; k < idx.length; k++) if (idx[k][0] - idx[k - 1][0] < gap) idx[k][0] = idx[k - 1][0] + gap;
      const out = []; idx.forEach(([yy, i]) => (out[i] = yy)); return out;
    };
    const ly0 = place(series.map((d) => d.a), 18), ly1 = place(series.map((d) => d.b), 34);
    const groups = [];
    series.forEach((d, i) => {
      const g = s("g", { class: "mark" + (d.emph ? " emph" : "") });
      const len = Math.hypot(x1 - x0, y(d.b) - y(d.a));
      const line = s("line", { x1: x0, y1: y(d.a), x2: x1, y2: y(d.b), stroke: d.color, "stroke-width": d.emph ? 3 : 2, "stroke-linecap": "round",
        "stroke-dasharray": len, "stroke-dashoffset": first && !reducedMotion() ? len : 0, style: "transition: stroke-dashoffset 1.1s cubic-bezier(.2,.7,.2,1)" });
      g.append(line);
      for (const [x, v] of [[x0, d.a], [x1, d.b]]) g.append(s("circle", { cx: x, cy: y(v), r: d.emph ? 6 : 5, fill: d.color, stroke: C.surface, "stroke-width": 2 }));
      g.append(s("text", { class: "lab-strong", x: x0 - 12, y: ly0[i] + 4, "text-anchor": "end" }, d.a.toFixed(1)));
      const t = s("text", { x: x1 + 12, y: ly1[i] - 2 });
      t.append(s("tspan", { class: "lab-strong", x: x1 + 12, dy: 0 }, d.b.toFixed(1)));
      t.append(s("tspan", { class: "lab", x: x1 + 12, dy: 15, style: "font-size:12px" }, d.name));
      g.append(t);
      const hit = s("line", { x1: x0, y1: y(d.a), x2: x1, y2: y(d.b), stroke: "transparent", "stroke-width": 20, class: "hit" });
      g.append(hit);
      hover(hit, (ev, on) => {
        el.classList.toggle("dim", on); g.classList.toggle("hl", on);
        if (on) showTip(ev, d.name, [{ color: d.color, value: `${d.a.toFixed(1)}%`, label: labels[0] }, { color: d.color, value: `${d.b.toFixed(1)}%`, label: labels[1] }],
          `${d.b - d.a >= 0 ? "+" : "−"}${Math.abs(d.b - d.a).toFixed(1)} points under shift`);
        else hideTip();
      }, `${d.name}: ${d.a.toFixed(1)}% in-domain, ${d.b.toFixed(1)}% under domain shift`);
      groups.push([line, len]);
      svg.append(g);
    });
    el.replaceChildren(svg);
    if (first && !reducedMotion()) {
      const io = new IntersectionObserver((e) => {
        if (e.some((x) => x.isIntersecting)) { io.disconnect(); groups.forEach(([ln], i) => setTimeout(() => ln.setAttribute("stroke-dashoffset", 0), 120 * i)); }
      }, { threshold: .35 });
      io.observe(el);
    }
    first = false;
  };
  render();
  new ResizeObserver(() => { if (Math.abs((el._w || 0) - el.clientWidth) > 4) { el._w = el.clientWidth; render(); } }).observe(el);
}

// ---------------------------------------------------------------- dot plot (13 tasks x 4 policies)
export function dotPlot(el, { tasks, policies, cond = "DS", sorted = false, onNote }) {
  const state = { cond, sorted, cur: null, raf: 0 };
  const keyOf = (p) => p.id;
  const build = () => {
    const W = Math.max(320, el.clientWidth);
    const small = W < 620;
    const labW = small ? 132 : 250, valW = small ? 46 : 64, rowH = small ? 40 : 34, top = 30, bot = 34;
    const x0 = labW + 12, x1 = W - valW - 8;
    const H = top + tasks.length * rowH + bot;
    const x = (v) => x0 + (v / 100) * (x1 - x0);
    const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, role: "group", "aria-label": "Per-task success rate dot plot" });
    const dstep = x1 - x0 < 260 ? 50 : 20;
    for (let v = 0; v <= 100; v += dstep) {
      svg.append(s("line", { class: "gridline", x1: x(v), x2: x(v), y1: top - 8, y2: H - bot + 4 }));
      svg.append(s("text", { class: "tick", x: x(v), y: H - bot + 22, "text-anchor": "middle" }, `${v}%`));
    }
    svg.append(s("text", { class: "tick", x: W - 8, y: top - 12, "text-anchor": "end", style: "font-weight:600;fill:var(--text-2)" }, "UniFlow"));
    const rows = tasks.map((t, i) => {
      const g = s("g", { class: "mark" });
      const lines = small ? wrap2(t.name, labW - 4, 12) : [t.name];
      const lab = s("text", { class: "rowlab", x: labW, y: 0, "text-anchor": "end", style: small ? "font-size:12px" : "" });
      lines.forEach((ln, k) => lab.append(s("tspan", { x: labW, dy: k === 0 ? (lines.length > 1 ? -2 : 4) : 13 }, ln)));
      const span = s("line", { class: "span" });
      const dots = policies.map((p) => s("circle", { r: p.id === "uniflow" ? 6.5 : 5, fill: C[p.id], stroke: C.surface, "stroke-width": 2 }));
      const val = s("text", { class: "lab-strong", x: W - 8, "text-anchor": "end" });
      const hit = s("rect", { class: "row-hit", x: 0, width: W, height: rowH });
      g.append(hit, lab, span, ...dots, val);
      hover(hit, (ev, on) => {
        el.classList.toggle("dim", on); g.classList.toggle("hl", on);
        if (on) {
          const sr = t.sr[state.cond], n = t.n[state.cond];
          const rowsT = policies.map((p) => ({ color: C[p.id], value: `${sr[p.id].toFixed(1)}%`, label: p.name + (n[p.id] < 100 ? ` (n=${n[p.id]})` : ""), v: sr[p.id] }))
            .sort((a, b) => b.v - a.v);
          showTip(ev, t.name + (t.bimanual ? " · bimanual" : " · single-arm"), rowsT, state.cond === "IN" ? "In-domain" : "Domain shift");
        } else hideTip();
      });
      svg.append(g);
      return { t, g, lab, span, dots, val, hit, lines };
    });
    el.replaceChildren(svg);
    return { svg, rows, x, rowH, top, W };
  };
  let geo = build();
  const target = () => {
    const order = tasks.map((t, i) => i);
    if (state.sorted) order.sort((a, b) => tasks[b].sr[state.cond].uniflow - tasks[a].sr[state.cond].uniflow);
    const pos = []; order.forEach((ti, k) => (pos[ti] = k));
    return tasks.map((t, i) => ({ y: geo.top + pos[i] * geo.rowH + geo.rowH / 2, v: policies.map((p) => t.sr[state.cond][p.id]) }));
  };
  const apply = (cur) => {
    geo.rows.forEach((r, i) => {
      const c = cur[i];
      const xs = c.v.map(geo.x);
      r.hit.setAttribute("y", c.y - geo.rowH / 2);
      r.lab.setAttribute("y", c.y);
      r.lab.querySelectorAll("tspan").forEach((ts) => ts.setAttribute("x", r.lab.getAttribute("x")));
      r.span.setAttribute("x1", Math.min(...xs)); r.span.setAttribute("x2", Math.max(...xs));
      r.span.setAttribute("y1", c.y); r.span.setAttribute("y2", c.y);
      // draw order: uniflow last so it sits on top
      r.dots.forEach((d, k) => { d.setAttribute("cx", xs[k]); d.setAttribute("cy", c.y); });
      r.val.setAttribute("y", c.y + 4);
      r.val.textContent = c.v[c.v.length - 1].toFixed(1);
      const best = Math.max(...c.v), isBest = c.v[c.v.length - 1] >= best - 1e-9;
      r.lab.classList.toggle("hl", isBest);
    });
  };
  const go = (animate = true) => {
    const to = target();
    geo.rows.forEach((r) => r.hit.setAttribute("aria-label", `${r.t.name}: ` + policies.map((p) => `${p.name} ${r.t.sr[state.cond][p.id].toFixed(1)}%`).join(", ")));
    cancelAnimationFrame(state.raf);
    if (!state.cur || !animate || reducedMotion()) { state.cur = to; apply(to); return; }
    const from = state.cur.map((c) => ({ y: c.y, v: [...c.v] }));
    const t0 = performance.now(), D = 650;
    const step = (now) => {
      const k = easeInOut(clamp((now - t0) / D));
      const cur = from.map((f, i) => ({ y: f.y + (to[i].y - f.y) * k, v: f.v.map((v, j) => v + (to[i].v[j] - v) * k) }));
      state.cur = cur; apply(cur);
      if (k < 1) state.raf = requestAnimationFrame(step);
    };
    state.raf = requestAnimationFrame(step);
  };
  go(false);
  const note = () => onNote?.(state.cond);
  note();
  new ResizeObserver(() => { if (Math.abs((el._w || 0) - el.clientWidth) > 4) { el._w = el.clientWidth; geo = build(); state.cur = null; go(false); } }).observe(el);
  return {
    setCond(c) { state.cond = c; go(); note(); },
    setSorted(v) { state.sorted = v; go(); },
    get cond() { return state.cond; },
  };
}

// ---------------------------------------------------------------- horizontal bars (single series, emphasis form)
export function hbars(el, rows, { max = 100, unit = "%", highlight = null, labelW, barH = 16, gap = 14, fmt = (v) => v.toFixed(1), sub, title } = {}) {
  const render = () => {
    const W = Math.max(280, el.clientWidth);
    const small = W < 460;
    const lw = labelW ?? (small ? Math.min(150, W * 0.42) : Math.min(250, W * 0.42));
    const valW = 52, top = 4;
    const x0 = lw + 12, x1 = W - valW;
    const L = rows.map((r) => wrap2(r.label, lw - 4, small ? 12 : 13, r.ours ? 600 : 400));
    const rowH = Math.max(barH + gap + (small ? 6 : 0), Math.max(...L.map((l) => l.length)) * 14 + 8);
    const H = top + rows.length * rowH + 22;
    const x = (v) => x0 + (v / max) * (x1 - x0);
    const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, role: "group", "aria-label": title || sub || "Bar chart" });
    const hstep = x1 - x0 < 230 ? max / 2 : max / 4;
    for (let v = 0; v <= max + 1e-9; v += hstep) {
      svg.append(s("line", { class: "gridline", x1: x(v), x2: x(v), y1: 0, y2: H - 20 }));
      svg.append(s("text", { class: "tick", x: x(v), y: H - 4, "text-anchor": "middle" }, `${Math.round(v)}${unit}`));
    }
    rows.forEach((r, i) => {
      const yc = top + i * rowH + rowH / 2;
      const g = s("g", { class: "mark" + (highlight != null && highlight !== i ? "" : " hl") });
      const color = r.color || (r.ours ? C.uniflow : C.lbm);
      const op = highlight != null && highlight !== i ? 0.38 : 1;
      const lines = L[i];
      const lab = s("text", { class: r.ours ? "lab-strong" : "lab", x: lw, y: yc + 4 - (lines.length - 1) * 7, "text-anchor": "end", style: small ? "font-size:12px;" : "" });
      lines.forEach((ln, k) => lab.append(s("tspan", { x: lw, dy: k ? 14 : 0 }, ln)));
      const wv = Math.max(0, x(r.value) - x0);
      const path = roundedBarH(x0, yc - barH / 2, wv, barH, 4);
      const bar = s("path", { d: path, fill: color, opacity: op });
      const val = s("text", { class: "lab-strong", x: x0 + wv + 8, y: yc + 4, style: op < 1 ? "fill:var(--text-2)" : "" }, fmt(r.value) + (unit === "%" ? "" : ""));
      const hit = s("rect", { class: "hit", x: 0, y: yc - rowH / 2, width: W, height: rowH });
      g.append(lab, bar, val, hit);
      hover(hit, (ev, on) => { if (on) showTip(ev, r.label, [{ color, value: `${fmt(r.value)}${unit}`, label: r.tipLabel || sub || "" }], r.tip); else hideTip(); },
        `${r.label}: ${fmt(r.value)}${unit}${r.tip ? ` (${r.tip})` : ""}`);
      svg.append(g);
    });
    el.replaceChildren(svg);
  };
  render();
  const ro = new ResizeObserver(() => { if (Math.abs((el._w || 0) - el.clientWidth) > 4) { el._w = el.clientWidth; render(); } });
  ro.observe(el);
  return { update(newRows, opts = {}) { rows = newRows; if ("highlight" in opts) highlight = opts.highlight; render(); } };
}

function roundedBarH(x, y, w, hgt, r) {
  r = Math.min(r, w, hgt / 2);
  if (w <= 0.5) return `M${x},${y}h0.5v${hgt}h-0.5z`;
  return `M${x},${y}h${w - r}a${r},${r} 0 0 1 ${r},${r}v${hgt - 2 * r}a${r},${r} 0 0 1 -${r},${r}h-${w - r}z`;
}
function roundedBarV(x, yBase, w, hgt, r) {
  r = Math.min(r, hgt, w / 2);
  if (hgt <= 0.5) return `M${x},${yBase - 0.5}h${w}v0.5h-${w}z`;
  return `M${x},${yBase}v-${hgt - r}a${r},${r} 0 0 1 ${r},-${r}h${w - 2 * r}a${r},${r} 0 0 1 ${r},${r}v${hgt - r}z`;
}

// ---------------------------------------------------------------- grouped columns (RoboTwin)
export function groupedColumns(el, { groups, series, max = 80, labelGroups = [], short = null }) {
  const render = () => {
    const W = Math.max(300, el.clientWidth);
    const small = W < 560;
    const H = small ? 300 : 340, top = 22, bot = small ? 58 : 50, left = 34;
    const x0 = left + 8, x1 = W - 4;
    const gw = (x1 - x0) / groups.length;
    const bw = Math.min(24, (gw - 18) / series.length - 2);
    const y = (v) => top + (1 - v / max) * (H - top - bot);
    const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, role: "group", "aria-label": "Grouped column chart of success rate per task" });
    for (let v = 0; v <= max; v += 20) {
      svg.append(s("line", { class: "gridline", x1: x0, x2: x1, y1: y(v), y2: y(v) }));
      svg.append(s("text", { class: "tick", x: left, y: y(v) + 4, "text-anchor": "end" }, String(v)));
    }
    groups.forEach((gname, gi) => {
      const cx = x0 + gw * gi + gw / 2;
      const tot = series.length * bw + (series.length - 1) * 2;
      if (gi === groups.length - 1) svg.append(s("rect", { x: x0 + gw * gi + 4, y: top - 14, width: gw - 8, height: H - top - bot + 14, rx: 8, fill: "rgba(75,60,180,.05)" }));
      series.forEach((se, si) => {
        const v = se.values[gi], bx = cx - tot / 2 + si * (bw + 2);
        const g = s("g", { class: "mark" });
        g.append(s("path", { d: roundedBarV(bx, y(0), bw, y(0) - y(v), 4), fill: se.color }));
        if (labelGroups.includes(gi) && (si === 0 || si === series.length - 1)) g.append(s("text", { class: "lab-strong", x: bx + bw / 2, y: y(v) - 6, "text-anchor": "middle", style: "font-size:11.5px" }, v.toFixed(1)));
        svg.append(g);
      });
      const hit = s("rect", { class: "hit", x: x0 + gw * gi + 2, y: top, width: gw - 4, height: H - top - bot });
      svg.append(hit);
      hover(hit, (ev, on) => {
        if (on) showTip(ev, gname, series.map((ss) => ({ color: ss.color, value: `${ss.values[gi].toFixed(1)}%`, label: ss.name })));
        else hideTip();
      }, `${gname}: ` + series.map((ss) => `${ss.name} ${ss.values[gi].toFixed(1)}%`).join(", "));
      const lines = wrap2(small && short ? short[gi] : gname, gw - 6, small ? 11 : 12.5);
      const t = s("text", { class: "lab", x: cx, y: H - bot + 20, "text-anchor": "middle", style: `font-size:${small ? 11 : 12.5}px;${gi === groups.length - 1 ? "font-weight:650;fill:var(--text)" : ""}` });
      lines.forEach((ln, k) => t.append(s("tspan", { x: cx, dy: k ? 14 : 0 }, ln)));
      svg.append(t);
    });
    el.replaceChildren(svg);
  };
  render();
  new ResizeObserver(() => { if (Math.abs((el._w || 0) - el.clientWidth) > 4) { el._w = el.clientWidth; render(); } }).observe(el);
}

// ---------------------------------------------------------------- table twins
export function table(head, rows, { bestCols = [], oursRow = -1 } = {}) {
  const t = h("table.datatable");
  const thead = h("thead"), tr = h("tr");
  head.forEach((c) => tr.append(h("th", { text: c })));
  thead.append(tr); t.append(thead);
  const tb = h("tbody");
  rows.forEach((r, ri) => {
    const row = h("tr" + (ri === oursRow ? ".ours" : ""));
    r.forEach((c, ci) => {
      let best = false;
      if (bestCols.includes(ci) && typeof c === "number") best = c >= Math.max(...rows.map((rr) => (typeof rr[ci] === "number" ? rr[ci] : -1)));
      row.append(h("td" + (best ? ".best" : ""), { text: typeof c === "number" ? c.toFixed(1) : c }));
    });
    tb.append(row);
  });
  t.append(tb);
  const wrap = h("div.table-wrap", {}, t);
  const cue = () => wrap.classList.toggle("more", wrap.scrollLeft + wrap.clientWidth < wrap.scrollWidth - 2);
  wrap.addEventListener("scroll", cue, { passive: true });
  new ResizeObserver(cue).observe(wrap);
  return wrap;
}

export function bindTableToggle(btn, chartEl, makeTable, also = []) {
  let tbl = null;
  btn.addEventListener("click", () => {
    const on = btn.getAttribute("aria-pressed") !== "true";
    btn.setAttribute("aria-pressed", String(on));
    btn.textContent = on ? "Chart" : "Table";
    if (on) { tbl = makeTable(); chartEl.after(tbl); chartEl.hidden = true; also.forEach((a) => (a.hidden = true)); }
    else { tbl?.remove(); tbl = null; chartEl.hidden = false; also.forEach((a) => (a.hidden = false)); }
  });
  return { refresh() { if (tbl) { const n = makeTable(); tbl.replaceWith(n); tbl = n; } } };
}
