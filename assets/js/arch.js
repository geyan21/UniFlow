// UniFlow architecture, drawn as one inline SVG (viewBox 1180 x 600).
// Every component carries a tooltip; dashed connectors animate while in view.
import { s, onVisible } from "./util.js";
import { showTip, moveTip, hideTip } from "./charts.js";

const COL = { rgb: "#c05a22", pm: "#167e62", act: "#8d8c84", uni: "#4b3cb4", line: "rgba(0,0,0,.16)", box: "#fffffb", box2: "#f4f3eb", text: "#1a1a19", text2: "#56554f", muted: "#86857e" };

export function drawArchitecture(host) {
  const svg = s("svg", { viewBox: "0 0 1150 600", role: "group", "aria-label": "UniFlow architecture: RGB and pointmap encoders feed a unified MMDiT-Any diffusion transformer that denoises an action chunk" });
  const defs = s("defs");
  const gradAttn = s("linearGradient", { id: "g-attn", x1: "0", x2: "1", y1: "0", y2: "0" });
  gradAttn.append(s("stop", { offset: "0", "stop-color": COL.rgb, "stop-opacity": ".2" }), s("stop", { offset: ".5", "stop-color": COL.uni, "stop-opacity": ".2" }), s("stop", { offset: "1", "stop-color": COL.pm, "stop-opacity": ".2" }));
  const gradOut = s("linearGradient", { id: "g-out", x1: "0", x2: "1" });
  gradOut.append(s("stop", { offset: "0", "stop-color": "#5646c2" }), s("stop", { offset: "1", "stop-color": "#a49be0" }));
  const arrow = s("marker", { id: "arr", viewBox: "0 0 10 10", refX: "8", refY: "5", markerWidth: "7", markerHeight: "7", orient: "auto-start-reverse" });
  arrow.append(s("path", { d: "M0,0 L10,5 L0,10 z", fill: "rgba(0,0,0,.45)" }));
  defs.append(gradAttn, gradOut, arrow);
  for (const [id, x, y, w, h] of [["c-rgb", 0, 0, 150, 84], ["c-pm", 0, 0, 150, 84]]) {
    const cp = s("clipPath", { id }); cp.append(s("rect", { x, y, width: w, height: h, rx: 8 })); defs.append(cp);
  }
  svg.append(defs);

  const tipNode = (g, title, text) => {
    g.classList.add("node"); g.setAttribute("tabindex", "0"); g.setAttribute("role", "img"); g.setAttribute("aria-label", `${title}. ${text}`);
    const on = (ev) => showTip(ev, title, [], text);
    g.addEventListener("pointerenter", on); g.addEventListener("pointermove", moveTip); g.addEventListener("pointerleave", hideTip);
    g.addEventListener("focus", on); g.addEventListener("blur", hideTip);
    return g;
  };
  const T = (x, y, str, o = {}) => s("text", { x, y, fill: o.fill || COL.text, "font-size": o.size || 13, "font-weight": o.w || 500, "text-anchor": o.anchor || "start",
    "font-family": o.mono ? "JetBrains Mono, monospace" : "Source Serif 4, Georgia, serif", "letter-spacing": o.ls || 0, opacity: o.op || 1 }, str);
  const box = (x, y, w, h, o = {}) => s("rect", { class: "b", x, y, width: w, height: h, rx: o.rx ?? 10, fill: o.fill || COL.box, stroke: o.stroke || COL.line, "stroke-width": o.sw || 1 });
  const flow = (d, color = "rgba(0,0,0,.35)", marker = true) => s("path", { d, fill: "none", stroke: color, "stroke-width": 1.6, class: "flow", "marker-end": marker ? "url(#arr)" : null });

  // ---------- global conditioning (left)
  svg.append(T(24, 160, "GLOBAL CONDITIONING", { mono: true, size: 11, fill: COL.muted, ls: ".12em" }));
  const condRows = [
    ["Proprioception", "robot state → MLP", "The robot's proprioceptive state is projected by a small adaptor MLP into an embedding."],
    ["Language", "“Put the plate on the rack”", "The instruction is encoded by a pretrained text encoder; its pooled embedding is concatenated with the proprioception embedding."],
    ["Time t · step size Δt", "flow time and consistency step", "The diffusion timestep and the consistency target step size Δt join the global conditioning vector c."],
  ];
  condRows.forEach(([a, b, tip], i) => {
    const g = s("g"); const y = 176 + i * 62;
    g.append(box(24, y, 222, 50), T(40, y + 21, a, { w: 620, size: 13.5 }), T(40, y + 38, b, { size: 11.5, fill: COL.text2 }));
    svg.append(tipNode(g, a, tip));
  });
  const cg = s("g");
  cg.append(s("circle", { cx: 286, cy: 263, r: 17, fill: "#efedfa", stroke: COL.uni, "stroke-width": 1.4 }), T(286, 268, "c", { anchor: "middle", w: 650, size: 15, fill: "#4b3cb4" }));
  svg.append(tipNode(cg, "Global conditioning c", "Low-dimensional signals are not tokenized: proprioception, pooled language, t and Δt form one vector that drives every modality's AdaLN."));
  for (let i = 0; i < 3; i++) svg.append(flow(`M246,${201 + i * 62} C 262,${201 + i * 62} 262,263 268,263`, "rgba(75,60,180,.45)", false));
  // bus from c into each AdaLN
  svg.append(flow("M303,263 L330,263", "rgba(75,60,180,.6)", false));

  // ---------- transformer
  const tg = s("g");
  tg.append(box(318, 96, 682, 214, { rx: 16, fill: "rgba(75,60,180,.05)", stroke: "rgba(75,60,180,.38)" }),
    T(338, 122, "Unified diffusion transformer", { w: 680, size: 16 }), T(338, 140, "MMDiT-Any block (one of N = 8 · D 768 · 8 heads on LBM)", { size: 12, fill: COL.text2 }));
  svg.append(tipNode(tg, "Unified diffusion transformer", "A stack of N = 8 MMDiT-Any blocks (hidden 768, 8 heads in the saved LBM configs, MLP ratio 4, GELU). Each block: per-modality AdaLN → one joint self-attention over all streams → per-modality FFN, with per-modality gates α_m(c)."));
  const nb = s("g"); nb.append(s("rect", { x: 902, y: 108, width: 82, height: 26, rx: 13, fill: "rgba(75,60,180,.16)", stroke: "rgba(75,60,180,.45)" }), T(943, 125, "× 8", { anchor: "middle", w: 700, size: 13, fill: "#4b3cb4" }));
  svg.append(nb);
  const lanes = [
    { k: "rgb", x: 340, name: "RGB", c: COL.rgb, ada: "AdaLN_rgb(c)", ffn: "FFN_rgb" },
    { k: "pm", x: 560, name: "Pointmap", c: COL.pm, ada: "AdaLN_pm(c)", ffn: "FFN_pm" },
    { k: "act", x: 780, name: "Action", c: COL.act, ada: "AdaLN_act(c)", ffn: "FFN_act" },
  ];
  const LW = 200;
  // joint attention (spans all lanes)
  const ag = s("g");
  ag.append(s("rect", { class: "b", x: 340, y: 196, width: 640, height: 34, rx: 9, fill: "url(#g-attn)", stroke: "rgba(0,0,0,.18)" }),
    T(660, 218, "Joint self-attention  ·  Q, K, V over [ RGB | pointmap | action ] tokens", { anchor: "middle", w: 640, size: 13 }));
  svg.append(tipNode(ag, "Joint self-attention", "A single attention map over the concatenation of all modality streams, so every stream attends to every other. Masked (dropped) cameras/modalities are excluded through the attention mask."));
  lanes.forEach((L) => {
    const a = s("g"); a.append(box(L.x + 10, 246, LW - 20, 30, { stroke: L.c, fill: COL.box2 }), T(L.x + LW / 2, 266, L.ada, { anchor: "middle", size: 12.5, mono: true, fill: COL.text }));
    svg.append(tipNode(a, `Per-modality modulation (${L.name})`, `Adaptive LayerNorm with this stream's own scale/shift (and gate) predicted from c. Each modality is modulated in parallel instead of sharing one modulation across a concatenated context.`));
    const f = s("g"); f.append(box(L.x + 10, 152, LW - 20, 30, { stroke: L.c, fill: COL.box2 }), T(L.x + LW / 2, 172, L.ffn, { anchor: "middle", size: 12.5, mono: true }));
    svg.append(tipNode(f, `Per-modality feed-forward (${L.name})`, "Each stream has its own FFN, AdaLN and attention projections (Q, K, V); the streams share no block weights and meet only in the joint attention."));
    svg.append(flow(`M${L.x + LW / 2},246 L${L.x + LW / 2},234`, L.c), flow(`M${L.x + LW / 2},196 L${L.x + LW / 2},186`, L.c));
    svg.append(flow(`M${L.x + 22},263 L${L.x + 22},263`, "transparent", false));
  });
  // c bus line under AdaLN boxes
  svg.append(s("path", { d: "M330,263 L350,263", stroke: "rgba(75,60,180,.6)", "stroke-width": 1.6, fill: "none" }));
  svg.append(s("path", { d: "M330,292 L970,292", stroke: "rgba(75,60,180,.35)", "stroke-width": 1.2, fill: "none", "stroke-dasharray": "2 4" }));
  svg.append(s("path", { d: "M318,263 L330,263 L330,292", stroke: "rgba(75,60,180,.5)", "stroke-width": 1.2, fill: "none" }));
  lanes.forEach((L) => svg.append(flow(`M${L.x + 40},292 L${L.x + 40},280`, "rgba(75,60,180,.65)")));
  svg.append(T(976, 304, "c → every AdaLN", { anchor: "end", size: 10.5, fill: COL.muted, mono: true }));

  // ---------- tokens
  const tokens = [
    { x: 362, n: 9, c: COL.rgb, label: "RGB tokens / camera", tip: ["RGB tokens", "The RGB encoder's spatial feature map, flattened into tokens for every camera."] },
    { x: 598, n: 5, c: COL.pm, label: "pointmap tokens / camera", tip: ["Pointmap tokens", "The pointmap encoder's spatial feature map, flattened into tokens for every camera, next to the RGB tokens."] },
    { x: 806, n: 7, c: COL.act, label: "H noisy action tokens", tip: ["Action tokens", "The noisy action chunk x_t is embedded as H tokens; the action stream is denoised by the same blocks."] },
  ];
  tokens.forEach((tk, i) => {
    const g = s("g");
    for (let k = 0; k < tk.n; k++) {
      const x = tk.x + k * 17;
      if (k === tk.n - 2) { g.append(T(x + 6, 342, "…", { anchor: "middle", fill: COL.text2 })); continue; }
      g.append(s("rect", { x, y: 326, width: 12, height: 18, rx: 3.5, fill: tk.c, opacity: .85 }));
    }
    g.append(T(lanes[i].x + LW / 2, 362, tk.label, { anchor: "middle", size: 11.5, fill: COL.text2 }));
    svg.append(tipNode(g, tk.tip[0], tk.tip[1]));
    svg.append(flow(`M${lanes[i].x + LW / 2},322 L${lanes[i].x + LW / 2},312`, tk.c));
  });

  // ---------- encoders (trapezoids)
  const enc = [
    { x: 440, top: 140, bot: 186, y: 378, c: COL.rgb, a: "2D encoder", b: "pretrained · fine-tuned", tip: ["RGB encoder", "A pretrained 2D image encoder encodes each camera image and is fine-tuned with the policy; color jitter (and small crops/rotations on scene cameras) at train time."] },
    { x: 660, top: 140, bot: 186, y: 378, c: COL.pm, a: "2D encoder", b: "pretrained · fine-tuned", tip: ["Pointmap encoder", "The pointmap is treated as a 3-channel image, clipped to a per-camera box and normalized to [−1, 1], then encoded by a pretrained 2D image encoder, just like RGB. No augmentation, so physical coordinates stay valid."] },
    { x: 880, top: 96, bot: 130, y: 378, c: COL.act, a: "Linear", b: "embed", tip: ["Action embedding", "Noisy actions are linearly embedded into the transformer width."] },
  ];
  enc.forEach((e, i) => {
    const g = s("g"), y0 = e.y, y1 = e.y + 44;
    g.append(s("path", { class: "box b", d: `M${e.x - e.top / 2},${y0} L${e.x + e.top / 2},${y0} L${e.x + e.bot / 2},${y1} L${e.x - e.bot / 2},${y1} Z`, fill: COL.box2, stroke: e.c, "stroke-width": 1.2 }),
      T(e.x, y0 + 19, e.a, { anchor: "middle", w: 640, size: 13 }), T(e.x, y0 + 35, e.b, { anchor: "middle", size: 10.5, fill: COL.text2 }));
    svg.append(tipNode(g, e.tip[0], e.tip[1]));
    svg.append(flow(`M${e.x},${y0 - 2} L${e.x},368`, e.c));
  });

  // ---------- inputs
  const inputs = [
    { x: 365, img: "assets/img/arch-rgb.webp", clip: "c-rgb", c: COL.rgb, label: "Multi-view RGB", sub: "4 cameras on LBM · 3 on YAM", tip: ["RGB observations", "Every camera contributes an RGB stream (two scene + two wrist cameras on LBM; head + two wrists on the YAM robot; head camera only on RoboTwin)."] },
    { x: 585, img: "assets/img/arch-pmap.webp", clip: "c-pm", c: COL.pm, label: "Aligned pointmaps", sub: "(x, y, z) per pixel, camera frame", tip: ["Pointmap observations", "Depth back-projected with the camera intrinsics into an image-shaped map of 3D points, pixel-aligned with the RGB image of the same camera."] },
  ];
  inputs.forEach((inp) => {
    const g = s("g");
    for (let k = 2; k >= 0; k--) {
      const gx = inp.x + k * 10, gy = 440 - k * 8;
      const im = s("g", { transform: `translate(${gx},${gy})` });
      im.append(s("image", { href: inp.img, x: 0, y: 0, width: 150, height: 84, "clip-path": `url(#${inp.clip})`, preserveAspectRatio: "xMidYMid slice", opacity: k ? .55 : 1 }),
        s("rect", { x: 0, y: 0, width: 150, height: 84, rx: 8, fill: "none", stroke: k ? "rgba(0,0,0,.12)" : inp.c, "stroke-width": k ? 1 : 1.2 }));
      g.append(im);
    }
    g.append(T(inp.x + 85, 552, inp.label, { anchor: "middle", w: 620, size: 13.5 }), T(inp.x + 85, 570, inp.sub, { anchor: "middle", size: 11.5, fill: COL.text2 }));
    svg.append(tipNode(g, inp.tip[0], inp.tip[1]));
  });
  // noisy actions: a few jagged trajectories
  const ng = s("g");
  ng.append(box(808, 440, 146, 84, { fill: "#f4f3eb" }));
  const rnd = (k) => { let x = Math.sin(k * 12.9898) * 43758.5453; return x - Math.floor(x); };
  for (let r = 0; r < 3; r++) {
    let d = "", yy = 466 + r * 18;
    for (let k = 0; k <= 12; k++) { const x = 818 + k * 10.5, y = yy + (rnd(k + r * 31) - 0.5) * 14; d += (k ? "L" : "M") + x.toFixed(1) + "," + y.toFixed(1); }
    ng.append(s("path", { d, fill: "none", stroke: ["#8d8c84", "#6f6e67", "#a8a79f"][r], "stroke-width": 1.4, opacity: .9 }));
  }
  ng.append(T(881, 552, "Noisy action chunk", { anchor: "middle", w: 620, size: 13.5 }), T(881, 570, "x₀ ~ N(0, I), H steps", { anchor: "middle", size: 11.5, fill: COL.text2 }));
  svg.append(tipNode(ng, "Noisy action chunk", "At inference an action chunk is sampled from Gaussian noise and denoised by the transformer."));
  svg.append(flow("M881,438 L881,424", COL.act));

  // ---------- output
  const og = s("g");
  for (let k = 0; k < 7; k++) {
    const x = 806 + k * 21;
    if (k === 5) { og.append(T(x + 7, 62, "…", { anchor: "middle", fill: COL.text2 })); continue; }
    og.append(s("rect", { x, y: 46, width: 16, height: 22, rx: 4, fill: "url(#g-out)", opacity: 0.55 + 0.06 * k }));
  }
  og.append(T(880, 34, "Denoised action chunk (H steps)", { anchor: "middle", w: 640, size: 13.5 }));
  svg.append(tipNode(og, "Action chunk", "The model outputs a chunk of H future actions; the robot executes the first n_exec of them and re-plans (receding horizon)."));
  svg.append(flow("M880,96 L880,74", COL.uni));
  // Euler-step loop on the right
  const lg = s("g");
  lg.append(s("path", { d: "M960,57 C1010,57 1012,150 1012,250 C1012,400 1000,482 958,482", fill: "none", stroke: "rgba(75,60,180,.55)", "stroke-width": 1.5, class: "flow", "marker-end": "url(#arr)" }),
    T(1024, 246, "few Euler steps", { size: 12.5, w: 620, fill: "#4b3cb4" }), T(1024, 263, "consistency flow", { size: 11.5, fill: "#56554f" }), T(1024, 278, "matching", { size: 11.5, fill: "#56554f" }));
  svg.append(tipNode(lg, "Few-step inference", "Consistency flow matching trains the velocity field for finite-step prediction, so an action chunk can be decoded in a few Euler steps (one forward pass per step)."));

  host.replaceChildren(svg);
  onVisible(host, (on) => host.classList.toggle("paused", !on), { threshold: 0 });
}
