// Small shared helpers. Everything here is dependency-free.

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const easeInOut = (t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

const jsonCache = new Map();
export function getJSON(url) {
  if (!jsonCache.has(url)) jsonCache.set(url, fetch(url).then((r) => { if (!r.ok) throw new Error(url); return r.json(); }));
  return jsonCache.get(url);
}

// h("div.cls#id", {attr}, children) — tiny element factory. Text children are set as text nodes.
export function h(tag, attrs = {}, ...kids) {
  const m = tag.match(/^([a-z0-9]+)((?:[.#][\w-]+)*)$/i);
  const node = document.createElement(m ? m[1] : tag);
  if (m && m[2]) for (const part of m[2].match(/[.#][\w-]+/g)) {
    if (part[0] === ".") node.classList.add(part.slice(1)); else node.id = part.slice(1);
  }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "style" && typeof v === "object") Object.assign(node.style, v);
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else if (k === "text") node.textContent = v;
    else node.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) if (kid != null) node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return node;
}

const SVGNS = "http://www.w3.org/2000/svg";
export function s(tag, attrs = {}, ...kids) {
  const node = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs || {})) if (v != null) node.setAttribute(k, v);
  for (const kid of kids.flat()) if (kid != null) node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return node;
}

export function icon(id, cls = "") {
  const svg = s("svg", { class: cls, "aria-hidden": "true" });
  svg.append(s("use", { href: `#${id}` }));
  return svg;
}

export function badge(success, text) {
  const b = h("span.badge.pop." + (success ? "ok" : "bad"));
  b.append(icon(success ? "i-check" : "i-cross"), document.createTextNode(text || (success ? "Success" : "Failure")));
  return b;
}

// Run cb(true/false) as the element enters/leaves the viewport.
export function onVisible(el, cb, { rootMargin = "0px", threshold = 0.15 } = {}) {
  const io = new IntersectionObserver((ents) => ents.forEach((e) => cb(e.isIntersecting, e)), { rootMargin, threshold });
  io.observe(el);
  return io;
}

// Call cb once, the first time el gets near the viewport.
export function whenNear(el, cb, margin = "600px") {
  const io = new IntersectionObserver((ents) => {
    if (ents.some((e) => e.isIntersecting)) { io.disconnect(); cb(); }
  }, { rootMargin: margin });
  io.observe(el);
}

export const poster = (v) => v.replace(/\.mp4$/, ".webp");
export const fmt1 = (x) => (Math.round(x * 10) / 10).toFixed(1);
export const fmtPct = (x) => (Number.isInteger(x) ? String(x) : fmt1(x));

export function onResize(el, cb) {
  let w = 0;
  const ro = new ResizeObserver(() => {
    const nw = Math.round(el.getBoundingClientRect().width);
    if (nw && nw !== w) { w = nw; cb(nw); }
  });
  ro.observe(el);
  return ro;
}
