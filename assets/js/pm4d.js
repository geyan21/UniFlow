// "4D pointmap" player: a real YAM demonstration played back as a moving point cloud.
// Each clip is one H.264 video: the RGB stream on top and the head-camera depth below it,
// quantised into the luma channel (see meta.json/layout). Every pixel becomes one point:
// the vertex shader reads its depth from the current video frame, back-projects it with the
// camera intrinsics (X = (u - cx) Z / fx, Y = (v - cy) Z / fy) and shades it by its normal.
import { getJSON, clamp, easeInOut, reducedMotion } from "./util.js";

const BASE = new URL("../pm4d/", import.meta.url).href;   // works from any page depth

const VS = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uVid;     // current frame: RGB, coarse depth, fine depth tiles
uniform sampler2D uBg;      // static background of the clip, same layout
uniform int uPass;          // 0: background points, 1: current frame, 2: gap fill (anchored 3D)
uniform vec3 uBgCol;        // stage colour that fog and edge fades blend into
uniform vec4 uK;            // fx fy cx cy
uniform vec4 uZ;            // zn zf codeLo codeHi
uniform ivec3 uGrid;        // grid width, stride, depth top row
uniform mat4 uModel, uView, uProj;
uniform float uMorph, uZ0, uColor, uSize, uFpx, uDpr, uShade, uFade, uFlat;
uniform vec3 uLo, uHi, uLight, uEye;
uniform vec4 uFadeBox;      // world x/z half-extents where the edge fade starts, and its width
uniform float uTint;        // 0..1: tint points above the table by their height
uniform float uGain;        // brightness of the camera colours
uniform float uSplit;       // image mode: RGB left of this image-u fraction, pointmap colours right of it (< 0: off)
uniform float uImp;         // 3D: opacity of the flat stand-ins for pixels without depth (1 near the camera's own view)
out vec3 vCol;
out float vA;
out float vRound;

uniform vec4 uPlane;        // table plane in camera coords: n.xyz, d (n.P + d = 0)
uniform vec3 uEnc;          // mode (0 linear depth, 1 sqrt offset in front of the plane), rmax, bias
uniform vec2 uFine;         // fine tile: first row, triangle-wave period in coarse codes (0 = none)

float code(sampler2D T, ivec2 p) {
  vec3 c = texelFetch(T, ivec2(p.x, p.y + uGrid.z), 0).rgb;
  return dot(c, vec3(0.2126, 0.7152, 0.0722)) * 255.0;   // BT.709 luma: cancels any chroma noise
}
vec3 ray(vec2 uv) { return vec3((uv.x - uK.z) / uK.x, (uv.y - uK.w) / uK.y, 1.0); }
// metric depth of pixel p (or -1 where there is no depth), and the size of one code step there.
// The coarse code is refined by the fine tile, a triangle wave of the code: of the four nearby
// candidates it allows, keep the one closest to the coarse value.
float zAt(sampler2D T, ivec2 p, out float q) {
  float c = code(T, p);
  q = 0.0;
  if (c < uZ.z - 6.0) return -1.0;
  float step = 1.0;
  if (uFine.y > 0.0) {
    vec3 fb = texelFetch(T, ivec2(p.x, p.y + int(uFine.x)), 0).rgb;
    float f = clamp((dot(fb, vec3(0.2126, 0.7152, 0.0722)) * 255.0 - uZ.z) / (uZ.w - uZ.z), 0.0, 1.0);
    float ua = (c - uZ.z) / uFine.y, b = floor(ua * 0.5) * 2.0;
    float x = b - 1.0 + f, e = abs(x - ua), y;
    y = b + 1.0 - f; if (abs(y - ua) < e) { x = y; e = abs(y - ua); }
    y = b + 1.0 + f; if (abs(y - ua) < e) { x = y; e = abs(y - ua); }
    y = b + 3.0 - f; if (abs(y - ua) < e) { x = y; }
    c = uZ.z + x * uFine.y;
    step = uFine.y / 200.0;
  }
  float t = clamp((c - uZ.z) / (uZ.w - uZ.z), 0.0, 1.0);
  if (uEnc.x < 0.5) { q = step * (uZ.y - uZ.x) / (uZ.w - uZ.z); return uZ.x + t * (uZ.y - uZ.x); }
  q = step * 2.0 * max(t, 0.02) * uEnc.y / (uZ.w - uZ.z);
  float zp = -uPlane.w / dot(uPlane.xyz, ray(vec2(p) + 0.5));
  return zp - (t * t * uEnc.y - uEnc.z);
}
float minmod(float a, float b) { return (a * b <= 0.0) ? 0.0 : (abs(a) < abs(b) ? a : b); }

