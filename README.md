# UniFlow — project page

Website for **UniFlow: A Unified Multi-Modal Policy for Robot Manipulation** (CoRL 2026).

Ge Yan, Shun Iwase, Yuzhi Fan, Dieter Fox, Sergey Zakharov, Katherine Liu

- Paper: https://openreview.net/forum?id=o03EddNo6r
- Site: https://geyan21.github.io/UniFlow/

The page is static (HTML/CSS/JS, no build step). Rollout videos are evaluation episodes,
re-encoded at 2× speed. Fonts are self-hosted under the SIL Open Font License (see
`assets/fonts/licenses`).

The 3D views (`assets/js/pm4d.js`) play real YAM head-camera demonstrations as moving point
clouds. Each clip in `assets/pm4d/` is one H.264 video that stacks the RGB stream, a coarse
depth tile and a fine depth tile; the vertex shader back-projects every pixel with the camera
intrinsics. A lossless `*-bg.png` per clip holds a static background (per-pixel far depth and
colour over the clip) that fills in the table behind moving objects. The page's 3D view is
anchored on the head camera (same pose and field of view, then turned a little), so the
lifted cloud starts out as the photo; pixels without stereo depth are drawn flat at the depth
around them while the view stays near the camera. A browser without WebGL 2 falls back to the
RGB stream.
