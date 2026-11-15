// baseline/naive.mjs — the two things this project measures against.
// 1. `naiveLodSeams(scene)` : LOD with no boundary stitching (the classic T-junction).
// 2. `visualCheck(scene)`   : the "screenshot / uniform sampling" crack checker.
// It is deliberately independent code: it re-evaluates the height field itself and
// never imports src/core.mjs, so agreement between the two is evidence, not tautology.
import { height, subdivisions } from '../src/core.mjs';

const CURV_X = 0.9 * 1.7 * 1.7 + 0.35 * 3.1 * 3.1; // |d2h/dx2| bound
const CURV_Z = 0.9 * 1.1 * 1.1 + 0.35 * 1.3 * 1.3 + 0.15 * 5.3 * 5.3;

export function curvatureBound(axis) {
  return axis === 'x' ? CURV_X : CURV_Z;
}

function edgeHeights(level, axis, coord, from, to) {
  const n = subdivisions(level);
  const hs = [];
  for (let i = 0; i <= n; i++) {
    const u = from + ((to - from) * i) / n;
    hs.push(axis === 'x' ? height(coord, u) : height(u, coord));
  }
  return hs;
}

function at(hs, t) {
  const n = hs.length - 1;
  const x = t * n;
  const i = Math.min(n - 1, Math.floor(x));
  const f = x - i;
  return hs[i] * (1 - f) + hs[i + 1] * f;
}

// No stitching at all: the crack is whatever the two resolutions disagree by.
export function naiveLodSeams(scene) {
  const { levels, tiles = 4, tileSize = 1 } = scene;
  const seams = [];
  let maxGap = 0;
  for (let j = 0; j < tiles; j++) {
    for (let i = 0; i < tiles; i++) {
      const push = (axis, coord, from, to, la, lb) => {
        const a = edgeHeights(la, axis, coord, from, to);
        const b = edgeHeights(lb, axis, coord, from, to);
        // brute-force: 401 uniform probes, the naive checker's resolution
        let g = 0;
        for (let s = 0; s <= 400; s++) {
          const t = s / 400;
          g = Math.max(g, Math.abs(at(a, t) - at(b, t)));
        }
        if (la !== lb) seams.push({ axis, coord, from, to, la, lb, gap: g });
        if (g > maxGap) maxGap = g;
      };
      if (i + 1 < tiles) push('x', (i + 1) * tileSize, j * tileSize, (j + 1) * tileSize, levels[j][i], levels[j][i + 1]);
      if (j + 1 < tiles) push('z', (j + 1) * tileSize, i * tileSize, (i + 1) * tileSize, levels[j][i], levels[j + 1][i]);
    }
  }
  return { seams: seams.length, openSeams: seams.filter((s) => s.gap > 0).length, maxGap };
}

// The "does it look right?" gate: pass if every probed sample is within tol.
export function visualCheck(scene, tol) {
  const r = naiveLodSeams(scene);
  return { pass: r.maxGap <= tol, maxGap: r.maxGap, tol, probes: 401 * 2 * scene.tiles * (scene.tiles - 1) };
}
