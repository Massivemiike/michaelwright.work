// src/game/runtime/render/webgpu/shaders.ts
//
// Inline WGSL as template-literal strings (no `.wgsl` file imports => no
// Turbopack loader config => `npm run build` stays green with zero config
// change). All geometry is procedural/original (spec §9.4). The Carbon Forge
// palette (spec §D4) is enforced by the renderer feeding palette-sourced
// colors into every uniform/instance; nothing here invents a hue.

// Shared fullscreen-triangle vertex stage. uv is texture-space (y-down).
const FULLSCREEN_VS = /* wgsl */ `
struct VsOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) vi: u32) -> VsOut {
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var o: VsOut;
  let xy = p[vi];
  o.pos = vec4f(xy, 0.0, 1.0);
  o.uv = vec2f((xy.x + 1.0) * 0.5, 1.0 - (xy.y + 1.0) * 0.5);
  return o;
}`;

export const BACKDROP_WGSL = /* wgsl */ `
struct BgColors { center: vec4f, mid: vec4f, edge: vec4f };
@group(0) @binding(0) var<uniform> bg: BgColors;
${FULLSCREEN_VS}
struct FragOut { @location(0) scene: vec4f, @location(1) emit: vec4f };
@fragment fn fs(@location(0) uv: vec2f) -> FragOut {
  let d = clamp(distance(uv, vec2f(0.5, 0.5)) / 0.7071, 0.0, 1.0);
  var c: vec3f;
  if (d < 0.5) { c = mix(bg.center.rgb, bg.mid.rgb, d / 0.5); }
  else { c = mix(bg.mid.rgb, bg.edge.rgb, (d - 0.5) / 0.5); }
  let vig = 1.0 - smoothstep(0.5, 1.0, d) * 0.5; // photographic vignette
  var o: FragOut;
  o.scene = vec4f(c * vig, 1.0);
  o.emit = vec4f(0.0, 0.0, 0.0, 1.0);
  return o;
}`;

export const TRACK_WGSL = /* wgsl */ `
struct Globals { clip: mat4x4f, params: vec4f };
@group(0) @binding(0) var<uniform> g: Globals;
struct VsOut { @builtin(position) pos: vec4f, @location(0) color: vec3f };
@vertex fn vs(@location(0) p: vec2f, @location(1) col: vec3f) -> VsOut {
  var o: VsOut;
  o.pos = g.clip * vec4f(p, 0.0, 1.0);
  o.color = col;
  return o;
}
struct FragOut { @location(0) scene: vec4f, @location(1) emit: vec4f };
@fragment fn fs(in: VsOut) -> FragOut {
  var o: FragOut;
  o.scene = vec4f(in.color, 1.0);
  o.emit = vec4f(0.0, 0.0, 0.0, 1.0);
  return o;
}`;

