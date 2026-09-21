// Original neon-geometric top-down sprite atlas for Circle TD.
// Grayscale on transparent (white cores, light grey structure, cool-grey
// bodies, near-black outlines) so the renderer's per-type tint colors them
// (red-family towers, blue-family creeps) and the bright cores feed the bloom.
// 9 frames in a 3x3 grid of 128px cells. Writes atlas.png + atlas.json.
const { createCanvas } = require("@napi-rs/canvas");
const fs = require("fs");
const path = require("path");

// Run from the repo root: `npm i -D @napi-rs/canvas` then `node scripts/gen-circle-td-sprites.cjs`.
const REPO = process.argv[2] || process.cwd();
const OUT = path.join(REPO, "public/games/circle-td/sprites");
const S = 128, COLS = 3, ROWS = 3;
const cv = createCanvas(S * COLS, S * ROWS);
const g = cv.getContext("2d");
g.lineJoin = "round";
g.lineCap = "round";

// grayscale tones (chosen so multiply-tint stays vivid)
const OUT_LINE = "#2b2b33";
const CORE = "#ffffff";
const LIGHT = "#e7eaf1";
const LIGHT2 = "#c3c8d3";
function bodyGrad(r) {
  const grad = g.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.15, 0, 0, r);
  grad.addColorStop(0, "#c6ccd6");
  grad.addColorStop(0.6, "#9096a1");
  grad.addColorStop(1, "#71767f");
  return grad;
}
function barrelGrad(len) {
  const grad = g.createLinearGradient(-8, 0, 8, 0);
  grad.addColorStop(0, "#9aa0b0".slice(0, 7)); // placeholder-safe; overwritten below
  return grad;
}

function poly(pts, close = true) {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  if (close) g.closePath();
}
function regPoly(n, r, rot = 0) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return pts;
}
function withCell(col, row, fn) {
  g.save();
  g.translate(col * S + S / 2, row * S + S / 2);
  fn();
  g.restore();
}
function glowCore(r) {
  g.save();
  g.shadowColor = "rgba(255,255,255,0.95)";
  g.shadowBlur = r * 1.6;
  g.fillStyle = CORE;
  g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
  g.restore();
}
function rrect(x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, r); }

// vertical barrel gradient (light metal down the length)
function vbar(x, y, w, h, r) {
  const grad = g.createLinearGradient(x, 0, x + w, 0);
  grad.addColorStop(0, "#eef1f7");
  grad.addColorStop(0.5, "#c9ced9");
  grad.addColorStop(1, "#9298a3");
  g.fillStyle = grad;
  g.strokeStyle = OUT_LINE; g.lineWidth = 4;
  rrect(x, y, w, h, r); g.fill(); g.stroke();
}

// ---- TOWERS (row 0-1) ----

// tower-fast: round turret, twin autocannons
function towerFast() {
  g.strokeStyle = OUT_LINE; g.lineWidth = 5;
  g.fillStyle = bodyGrad(38);
  g.beginPath(); g.arc(0, 0, 38, 0, Math.PI * 2); g.fill(); g.stroke();
  vbar(-17, -48, 12, 52, 5);
  vbar(5, -48, 12, 52, 5);
  glowCore(11);
}

// tower-air: hex turret with missile tubes + radar sweep
function towerAir() {
  g.strokeStyle = OUT_LINE; g.lineWidth = 5;
  g.fillStyle = bodyGrad(40);
  poly(regPoly(6, 40, Math.PI / 2)); g.fill(); g.stroke();
  // missile rack
  g.fillStyle = LIGHT2; g.strokeStyle = OUT_LINE; g.lineWidth = 4;
  rrect(-24, -34, 48, 30, 7); g.fill(); g.stroke();
  g.fillStyle = "#3a3a44";
  for (const dx of [-15, -5, 5, 15]) { g.beginPath(); g.arc(dx, -19, 4.5, 0, Math.PI * 2); g.fill(); }
  // radar arc
  g.strokeStyle = LIGHT; g.lineWidth = 4;
  g.beginPath(); g.arc(0, 6, 22, Math.PI * 0.12, Math.PI * 0.88); g.stroke();
  glowCore(9);
}

// tower-slow: pulse/frost emitter, concentric rings
function towerSlow() {
  g.strokeStyle = OUT_LINE; g.lineWidth = 5;
  g.fillStyle = bodyGrad(37);
  g.beginPath(); g.arc(0, 0, 37, 0, Math.PI * 2); g.fill(); g.stroke();
  // spokes
  g.strokeStyle = LIGHT2; g.lineWidth = 5;
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; g.beginPath(); g.moveTo(Math.cos(a) * 12, Math.sin(a) * 12); g.lineTo(Math.cos(a) * 30, Math.sin(a) * 30); g.stroke(); }
  // rings
  g.strokeStyle = "rgba(255,255,255,0.9)"; g.lineWidth = 3.5;
  g.beginPath(); g.arc(0, 0, 24, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = "rgba(255,255,255,0.55)"; g.lineWidth = 3;
  g.beginPath(); g.arc(0, 0, 31, 0, Math.PI * 2); g.stroke();
  glowCore(12);
}

