// src/game/titles/arcfire/aimTable.ts
//
// Baked launch directions for integer aim angles 0..180° (0 = right, 90 =
// straight up, 180 = left) as Q16.16 cos/sin. The shared sim trig table is
// built from the host's floating-point sine at module load, and JS engines are
// not required to round that identically — one off-by-one entry would make a
// browser and the verification server fly different trajectories. So Arcfire
// uses these LITERAL integers instead. Only cos 0..90 is baked; sin and the 91..180 half
// are derived by exact integer symmetry, so the table is symmetric by
// construction.
import type { Fx } from "@/game/sim/types";

// round(cos(d°) × 65536) for d = 0..90
const COS_0_90: readonly number[] = [
  65536, 65526, 65496, 65446, 65376, 65287, 65177, 65048, 64898, 64729,
  64540, 64332, 64104, 63856, 63589, 63303, 62997, 62672, 62328, 61966,
  61584, 61183, 60764, 60326, 59870, 59396, 58903, 58393, 57865, 57319,
  56756, 56175, 55578, 54963, 54332, 53684, 53020, 52339, 51643, 50931,
  50203, 49461, 48703, 47930, 47143, 46341, 45525, 44695, 43852, 42995,
  42126, 41243, 40348, 39441, 38521, 37590, 36647, 35693, 34729, 33754,
  32768, 31772, 30767, 29753, 28729, 27697, 26656, 25607, 24550, 23486,
  22415, 21336, 20252, 19161, 18064, 16962, 15855, 14742, 13626, 12505,
  11380, 10252, 9121, 7987, 6850, 5712, 4572, 3430, 2287, 1144,
  0,
];

const COS = new Int32Array(181);
const SIN = new Int32Array(181);
for (let d = 0; d <= 90; d++) {
  COS[d] = COS_0_90[d];
  SIN[d] = COS_0_90[90 - d];
}
for (let d = 91; d <= 180; d++) {
  COS[d] = -COS[180 - d];
  SIN[d] = SIN[180 - d];
}

const index = (deg: number): number => (deg < 0 ? 0 : deg > 180 ? 180 : deg | 0);

/** Q16.16 cos of an integer aim angle (clamped to 0..180). */
export const aimCos = (deg: number): Fx => COS[index(deg)];

/** Q16.16 sin of an integer aim angle (clamped to 0..180). */
export const aimSin = (deg: number): Fx => SIN[index(deg)];