export const SPRITE_WGSL = /* wgsl */ `
struct Globals { clip: mat4x4f, params: vec4f };
@group(0) @binding(0) var<uniform> g: Globals;
// std430 storage layout (matches pack.ts's 16-float record exactly):
// center(2)+half(2) pack into 16B, then color(16B), params(16B), uv(16B).
// params.x=shape id, .y=emissive, .z=rot(radians), .w=textured flag(0/1).
// uv = u0,v0,u1,v1 atlas rect (0 when untextured).
struct Instance { center: vec2f, half: vec2f, color: vec4f, params: vec4f, uv: vec4f };
@group(0) @binding(1) var<storage, read> instances: array<Instance>;
// Sprite atlas (Phase 1 texture art) + its sampler. Bound to a 1x1 white
// placeholder until the real atlas finishes loading, so SDF sprites (textured
// flag 0) sample nothing meaningful and render exactly as before.
@group(0) @binding(2) var atlasTex: texture_2d<f32>;
@group(0) @binding(3) var atlasSamp: sampler;
struct VsOut {
  @builtin(position) pos: vec4f,
  @location(0) local: vec2f,
  @location(1) color: vec4f,
  @location(2) shape: f32,
  @location(3) emissive: f32,
  @location(4) uvCoord: vec2f,
  @location(5) textured: f32,
};
@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VsOut {
  var corners = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
    vec2f(-1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0));
  let c = corners[vi];
  let inst = instances[ii];
  // params.z is a rotation angle (radians); 0 for every axis-aligned sprite,
  // non-zero only for beams (a thin box oriented tower->creep).
  let off = c * inst.half;
  let rot = inst.params.z;
  let cr = cos(rot);
  let sr = sin(rot);
  let roff = vec2f(off.x * cr - off.y * sr, off.x * sr + off.y * cr);
  let world = inst.center + roff;
  var o: VsOut;
  o.pos = g.clip * vec4f(world, 0.0, 1.0);
  o.local = c;
  o.color = inst.color;
  o.shape = inst.params.x;
  o.emissive = inst.params.y;
  // Per-corner atlas UV: map the quad corner c in [-1,1] to [0,1], then lerp
  // between the frame's (u0,v0) and (u1,v1). Corner (-1,-1) -> (u0,v0), the
  // frame's top-left, which lines up with the quad's up-left corner (y-down
  // stage space) so the sprite is upright, no vertical flip needed.
  o.uvCoord = mix(inst.uv.xy, inst.uv.zw, (c * vec2f(1.0, 1.0) + 1.0) / 2.0);
  o.textured = inst.params.w;
  return o;
}
fn sdCircle(p: vec2f) -> f32 { return length(p) - 1.0; }
fn sdBox(p: vec2f, b: vec2f) -> f32 { let d = abs(p) - b; return length(max(d, vec2f(0.0))) + min(max(d.x, d.y), 0.0); }
fn sdDiamond(p: vec2f) -> f32 { return abs(p.x) + abs(p.y) - 1.0; }
fn sdTriangle(pin: vec2f) -> f32 {
  let k = sqrt(3.0);
  var p = pin;
  p.x = abs(p.x) - 1.0;
  p.y = p.y + 1.0 / k;
  if (p.x + k * p.y > 0.0) { p = vec2f(p.x - k * p.y, -k * p.x - p.y) / 2.0; }
  p.x = p.x - clamp(p.x, -2.0, 0.0);
  return -length(p) * sign(p.y);
}
fn sdHex(pin: vec2f) -> f32 {
  let k = vec3f(-0.8660254, 0.5, 0.5773503);
  var p = abs(pin);
  p = p - 2.0 * min(dot(k.xy, p), 0.0) * k.xy;
  p = p - vec2f(clamp(p.x, -k.z, k.z), 1.0);
  return length(p) * sign(p.y);
}
struct FragOut { @location(0) scene: vec4f, @location(1) emit: vec4f };
@fragment fn fs(in: VsOut) -> FragOut {
  var o: FragOut;
  // Textured path (atlas sprite): sample the frame, tint by in.color, and
  // output premultiplied — texel.a * color.a is the coverage, tint =
  // color.rgb * texel.rgb. Bright sprite parts still feed the bloom target.
  if (in.textured > 0.5) {
    let texel = textureSample(atlasTex, atlasSamp, in.uvCoord);
    let a = texel.a * in.color.a;
    if (a <= 0.0) { discard; }
    let rgb = in.color.rgb * texel.rgb;
    o.scene = vec4f(rgb * a, a);
    o.emit = vec4f(rgb * a * in.emissive, a);
    return o;
  }
  // SDF path (unchanged): procedural shape by shape id.
  let p = in.local;
  let s = in.shape;
  var d: f32;
  if (s < 0.5) { d = sdCircle(p); }
  else if (s < 1.5) { d = sdTriangle(p); }
  else if (s < 2.5) { d = sdDiamond(p); }
  else if (s < 3.5) { d = sdBox(p, vec2f(1.0)); }
  else if (s < 4.5) { d = sdHex(p); }
  else if (s < 5.5) { d = abs(sdCircle(p)) - 0.08; }        // ring
  else { d = abs(sdBox(p, vec2f(1.0))) - 0.08; }            // hollow square
  let aa = fwidth(d) + 1e-4;
  let cov = 1.0 - smoothstep(-aa, aa, d);
  if (cov <= 0.0) { discard; }
  let a = in.color.a * cov;
  o.scene = vec4f(in.color.rgb * a, a);                     // premultiplied
  o.emit = vec4f(in.color.rgb * a * in.emissive, a);        // additive-friendly
  return o;
}`;

export const BLIT_WGSL = /* wgsl */ `
@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var tex: texture_2d<f32>;
${FULLSCREEN_VS}
@fragment fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
  return textureSample(tex, samp, uv);
}`;

export const BLUR_WGSL = /* wgsl */ `
@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var tex: texture_2d<f32>;
struct Blur { dir: vec2f, pad: vec2f };
@group(0) @binding(2) var<uniform> b: Blur;
${FULLSCREEN_VS}
@fragment fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
  // 9-tap gaussian (normalized weights) along b.dir (already texel-scaled).
  let w = array<f32, 5>(0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216);
  var acc = textureSample(tex, samp, uv) * w[0];
  for (var i = 1; i < 5; i = i + 1) {
    let off = b.dir * f32(i);
    acc = acc + textureSample(tex, samp, uv + off) * w[i];
    acc = acc + textureSample(tex, samp, uv - off) * w[i];
  }
  return acc;
}`;

export const COMPOSITE_WGSL = /* wgsl */ `
@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var sceneTex: texture_2d<f32>;
@group(0) @binding(2) var bloomTex: texture_2d<f32>;
${FULLSCREEN_VS}
@fragment fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
  let scene = textureSample(sceneTex, samp, uv).rgb;
  let bloom = textureSample(bloomTex, samp, uv).rgb;
  // Additive bloom kept modest so glows stay within the Carbon Forge palette
  // (spec §D4) rather than blowing highlights to white.
  let c = scene + bloom * 0.55;
  return vec4f(c, 1.0);
}`;