void main() {
  int s = uGrid.y;
  ivec2 p = ivec2(gl_VertexID % uGrid.x, gl_VertexID / uGrid.x) * s;
  vA = 0.0; vCol = vec3(0.0); vRound = 0.0;
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0;
  if (p.x < 0 || p.y < 0 || p.x >= 640 || p.y >= 360) return;
  if (uPass == 2) {
    // gap fill (anchored 3D only): every 4th background point again as a large splat, pushed slightly back and drawn
    // first, so every real point wins. It only shows where the turned view looks into a gap no camera pixel covers.
    if (p.x % 4 != 0 || p.y % 4 != 0 || uMorph < 0.5) return;
    float qf, zf = zAt(uBg, p, qf);
    if (zf <= 0.0) return;
    vec4 vf = uView * (uModel * vec4(ray(vec2(p) + 0.5) * zf, 1.0));
    vf.xyz *= 1.05;                              // farther along the same sight line: same place on screen, behind
    gl_Position = uProj * vf;
    gl_PointSize = clamp(6.0 * zf / uK.x * uFpx / max(0.03, -vf.z), 1.0, 48.0 * uDpr);
    vCol = texelFetch(uBg, p, 0).rgb * uGain; vA = uFade; vRound = 1.0;
    return;
  }
  bool bgp = uPass == 0;
  // background points only matter once the image has lifted into 3D
  float a0 = bgp ? smoothstep(0.35, 0.85, uMorph) : 1.0;
  if (a0 <= 0.0) return;
  vec2 uv = vec2(p) + 0.5;
  vec3 r = ray(uv);
  vec3 rgb = bgp ? texelFetch(uBg, p, 0).rgb : texelFetch(uVid, p, 0).rgb;
  bool ok = p.x >= s && p.y >= s && p.x < 640 - s && p.y < 360 - s;
  float z[9], q0 = 0.0, qq;
  for (int k = 0; k < 9; k++) {
    ivec2 pk = p + ivec2(k % 3 - 1, k / 3 - 1) * s;
    z[k] = ok ? (bgp ? zAt(uBg, pk, qq) : zAt(uVid, pk, qq)) : -1.0;
    if (z[k] <= 0.0) ok = false;                 // next to a hole: no 3D point (also removes ringing at hole borders)
    if (k == 4) q0 = qq;
  }
  float Z = 0.0, Zu = 0.0, Zv = 0.0;
  if (ok) {
    float Z0 = z[4];
    // slope from one-sided differences (minmod keeps depth edges from leaking into the slope)
    float gx = minmod(z[5] - Z0, Z0 - z[3]), gy = minmod(z[7] - Z0, Z0 - z[1]);
    // edge-aware smoothing on the local plane: neighbours that agree with the slope are averaged
    float tol = max(max(0.003, 0.01 * Z0), 2.5 * q0);
    float sum = 0.0, n = 0.0;
    for (int k = 0; k < 9; k++) {
      float dx = float(k % 3 - 1), dy = float(k / 3 - 1);
      float e = z[k] - gx * dx - gy * dy;
      if (abs(e - Z0) < tol) { sum += e; n += 1.0; }
    }
    ok = n >= 5.0;                               // otherwise a flying pixel or an isolated speck
    Z = sum / max(n, 1.0);
    // a smoother slope for the normal: Sobel when the whole neighbourhood agrees
    float sx = (z[2] + 2.0 * z[5] + z[8]) - (z[0] + 2.0 * z[3] + z[6]);
    float sy = (z[6] + 2.0 * z[7] + z[8]) - (z[0] + 2.0 * z[1] + z[2]);
    Zu = (n > 8.5 ? sx / 8.0 : gx) / float(s); Zv = (n > 8.5 ? sy / 8.0 : gy) / float(s);
  }
  float cellF = mix(1.12, uSize, uMorph);        // flat: squares that tile the photo; 3D: overlapping discs
  vRound = smoothstep(0.1, 0.45, uMorph);
  if (bgp) {
    if (!ok) return;
    // the current frame already shows this surface (or something behind it): no background point
    float qc, zc = zAt(uVid, p, qc);
    if (zc > 0.0 && zc > Z - max(0.012, 0.02 * Z)) return;
  }
  if (!ok) {
    // a pixel without a 3D point exists only in the photo. Flat, it sits on the image plane (RGB side only).
    // Lifted, it becomes a flat stand-in at the depth around it, kept only while the view stays near the
    // camera's own (uImp): there the scene reads as whole; further round, the real gaps show.
    float aF = (uSplit >= 0.0 && uv.x / 640.0 >= uSplit) ? 0.0 : 1.0 - smoothstep(0.0, 0.3, uMorph);
    float a = max(aF, uImp * smoothstep(0.0, 0.6, uMorph));
    if (a <= 0.0) return;
    float zs = uZ0;
    if (uMorph > 0.0) {
      // where the stand-in goes: on the static background if the pixel still shows it (same colour there),
      // otherwise at the depth around it, typically the rest of a dark robot link whose stereo depth failed
      float qd, zb = zAt(uBg, p, qd);
      vec3 dc = texelFetch(uBg, p, 0).rgb - rgb;
      if (zb > 0.0 && dot(dc, dc) < 0.012) zs = zb;
      else {
        // the first depth met in each of 8 directions; their (lower) median: the surrounding surface,
        // robust to a single near or far neighbour (a stereo shadow next to an object lands on the table)
        float hz[8]; int nh = 0;
        for (int i = 0; i < 8; i++) {
          hz[i] = 1e9;
          vec2 dir = vec2(cos(float(i) * 0.7854), sin(float(i) * 0.7854));
          for (int j = 0; j < 4; j++) {
            ivec2 q = clamp(p + ivec2(dir * (j == 0 ? 4.0 : j == 1 ? 12.0 : j == 2 ? 30.0 : 70.0)), ivec2(0), ivec2(639, 359));
            float zq = zAt(uVid, q, qd);
            if (zq > 0.0) { hz[i] = zq; nh++; break; }
          }
        }
        for (int i = 0; i < 7; i++) for (int k = 0; k < 7 - i; k++) if (hz[k] > hz[k + 1]) { float t = hz[k]; hz[k] = hz[k + 1]; hz[k + 1] = t; }
        float nr = dot(uPlane.xyz, r);
        // with few neighbours (a large hole, or beyond the table) continue the table plane instead
        zs = nh >= 3 ? hz[(nh - 1) / 2] : (uEnc.x > 0.5 && nr < -1e-4) ? clamp(-uPlane.w / nr, uZ.x, 3.0) : uZ0;
      }
      zs -= 0.004;
    }
    float zi = mix(uZ0, zs, uMorph);
    vec4 wi = uModel * vec4(r * zi, 1.0), vv = uView * wi;
    gl_Position = uProj * vv;
    gl_PointSize = clamp(cellF * zi * float(s) / uK.x * uFpx / max(0.03, -vv.z), 1.0, 16.0 * uDpr);
    float exi = smoothstep(uFadeBox.x + uFadeBox.w, uFadeBox.x, abs(wi.x));
    float ezi = smoothstep(uFadeBox.y + uFadeBox.w, uFadeBox.y, abs(wi.z - uFadeBox.z));
    float edi = mix(1.0, exi * ezi, uMorph);
    vCol = mix(uBgCol, rgb * uGain, mix(0.35, 1.0, edi)); vA = uFade * a * edi;
    return;
  }
  vec3 P = Z * r;
  vec3 Pu = Zu * r + vec3(Z / uK.x, 0.0, 0.0);
  vec3 Pv = Zv * r + vec3(0.0, Z / uK.y, 0.0);
  vec3 N = normalize(cross(Pv, Pu));   // toward the camera
  vec3 Pf = r * uZ0;                             // the same pixel on the image plane
  vec3 Pc = mix(Pf, P, uMorph);
  vec4 w = uModel * vec4(Pc, 1.0);
  vec4 v = uView * w;
  gl_Position = uProj * v;
  float d = max(0.03, -v.z);
  float foot = mix(uZ0, Z, uMorph) * float(s) / uK.x;  // world size of one (strided) pixel
  gl_PointSize = clamp(cellF * foot * uFpx / d, 1.0, 16.0 * uDpr);
  vec3 xyz = clamp((P - uLo) / (uHi - uLo), 0.0, 1.0);
  xyz = pow(xyz, vec3(0.9)) * 0.9 + 0.05;
  xyz = mix(vec3(dot(xyz, vec3(0.333))), xyz, 0.86);   // a touch less saturated than raw (x, y, z) -> (r, g, b)
  vec3 Nw = normalize(mat3(uModel) * N);
  vec3 Vw = normalize(uEye - w.xyz);
  if (dot(Nw, Vw) < 0.0) Nw = -Nw;
  float l = max(dot(Nw, uLight), 0.0);
  float sh = mix(1.0, 0.6 + 0.55 * l, uShade * uMorph);
  float spec = pow(max(dot(reflect(-uLight, Nw), Vw), 0.0), 18.0);
  float rim = pow(1.0 - abs(dot(Nw, Vw)), 2.5);
  vec3 base = mix(rgb * uGain, xyz, uColor);
  // height tint (brand gradient: orange -> violet -> teal), only for points clearly above the table
  float hg = w.y;
  vec3 hc = mix(mix(vec3(1.0, 0.54, 0.30), vec3(0.66, 0.61, 1.0), clamp(hg / 0.16, 0.0, 1.0)),
                vec3(0.21, 0.88, 0.71), clamp((hg - 0.16) / 0.18, 0.0, 1.0));
  float tw = smoothstep(0.025, 0.09, hg) * uTint * uMorph;
  base = mix(base, base * 0.3 + hc * 0.8, tw);
  if (uSplit >= 0.0) base = mix(uv.x / 640.0 < uSplit ? rgb * uGain : xyz, base, uMorph);
  vCol = base * sh + (0.16 * spec + 0.10 * rim) * uShade * uMorph * vec3(0.92, 0.95, 1.0);
  // soft fade towards the edges of the scene, so the cloud does not end in a hard cut
  float ex = smoothstep(uFadeBox.x + uFadeBox.w, uFadeBox.x, abs(w.x));
  float ez = smoothstep(uFadeBox.y + uFadeBox.w, uFadeBox.y, abs(w.z - uFadeBox.z));
  float edge = mix(1.0, ex * ez, uMorph);
  if (edge <= 0.0) return;
  float fog = clamp((d - 1.2) / 2.2, 0.0, 0.3);
  vCol = mix(uBgCol, vCol, (1.0 - fog) * mix(0.35, 1.0, edge));
  vA = uFade * a0;
}`;

const FS = `#version 300 es
precision mediump float;
in vec3 vCol;
in float vA;
in float vRound;
out vec4 o;
void main() {
  if (vA <= 0.0) discard;
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(c, c);
  if (vRound > 0.5 && r2 > 1.0) discard;          // discs in 3D, squares while the image is flat
  o = vec4(vCol * (1.0 - 0.06 * r2 * vRound) * vA, vA);   // a faint rim; stronger reads as halftone on a light stage
}`;

// ---------------------------------------------------------------- tiny mat4 helpers (column-major)
const D2R = Math.PI / 180;
function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => mul(a, 1 / Math.hypot(...a));
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
function lookAt(e, t, u) {
  const z = norm(sub(e, t)), x = norm(cross(u, z)), y = cross(z, x);
  return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, e), -dot(y, e), -dot(z, e), 1]);
}
function project(V, P, p) {
  const vx = V[0] * p[0] + V[4] * p[1] + V[8] * p[2] + V[12], vy = V[1] * p[0] + V[5] * p[1] + V[9] * p[2] + V[13], vz = V[2] * p[0] + V[6] * p[1] + V[10] * p[2] + V[14];
  const w = -vz;
  return w > 0.01 ? [(P[0] * vx) / w, (P[5] * vy) / w] : null;
}

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src); gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
  return sh;
}

// Camera (OpenCV: x right, y down, z forward) -> world (y = table up). meta: R rows = world axes in camera coords.
function clipFrames(c) {
  const R = c.R, o = c.origin;
  const toW = (p) => [dot(R[0], p), dot(R[1], p), dot(R[2], p)];
  const M = new Float32Array([R[0][0], R[1][0], R[2][0], 0, R[0][1], R[1][1], R[2][1], 0, R[0][2], R[1][2], R[2][2], 0, 0, 0, 0, 1]);
  const t = toW(o);
  M[12] = -t[0]; M[13] = -t[1]; M[14] = -t[2];
  // the real camera, expressed in world coordinates
  const eye = mul(t, -1), fwd = toW([0, 0, 1]), up = toW([0, -1, 0]);
  return { M, toW, cam: { eye, fwd, up } };
}

export async function createPointmapPlayer(canvas, opts = {}) {
  // anchor: orbit about the photo's own centre, starting from the real camera's direction (yaw/pitch are then
  // offsets from it and dolly scales the photo distance); otherwise a free orbit framing the whole table box.
  const o = Object.assign({ clip: null, color: "rgb", tint: 0, yaw: 34, pitch: 24, fov: 30, fill: 0.92, size: 1.55, shade: 0.9, anchor: false, dolly: 0.88,
    stride: matchMedia("(max-width: 700px)").matches ? 2 : 1, autoplay: true, intro: true, swing: 16, target: [0, 0.07, 0.02],
    interactive: true, liftOnDrag: true, flatFill: 1.02, gain: 1, stage: [0.92, 0.918, 0.886], onTime: null, onState: null, onReady: null }, opts);
  const still = reducedMotion();
  if (still) { o.intro = false; o.swing = 0; }   // reduced motion: no camera intro or swing; the clip itself still plays
  const meta = await getJSON(BASE + "meta.json");
  const L = meta.layout;
  const gl = canvas.getContext("webgl2", { antialias: true, alpha: true, premultipliedAlpha: true });
  const video = document.createElement("video");
  Object.assign(video, { muted: true, playsInline: true, loop: true, preload: "auto", crossOrigin: "anonymous" });
  video.muted = true; video.setAttribute("muted", ""); video.setAttribute("playsinline", "");
  if (!gl) return fallback(canvas, video, meta, o);
  let prog;
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  } catch (e) { console.warn("pm4d", e); return fallback(canvas, video, meta, o); }
  const U = {};
  for (const k of ["uVid", "uK", "uZ", "uGrid", "uModel", "uView", "uProj", "uMorph", "uZ0", "uColor", "uSize", "uFpx", "uDpr", "uShade", "uFade", "uLo", "uHi", "uLight", "uPlane", "uEnc", "uEye", "uFadeBox", "uTint", "uFine", "uSplit", "uGain", "uBg", "uPass", "uBgCol", "uImp"]) U[k] = gl.getUniformLocation(prog, k);
  const vao = gl.createVertexArray();
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
  // the clip's static background (a lossless PNG in the same tile layout as the video)
  const bgTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, bgTex);
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
  let bgFor = null;
  async function loadBg(c) {
    bgFor = null;
    if (!c.bg) return;
    const img = new Image();
    img.src = BASE + c.bg;
    try { await img.decode(); } catch (e) { return; }
    if (st.clip !== c) return;
    gl.bindTexture(gl.TEXTURE_2D, bgTex);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    bgFor = c;
  }

  const st = { clip: null, F: null, morph: 0, color: o.color === "xyz" ? 1 : 0, colorTo: o.color === "xyz" ? 1 : 0, flatTo: 0,
    introT: 0, intro: false, fade: 0, drag: null, userYaw: 0, userPitch: 0, idle: 0, swingT: 0, visible: true, raf: 0, last: 0,
    hasFrame: false, newFrame: false, fit: null, tint: o.tint || 0, tintTo: o.tint || 0, playing: false, userPaused: false, zoom: 1, split: -1, ready: false,
    pitchBase: o.pitch, imp: 1 };

  function setClipData(id) {
    const c = meta.clips.find((x) => x.id === id) || meta.clips[0];
    st.clip = c; st.F = clipFrames(c); st.fit = null; st.hasFrame = false; st.ready = false;
    return c;
  }

  async function setClip(id, { intro = o.intro } = {}) {
    const c = setClipData(id);
    st.intro = intro && !reducedMotion(); st.introT = 0; st.morph = st.intro ? 0 : 1; st.fade = 0;
    video.src = BASE + c.src;
    video.poster = BASE + c.poster;
    loadBg(c);
    try { video.load(); } catch (e) {}
    if (o.autoplay && !st.userPaused) play();
    o.onState?.({ clip: c.id, playing: st.playing });
  }

  // st.playing is the intent; visibility pauses the video without changing it. Only a blocked autoplay
  // (NotAllowedError) clears the intent: an AbortError just means a pause() raced the play() request.
  function play() {
    st.playing = true; o.onState?.({ playing: true });
    if (!st.visible) return;
    video.play().catch((e) => { if (e && e.name === "NotAllowedError") { st.playing = false; o.onState?.({ playing: false }); } });
  }
  function pause() { st.playing = false; video.pause(); o.onState?.({ playing: false }); }

  // upload a video frame only when a new one is decoded
  const hasRVFC = "requestVideoFrameCallback" in HTMLVideoElement.prototype;
  if (hasRVFC) {
    const onFrame = () => { st.newFrame = true; video.requestVideoFrameCallback(onFrame); };
    video.requestVideoFrameCallback(onFrame);
  }
  video.addEventListener("loadeddata", () => { st.newFrame = true; });
  video.addEventListener("seeked", () => { st.newFrame = true; });
  video.addEventListener("timeupdate", () => o.onTime?.(video.currentTime, video.duration || st.clip?.duration || 0));

  function size() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr)), hh = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== hh) { canvas.width = w; canvas.height = hh; st.fit = null; }
    return dpr;
  }

  // Frame the world-space box of the clip for a given orbit, so it fills `fill` of the viewport.
  function fitOrbit(yaw, pitch, fy, aspect) {
    const c = st.clip, W = st.F.toW;
    const lo = c.wbox?.lo || [-0.45, -0.02, -0.35], hi = c.wbox?.hi || [0.45, 0.3, 0.3];
    const corners = [];
    for (const x of [lo[0], hi[0]]) for (const y of [lo[1], hi[1]]) for (const z of [lo[2], hi[2]]) corners.push([x, y, z]);
    let T = o.target.slice(), dist = 1.2;
    const P = perspective(fy, aspect, 0.02, 30);
    for (let it = 0; it < 8; it++) {
      const eye = orbitEye(T, dist, yaw, pitch), V = lookAt(eye, T, [0, 1, 0]);
      const pts = corners.map((q) => project(V, P, q)).filter(Boolean);
      const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      const ext = Math.max((x1 - x0) / 2, (y1 - y0) / 2);
      const z = norm(sub(eye, T)), xr = norm(cross([0, 1, 0], z)), yu = cross(z, xr);
      const tf = Math.tan(fy / 2);
      T = add(T, add(mul(xr, ((x0 + x1) / 2) * dist * tf * aspect * 0.9), mul(yu, ((y0 + y1) / 2) * dist * tf * 0.9)));
      dist *= ext / o.fill;
    }
    void W;
    return { T, dist };
  }
  function orbitEye(T, dist, yaw, pitch) {
    const cy = Math.cos(yaw * D2R), sy = Math.sin(yaw * D2R), cp = Math.cos(pitch * D2R), sp = Math.sin(pitch * D2R);
    return [T[0] + dist * sy * cp, T[1] + dist * sp, T[2] + dist * cy * cp];
  }

  function frame(now) {
    st.raf = requestAnimationFrame(frame);
    if (!st.visible || !st.clip) return;
    const dt = Math.min(0.05, (now - (st.last || now)) / 1000); st.last = now;
    if (video.readyState >= 2 && (st.newFrame || !hasRVFC)) {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video); st.hasFrame = true; } catch (e) { /* not ready */ }
      if (st.hasFrame && !st.ready) { st.ready = true; requestAnimationFrame(() => o.onReady?.()); }
      st.newFrame = false;
    }
    if (!st.hasFrame) return;
    const dpr = size();
    st.fade = Math.min(1, st.fade + dt * 2.5);
    // intro: the photo first, then it lifts into 3D while the view swings to the oblique orbit
    if (st.intro) {
      st.introT += dt;
      st.morph = easeInOut(clamp((st.introT - 0.6) / 2.4));
      if (st.introT > 3.2) { st.intro = false; st.morph = 1; }
    } else {
      const target = st.flatTo ? 0 : 1;
      st.morph += (target - st.morph) * Math.min(1, dt * 3.2);
    }
    st.color += (st.colorTo - st.color) * Math.min(1, dt * 6);
    if (!st.drag) st.idle += dt;
    let yaw = o.yaw + st.userYaw, pitch = o.pitch + st.userPitch;
    if (o.swing && !reducedMotion()) {
      st.swingT += dt * Math.min(1, st.idle / 2.5);
      yaw += o.swing * Math.sin(st.swingT * 0.28);
      pitch += 3 * Math.sin(st.swingT * 0.19);
    }
    const c = st.clip, cam = st.F.cam, K = c.K;
    // anchored, the virtual camera keeps the real one's field of view: at its pose the lifted cloud is exactly the photo
    const W = canvas.width, H = canvas.height, aspect = W / H, tf = o.anchor ? L.height / 2 / K.fy : Math.tan((o.fov * D2R) / 2), fy = 2 * Math.atan(tf);
    if (!st.fit && !o.anchor) {
      const f1 = fitOrbit(o.yaw, o.pitch, fy, aspect);
      if (o.swing) for (const sg of [-1, 1]) f1.dist = Math.max(f1.dist, fitOrbit(o.yaw + sg * (o.swing + 6), o.pitch, fy, aspect).dist);
      st.fit = f1;
    }
    // blend the real camera (photo view) with the orbit camera by the morph amount
    const z0 = c.z0 || 0.55;
    // photo view: the real camera, pulled back so the whole image plane fits the viewport
    const imgH = (L.height / K.fy) * z0, imgW = (L.width / K.fx) * z0;
    const camDist = Math.max(imgH / 2 / tf, imgW / 2 / (tf * aspect)) * o.flatFill;
    const centreUV = st.F.toW([((L.width / 2 - K.cx) / K.fx) * z0, ((L.height / 2 - K.cy) / K.fy) * z0, z0]);
    const centreW = add(centreUV, mul(st.F.toW(c.origin), -1));
    const eye0 = sub(centreW, mul(cam.fwd, camDist));
    let T1, eye1;
    if (o.anchor) {
      // the real camera's direction in the table frame (orbitEye convention), turned by (yaw, pitch)
      const f = cam.fwd, p0 = Math.asin(clamp(-f[1], -1, 1)) / D2R, y0 = Math.atan2(-f[0], -f[2]) / D2R;
      st.pitchBase = p0 + o.pitch;
      T1 = centreW; eye1 = orbitEye(T1, (camDist * o.dolly) / st.zoom, y0 + yaw, p0 + pitch);
      // how far the view has turned from the real camera: the flat stand-ins fade out between 14 and 32 degrees
      const off = Math.acos(clamp(-dot(norm(sub(eye1, T1)), f), -1, 1)) / D2R;
      st.imp = 1 - smooth(14, 32, off);
    } else {
      T1 = st.fit.T; eye1 = orbitEye(T1, st.fit.dist / st.zoom, yaw, pitch);
    }
    const m = st.morph, k = easeInOut(clamp(m));
    const eye = mix3(eye0, eye1, k), T = mix3(centreW, T1, k), up = norm(mix3(cam.up, [0, 1, 0], k));
    const V = lookAt(eye, T, up);
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);   // premultiplied "over" (stand-ins fade over the background)
    gl.useProgram(prog);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(U.uVid, 0);
    gl.uniform4f(U.uK, K.fx, K.fy, K.cx, K.cy);
    gl.uniform4f(U.uZ, c.zn, c.zf, L.codeLo, L.codeHi);
    const s = o.stride;
    gl.uniform3i(U.uGrid, Math.floor(L.width / s), s, L.depthTop);
    gl.uniformMatrix4fv(U.uModel, false, st.F.M);
    gl.uniformMatrix4fv(U.uView, false, V);
    gl.uniformMatrix4fv(U.uProj, false, perspective(fy, aspect, 0.02, 30));
    gl.uniform1f(U.uMorph, m); gl.uniform1f(U.uZ0, z0); gl.uniform1f(U.uColor, st.color);
    gl.uniform1f(U.uSize, o.size * (s > 1 ? 1.08 : 1)); gl.uniform1f(U.uFpx, H / (2 * tf)); gl.uniform1f(U.uDpr, dpr);
    gl.uniform1f(U.uShade, o.shade); gl.uniform1f(U.uFade, st.fade);
    gl.uniform3fv(U.uLo, c.box.lo); gl.uniform3fv(U.uHi, c.box.hi);
    gl.uniform3fv(U.uLight, norm([0.35, 0.85, 0.45]));
    gl.uniform4fv(U.uPlane, c.plane || [0, 0, -1, 1]);
    gl.uniform3f(U.uEnc, c.enc === "plane" ? 1 : 0, c.rmax || 0.6, c.bias || 0);
    gl.uniform3fv(U.uEye, eye);
    gl.uniform2f(U.uFine, L.fineTop || 0, L.fineTop ? (c.period || 0) : 0);
    st.tint += ((st.tintTo ?? 0) - st.tint) * Math.min(1, dt * 5);
    gl.uniform1f(U.uTint, st.tint);
    gl.uniform1f(U.uSplit, st.split);
    gl.uniform1f(U.uImp, o.anchor ? st.imp : 0);
    gl.uniform1f(U.uGain, o.gain);
    gl.uniform3fv(U.uBgCol, o.stage);
    // edge fade (free orbit only: anchored, the view stays inside the camera's own frame)
    const fb = o.anchor ? [9, 9, 0, 1] : c.fade || [0.5, 0.3, -0.05, 0.12];
    gl.uniform4f(U.uFadeBox, fb[0], fb[1], fb[2], fb[3]);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, bgTex); gl.uniform1i(U.uBg, 1);
    gl.bindVertexArray(vao);
    const count = Math.floor(L.width / s) * Math.floor(L.height / s);
    if (o.anchor && bgFor === c && m > 0.5) { gl.uniform1i(U.uPass, 2); gl.drawArrays(gl.POINTS, 0, count); }
    if (bgFor === c && m > 0.35) { gl.uniform1i(U.uPass, 0); gl.drawArrays(gl.POINTS, 0, count); }
    gl.uniform1i(U.uPass, 1);
    gl.drawArrays(gl.POINTS, 0, count);
    gl.bindVertexArray(null);
  }
  st.raf = requestAnimationFrame(frame);

  // interaction: drag to orbit, double-click to reset
  canvas.addEventListener("pointerdown", (e) => {
    if (!o.interactive) return;
    st.drag = { x: e.clientX, y: e.clientY, yaw: st.userYaw, pitch: st.userPitch }; canvas.setPointerCapture(e.pointerId);
    if (st.intro) { st.intro = false; }
    if (o.liftOnDrag) st.flatTo = 0;
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!st.drag) return;
    // total elevation stays between a grazing and a top-down view; anchored, the view also stays on the camera's side
    const [lo, hi] = o.anchor ? [10, 84] : [4, 62];
    st.userYaw = st.drag.yaw - (e.clientX - st.drag.x) * 0.32;
    if (o.anchor) st.userYaw = clamp(st.userYaw, -70 - o.yaw, 70 - o.yaw);
    st.userPitch = clamp(st.drag.pitch + (e.clientY - st.drag.y) * 0.22, lo - st.pitchBase, hi - st.pitchBase);
    st.idle = 0;
  });
  const end = () => { st.drag = null; };
  canvas.addEventListener("pointerup", end); canvas.addEventListener("pointercancel", end);
  canvas.addEventListener("dblclick", () => { if (o.interactive) { st.userYaw = 0; st.userPitch = 0; } });
  const io = new IntersectionObserver((e) => {
    st.visible = e[e.length - 1].isIntersecting;   // entries arrive oldest first: the last one is the current state
    if (!st.visible) video.pause(); else if (st.playing && !st.userPaused) play();
  }, { threshold: 0 });
  io.observe(canvas);
  document.addEventListener("visibilitychange", () => { if (document.hidden) video.pause(); else if (st.playing && st.visible) play(); });

  // CPU-side read of one pixel's 3D point from the current frame (for hover readouts)
  const probe = document.createElement("canvas"); probe.width = 1; probe.height = 3;
  const pctx = probe.getContext("2d", { willReadFrequently: true });
  function sample(u, v) {
    const c = st.clip;
    if (!c || video.readyState < 2) return null;
    u = clamp(Math.floor(u), 0, L.width - 1); v = clamp(Math.floor(v), 0, L.height - 1);
    const rows = [v + L.depthTop, v + (L.fineTop || L.depthTop)];
    const lum = rows.map((y, k) => { pctx.drawImage(video, u, y, 1, 1, 0, k, 1, 1); const d = pctx.getImageData(0, k, 1, 1).data; return 0.2126 * d[0] + 0.7152 * d[1] + 0.0722 * d[2]; });
    let code = lum[0];
    if (code < L.codeLo - 6) return null;
    if (L.fineTop && c.period) {
      const f = clamp((lum[1] - L.codeLo) / (L.codeHi - L.codeLo)), ua = (code - L.codeLo) / c.period, b = Math.floor(ua / 2) * 2;
      const cand = [b - 1 + f, b + 1 - f, b + 1 + f, b + 3 - f];
      code = L.codeLo + cand.reduce((x, y) => (Math.abs(y - ua) < Math.abs(x - ua) ? y : x)) * c.period;
    }
    const t = clamp((code - L.codeLo) / (L.codeHi - L.codeLo)), K = c.K;
    const r = [(u + 0.5 - K.cx) / K.fx, (v + 0.5 - K.cy) / K.fy, 1];
    let Z;
    if (c.enc === "plane") { const pl = c.plane, zp = -pl[3] / (pl[0] * r[0] + pl[1] * r[1] + pl[2]); Z = zp - (t * t * c.rmax - c.bias); }
    else Z = c.zn + t * (c.zf - c.zn);
    return { X: r[0] * Z, Y: r[1] * Z, Z };
  }

  await setClip(o.clip || meta.clips[0].id);
  return {
    ok: true, video, meta, sample,
    get ready() { return st.ready; },
    get morph() { return st.morph; },
    setSplit(x) { st.split = x == null ? -1 : x; },
    setInteractive(on) { o.interactive = on; if (!on) st.drag = null; },
    get clip() { return st.clip.id; },
    get playing() { return st.playing; },
    setClip: (id, opt = {}) => setClip(id, { intro: !!opt.intro }),
    setColor(mode) { st.colorTo = mode === "xyz" ? 1 : 0; st.tintTo = mode === "height" ? 1 : 0; },
    setFlat(on, now = false) { st.flatTo = on ? 1 : 0; if (st.intro) st.intro = false; if (now) st.morph = on ? 0 : 1; },
    play() { st.userPaused = false; play(); },
    pause() { st.userPaused = true; pause(); },
    toggle() { if (!st.playing) { st.userPaused = false; play(); } else { st.userPaused = true; pause(); } },
    seek(t) { video.currentTime = clamp(t, 0, video.duration || 0); },
    replay() { if (!reducedMotion()) { st.intro = true; st.introT = 0; st.morph = 0; st.userYaw = 0; st.userPitch = 0; } },
    dispose() { cancelAnimationFrame(st.raf); io.disconnect(); video.pause(); video.removeAttribute("src"); },
  };
}

// Without WebGL 2: show the clip's RGB half as a plain looping video.
function fallback(canvas, video, meta, o) {
  const c = meta.clips.find((x) => x.id === o.clip) || meta.clips[0];
  const wrap = document.createElement("div");
  wrap.className = "pm4d-fallback";
  video.src = BASE + c.src; video.poster = BASE + c.poster; video.loop = true;
  wrap.append(video);
  canvas.replaceWith(wrap);
  video.play().catch(() => {});
  requestAnimationFrame(() => o.onReady?.());
  return { ok: false, video, meta, el: wrap, sample: () => null, ready: true, morph: 1, setSplit() {}, setInteractive() {},
    get clip() { return c.id; }, get playing() { return !video.paused; },
    setClip(id) { const n = meta.clips.find((x) => x.id === id); if (n) { video.src = BASE + n.src; video.poster = BASE + n.poster; video.play().catch(() => {}); } },
    setColor() {}, setFlat() {},
    play() { video.play().catch(() => {}); }, pause() { video.pause(); }, toggle() { video.paused ? video.play().catch(() => {}) : video.pause(); }, seek(t) { video.currentTime = t; }, replay() {}, dispose() {} };
}