// tower-splash: heavy mortar, open bore
function towerSplash() {
  g.strokeStyle = OUT_LINE; g.lineWidth = 5;
  g.fillStyle = bodyGrad(44);
  rrect(-40, -40, 80, 80, 16); g.fill(); g.stroke();
  // outer muzzle ring
  g.fillStyle = LIGHT2; g.beginPath(); g.arc(0, 0, 27, 0, Math.PI * 2); g.fill(); g.stroke();
  // dark bore
  g.fillStyle = "#33333c"; g.beginPath(); g.arc(0, 0, 15, 0, Math.PI * 2); g.fill();
  // white rim glow
  g.save(); g.shadowColor = "rgba(255,255,255,0.9)"; g.shadowBlur = 12;
  g.strokeStyle = CORE; g.lineWidth = 3.5; g.beginPath(); g.arc(0, 0, 21, 0, Math.PI * 2); g.stroke(); g.restore();
}

// tower-damage: square base, long heavy cannon
function towerDamage() {
  g.strokeStyle = OUT_LINE; g.lineWidth = 5;
  g.fillStyle = bodyGrad(44);
  poly([[-40, -34], [-34, -40], [34, -40], [40, -34], [40, 34], [34, 40], [-34, 40], [-40, 34]]);
  g.fill(); g.stroke();
  // long barrel
  vbar(-12, -52, 24, 66, 7);
  // bore line
  g.strokeStyle = "#3a3a44"; g.lineWidth = 4; g.beginPath(); g.moveTo(0, -46); g.lineTo(0, 8); g.stroke();
  // muzzle tip glow
  g.save(); g.shadowColor = "rgba(255,255,255,0.95)"; g.shadowBlur = 12; g.fillStyle = CORE;
  rrect(-13, -54, 26, 10, 4); g.fill(); g.restore();
}

// ---- CREEPS (row 2 + wrap) ----

// creep-normal: hex drone
function creepNormal() {
  g.strokeStyle = OUT_LINE; g.lineWidth = 6;
  g.fillStyle = bodyGrad(30);
  poly(regPoly(6, 30, Math.PI / 2)); g.fill(); g.stroke();
  glowCore(11);
}

// creep-fast: sleek dart / arrow
function creepFast() {
  g.strokeStyle = OUT_LINE; g.lineWidth = 6;
  const grad = g.createLinearGradient(0, -40, 0, 34);
  grad.addColorStop(0, "#eef1f7"); grad.addColorStop(1, "#8f95a0");
  g.fillStyle = grad;
  poly([[0, -42], [28, 26], [10, 14], [0, 34], [-10, 14], [-28, 26]]);
  g.fill(); g.stroke();
  g.save(); g.shadowColor = "rgba(255,255,255,0.9)"; g.shadowBlur = 10; g.fillStyle = CORE;
  g.beginPath(); g.arc(0, -8, 7, 0, Math.PI * 2); g.fill(); g.restore();
}

// creep-air: top-down aircraft
function creepAir() {
  g.strokeStyle = OUT_LINE; g.lineWidth = 5;
  const grad = g.createLinearGradient(0, -40, 0, 40);
  grad.addColorStop(0, "#e7eaf1"); grad.addColorStop(1, "#969ca7");
  g.fillStyle = grad;
  // wings (swept)
  poly([[0, -6], [44, 20], [44, 30], [0, 16]]); g.fill(); g.stroke();
  poly([[0, -6], [-44, 20], [-44, 30], [0, 16]]); g.fill(); g.stroke();
  // tail
  poly([[0, 24], [16, 40], [16, 46], [0, 40], [-16, 46], [-16, 40]]); g.fill(); g.stroke();
  // fuselage
  g.fillStyle = LIGHT; rrect(-8, -44, 16, 80, 8); g.fill(); g.stroke();
  // cockpit
  g.save(); g.shadowColor = "rgba(255,255,255,0.9)"; g.shadowBlur = 9; g.fillStyle = CORE;
  g.beginPath(); g.arc(0, -22, 6, 0, Math.PI * 2); g.fill(); g.restore();
}

// creep-hard: bulky armored hex
function creepHard() {
  g.strokeStyle = OUT_LINE; g.lineWidth = 9;
  const grad = g.createRadialGradient(-8, -10, 6, 0, 0, 36);
  grad.addColorStop(0, "#aab0bb"); grad.addColorStop(1, "#5f636c");
  g.fillStyle = grad;
  poly(regPoly(6, 35, 0)); g.fill(); g.stroke();
  // plating chevrons
  g.strokeStyle = LIGHT2; g.lineWidth = 5;
  g.beginPath(); g.moveTo(-16, -6); g.lineTo(0, -16); g.lineTo(16, -6); g.stroke();
  g.beginPath(); g.moveTo(-16, 10); g.lineTo(0, 0); g.lineTo(16, 10); g.stroke();
  g.save(); g.shadowColor = "rgba(255,255,255,0.7)"; g.shadowBlur = 8; g.fillStyle = "#dfe3ea";
  g.beginPath(); g.arc(0, 20, 6, 0, Math.PI * 2); g.fill(); g.restore();
}

const cells = [
  ["tower-fast", towerFast], ["tower-air", towerAir], ["tower-slow", towerSlow],
  ["tower-splash", towerSplash], ["tower-damage", towerDamage], ["creep-normal", creepNormal],
  ["creep-fast", creepFast], ["creep-air", creepAir], ["creep-hard", creepHard],
];
const manifest = { width: S * COLS, height: S * ROWS, frames: {} };
cells.forEach(([name, fn], i) => {
  const col = i % COLS, row = (i / COLS) | 0;
  withCell(col, row, fn);
  manifest.frames[name] = { x: col * S, y: row * S, w: S, h: S };
});

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "atlas.png"), cv.toBuffer("image/png"));
fs.writeFileSync(path.join(OUT, "atlas.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log("wrote original atlas", manifest.width + "x" + manifest.height, Object.keys(manifest.frames).join(", "));
