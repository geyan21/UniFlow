// SyncGroup: plays several <video>s on one shared clock.
// - every clip starts at t = 0; a clip that ends early holds its last frame
// - `end` may trim a clip (seconds, in the encoded clip's own time)
// - the group restarts together `loopDelay` seconds after the longest clip ends
// - the clock stalls (and reports loading) while any running clip is buffering; a paused or
//   freshly loaded group reports not-loading, so callers never set the loading state themselves

export class SyncGroup {
  constructor({ loopDelay = 1.6, onTick, onClipState, onLoading, onPlayState } = {}) {
    Object.assign(this, { loopDelay, onTick, onClipState, onLoading, onPlayState });
    this.clips = [];
    this.t = 0;
    this.playing = false;
    this.userPaused = false;
    this.rate = 1;
    this._raf = 0;
    this._last = 0;
    this._loading = false;
    this._tick = this._tick.bind(this);
  }

  setClips(list) {
    this._stopLoop();
    this._setLoading(false);
    for (const c of this.clips) { try { c.v.pause(); } catch (e) { /* ignore */ } }
    this.t = 0;
    this.clips = list.map((c) => ({ v: c.video, end: c.end ?? Infinity, key: c.key, ended: false, error: false }));
    for (const c of this.clips) {
      c.v.muted = true;
      c.v.playbackRate = this.rate;
      c.v.addEventListener("loadedmetadata", () => {
        if (isFinite(c.v.duration)) c.end = Math.min(c.end, c.v.duration);
      }, { once: true });
      c.v.addEventListener("error", () => { c.error = true; }, { once: true });
      if (c.v.preload !== "auto") c.v.preload = "auto";
      if (c.v.dataset.src && !c.v.getAttribute("src")) { c.v.src = c.v.dataset.src; }
    }
    this._emitTick();
    if (this.playing) this._startLoop();
  }

  get duration() {
    const ends = this.clips.filter((c) => !c.error).map((c) => (isFinite(c.end) ? c.end : (c.v.duration || 0)));
    return ends.length ? Math.max(...ends) : 0;
  }

  play() {
    this.userPaused = false;
    if (this.playing) return;
    this.playing = true;
    this._startLoop();
    this.onPlayState?.(true);
  }

  pause(byUser = false) {
    if (byUser) this.userPaused = true;
    if (!this.playing) return;
    this.playing = false;
    this._stopLoop();
    this._setLoading(false);
    for (const c of this.clips) { try { c.v.pause(); } catch (e) { /* ignore */ } }
    this.onPlayState?.(false);
  }

  toggle() { this.playing ? this.pause(true) : this.play(); }

  setRate(r) {
    this.rate = r;
    for (const c of this.clips) c.v.playbackRate = r;
  }

  seek(t) {
    const d = this.duration;
    this.t = Math.max(0, Math.min(t, d));
    for (const c of this.clips) {
      if (c.error) continue;
      const e = isFinite(c.end) ? c.end : c.v.duration || 0;
      const ended = this.t >= e - 0.03;
      this._setTime(c, ended ? Math.max(0, e - 0.05) : this.t);
      if (ended) { try { c.v.pause(); } catch (err) { /* ignore */ } }
      this._setEnded(c, ended);
    }
    this._emitTick();
  }

  restart() {
    this.t = 0;
    for (const c of this.clips) {
      this._setTime(c, 0);
      this._setEnded(c, false);
    }
    this._emitTick();
  }

  destroy() { this.pause(); this.clips = []; }

  // ---- internals
  _setTime(c, t) { try { if (c.v.readyState >= 1) c.v.currentTime = t; } catch (e) { /* ignore */ } }

  _setEnded(c, ended) {
    if (c.ended === ended) return;
    c.ended = ended;
    this.onClipState?.(c, ended);
  }

  _startLoop() {
    if (this._raf) return;
    this._last = performance.now();
    this._raf = requestAnimationFrame(this._tick);
  }

  _stopLoop() { cancelAnimationFrame(this._raf); this._raf = 0; }

  _setLoading(on) {
    if (on === this._loading) return;
    this._loading = on;
    this.onLoading?.(on);
  }

  // the clock keeps running through the loop pause; what is shown never passes the clip length
  _emitTick() { const d = this.duration; this.onTick?.(Math.min(this.t, d), d); }

  _tick(now) {
    this._raf = requestAnimationFrame(this._tick);
    const dt = Math.min(0.1, (now - this._last) / 1000);
    this._last = now;
    if (!this.playing || !this.clips.length) return;
    const active = this.clips.filter((c) => !c.ended && !c.error);
    const stalled = active.some((c) => c.v.readyState < 3);
    if (stalled) {
      this._setLoading(true);
      for (const c of active) if (c.v.readyState >= 1 && !c.v.paused) c.v.pause();
      return;
    }
    this._setLoading(false);
    this.t += dt * this.rate;
    for (const c of this.clips) {
      if (c.error) continue;
      const e = isFinite(c.end) ? c.end : c.v.duration || 0;
      if (!c.ended && this.t >= e - 0.03) {
        try { c.v.pause(); } catch (err) { /* ignore */ }
        if (e < (c.v.duration || Infinity) - 0.1) this._setTime(c, Math.max(0, e - 0.05));
        this._setEnded(c, true);
      } else if (!c.ended) {
        if (c.v.paused) c.v.play().catch(() => {});
        const drift = c.v.currentTime - this.t;
        if (Math.abs(drift) > 0.35) this._setTime(c, this.t);
      }
    }
    if (this.t >= this.duration + this.loopDelay) this.restart();
    this._emitTick();
  }
}

// Scrubber UI bound to a SyncGroup: <div class="scrub"><div class="rail"><div class="fill"><div class="marks"><div class="knob">
export function bindScrubber(el, group, { marks = () => [] } = {}) {
  const fill = el.querySelector(".fill"), knob = el.querySelector(".knob"), mk = el.querySelector(".marks");
  let dragging = false;
  const toT = (ev) => {
    const r = el.getBoundingClientRect();
    return Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)) * group.duration;
  };
  el.addEventListener("pointerdown", (ev) => { dragging = true; el.setPointerCapture(ev.pointerId); group.seek(toT(ev)); });
  el.addEventListener("pointermove", (ev) => { if (dragging) group.seek(toT(ev)); });
  el.addEventListener("pointerup", () => { dragging = false; });
  el.addEventListener("keydown", (ev) => {
    if (ev.key === "ArrowRight") { group.seek(group.t + 1); ev.preventDefault(); }
    if (ev.key === "ArrowLeft") { group.seek(group.t - 1); ev.preventDefault(); }
    if (ev.key === "Home") { group.seek(0); ev.preventDefault(); }
    if (ev.key === "End") { group.seek(group.duration); ev.preventDefault(); }
  });
  const render = (t, d) => {
    const f = d ? Math.min(1, t / d) : 0;
    fill.style.width = `${f * 100}%`;
    knob.style.left = `${f * 100}%`;
    el.setAttribute("aria-valuenow", String(Math.round(f * 100)));
    el.setAttribute("aria-valuetext", `${t.toFixed(1)} of ${d.toFixed(1)} seconds`);
  };
  const renderMarks = () => {
    if (!mk) return;
    mk.replaceChildren();
    const d = group.duration;
    if (!d) return;
    for (const m of marks()) {
      const i = document.createElement("i");
      i.className = "endmark";
      i.style.left = `${Math.min(100, (m.t / d) * 100)}%`;
      i.style.background = m.color;
      mk.append(i);
    }
  };
  return { render, renderMarks };
}
