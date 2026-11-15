// seamcert-lab core: exact terrain-LOD seam gap measurement + closure certificate.
// Pure ES module: no three.js, no DOM, no file or network I/O, no environment reads.
// Everything here is deterministic double arithmetic; the closure predicate is exact (=== 0).

export const DOMAIN = 4; // terrain spans [0, DOMAIN] x [0, DOMAIN]
export const TILES = 4; // 4 x 4 tiles
export const TILE_SIZE = DOMAIN / TILES;

// Smooth deterministic height field, amplitude ~1.4, C-infinity.
export function height(x, z) {
  return (
    0.9 * Math.sin(1.7 * x + 0.4) * Math.cos(1.1 * z - 0.2) +
    0.35 * Math.sin(3.1 * x - 1.3 * z + 0.7) +
    0.15 * Math.cos(5.3 * z + 0.9)
  );
}

export function subdivisions(level) {
  if (!Number.isInteger(level) || level < 0 || level > 12) {
    throw new RangeError('level must be an integer in [0,12]');
  }
  return 1 << level;
}

// Boundary polyline of one tile edge, canonical orientation: always parameterized
// from the smaller coordinate to the larger one, so the two tiles that share a seam
// produce bit-identical knots and heights for the same level.
// axis 'x': seam is the line x = coord, running in z from `from` to `to`.
// axis 'z': seam is the line z = coord, running in x from `from` to `to`.
export function seamPolyline(level, axis, coord, from, to) {
  const n = subdivisions(level);
  const ts = new Array(n + 1);
  const hs = new Array(n + 1);
  for (let i = 0; i <= n; i++) {
    const u = from + ((to - from) * i) / n;
    ts[i] = ((to - from) * i) / n;
    hs[i] = axis === 'x' ? height(coord, u) : height(u, coord);
  }
  return { axis, coord, from, to, level, n, ts, hs };
}

// Exact max |hA - hB| over the seam.
// Both polylines are piecewise linear in t; the coarse knots are a subset of the
// fine knots (levels are powers of two), so every breakpoint of the difference is a
// fine knot and |difference| is linear between consecutive fine knots.  Therefore
// the maximum over the whole seam is attained at a fine knot: no sampling needed.
export function seamGap(pa, pb) {
  const fine = pa.n >= pb.n ? pa : pb;
  const coarse = pa.n >= pb.n ? pb : pa;
  const n = fine.n;
  const d = new Array(n + 1);
  let maxGap = 0;
  let argT = 0;
  let argIndex = 0;
  for (let i = 0; i <= n; i++) {
    // linear interpolation of the coarse side at t = i/n; when i/n is also a
    // coarse knot this returns that knot value exactly, so a shared knot has d = 0.
    const v = fine.hs[i] - evalPolyline(coarse, i / n);
    d[i] = v;
    const a = Math.abs(v);
    if (a > maxGap) {
      maxGap = a;
      argT = fine.ts ? fine.ts[i] : i / n;
      argIndex = i;
    }
  }
  // measure of { t : d(t) != 0 }: a linear piece is identically zero only when both
  // endpoints are zero, so every other piece contributes its full length.
  let affected = 0;
  for (let i = 0; i < n; i++) {
    if (d[i] !== 0 || d[i + 1] !== 0) affected += 1 / n;
  }
  return {
    maxGap,
    argT,
    argIndex,
    affectedFraction: affected,
    knotCount: n + 1,
    coarseSubdivisions: coarse.n,
    fineSubdivisions: fine.n,
  };
}

// Refine the coarse side to the fine knot set (a shared boundary vertex row, which is
// how real terrain engines close T-junctions) and re-measure.
export function stitch(pFine, pCoarse) {
  const n = pFine.n;
  const hs = new Array(n + 1);
  for (let i = 0; i <= n; i++) hs[i] = pFine.hs[i];
  const addedVertices = n - pCoarse.n;
  const stitched = {
    axis: pCoarse.axis,
    coord: pCoarse.coord,
    from: pCoarse.from,
    to: pCoarse.to,
    level: pCoarse.level,
    n,
    ts: pFine.ts ? pFine.ts.slice() : Array.from({ length: n + 1 }, (_, i) => i / n),
    hs,
  };
  return { polyline: stitched, addedVertices };
}

export function tileStats(level) {
  const n = subdivisions(level);
  return { level, subdivisions: n, vertices: (n + 1) * (n + 1), triangles: 2 * n * n };
}

// LOD level per tile. `focus` is the terrain point the camera cares about; tiles
// further away get fewer subdivisions. Levels are clamped to [minLevel, maxLevel].
export function lodLevels({ tiles = TILES, tileSize = TILE_SIZE, focus = [0, 0], maxLevel = 4, falloff = 1.1, minLevel = 1 } = {}) {
  const levels = [];
  for (let j = 0; j < tiles; j++) {
    const row = [];
    for (let i = 0; i < tiles; i++) {
      const cx = (i + 0.5) * tileSize;
      const cz = (j + 0.5) * tileSize;
      const dist = Math.hypot(cx - focus[0], cz - focus[1]);
      const lvl = maxLevel - Math.floor(dist * falloff);
      row.push(Math.max(minLevel, Math.min(maxLevel, lvl)));
    }
    levels.push(row);
  }
  return levels;
}

export function uniformLevels(level, tiles = TILES) {
  return Array.from({ length: tiles }, () => Array.from({ length: tiles }, () => level));
}

function tileSeam(axis, coord, from, to, a, b) {
  return { axis, coord, from, to, a, b };
}

// All interior seams between 4-neighbour tiles, each listed once.
export function seamList(scene) {
  const { levels, tiles = TILES, tileSize = TILE_SIZE } = scene;
  const out = [];
  for (let j = 0; j < tiles; j++) {
    for (let i = 0; i < tiles; i++) {
      if (i + 1 < tiles) {
        const coord = (i + 1) * tileSize;
        out.push(tileSeam('x', coord, j * tileSize, (j + 1) * tileSize,
          { i, j, level: levels[j][i] }, { i: i + 1, j, level: levels[j][i + 1] }));
      }
      if (j + 1 < tiles) {
        const coord = (j + 1) * tileSize;
        out.push(tileSeam('z', coord, i * tileSize, (i + 1) * tileSize,
          { i, j, level: levels[j][i] }, { i, j: j + 1, level: levels[j + 1][i] }));
      }
    }
  }
  return out;
}

function polyFor(seam, level) {
  return seamPolyline(level, seam.axis, seam.coord, seam.from, seam.to);
}

// Full per-seam certificate: exact naive gap, stitched gap (must be exactly 0),
// affected boundary measure, and the vertex cost of the stitched shared row.
export function certifyScene(scene) {
  const seams = seamList(scene);
  const perSeam = [];
  let maxGap = -Infinity;
  let worst = null;
  let mixed = 0;
  let affectedMeasure = 0;
  let addedVertices = 0;
  let closedExactly = 0;
  for (const seam of seams) {
    const pa = polyFor(seam, seam.a.level);
    const pb = polyFor(seam, seam.b.level);
    const gap = seamGap(pa, pb);
    const fine = pa.n >= pb.n ? pa : pb;
    const coarse = pa.n >= pb.n ? pb : pa;
    const st = stitch(fine, coarse);
    const stitchedGap = seamGap(st.polyline, fine).maxGap;
    if (stitchedGap === 0) closedExactly++;
    if (seam.a.level !== seam.b.level) mixed++;
    affectedMeasure += gap.affectedFraction;
    addedVertices += st.addedVertices;
    if (gap.maxGap > maxGap) {
      maxGap = gap.maxGap;
      worst = {
        axis: seam.axis,
        coord: seam.coord,
        from: seam.from,
        to: seam.to,
        a: seam.a,
        b: seam.b,
        maxGap: gap.maxGap,
        argT: gap.argT,
      };
    }
    perSeam.push({
      axis: seam.axis,
      coord: seam.coord,
      a: seam.a,
      b: seam.b,
      maxGap: gap.maxGap,
      argT: gap.argT,
      affectedFraction: gap.affectedFraction,
      stitchedGap,
      addedVertices: st.addedVertices,
      knotCount: gap.knotCount,
    });
  }
  const tileVerts = scene.levels.flat().reduce((s, l) => s + tileStats(l).vertices, 0);
  const tileTris = scene.levels.flat().reduce((s, l) => s + tileStats(l).triangles, 0);
  const uniformFine = scene.levels.flat().reduce((s, l) => s + (l === scene.maxLevel ? 1 : 0), 0);
  return {
    scene: scene.name,
    perSeam,
    seams: seams.length,
    mixedSeams: mixed,
    maxGap,
    worst,
    affectedMeasure,
    closedExactly,
    addedVertices,
    tileVertices: tileVerts,
    tileTriangles: tileTris,
    vertexOverhead: tileVerts ? addedVertices / tileVerts : 0,
    tilesAtMaxLevel: uniformFine,
  };
}

// Baseline instrument: uniform sampling of the seam at `samples` points, the way a
// visual checker or a screenshot test would look for cracks.  It cannot see a
// maximum that sits between its samples.
export function samplingGap(pa, pb, samples = 1001) {
  const fine = pa.n >= pb.n ? pa : pb;
  const coarse = pa.n >= pb.n ? pb : pa;
  let maxGap = 0;
  let argT = 0;
  for (let s = 0; s < samples; s++) {
    const t = s / (samples - 1);
    const hf = evalPolyline(fine, t);
    const hc = evalPolyline(coarse, t);
    const a = Math.abs(hf - hc);
    if (a > maxGap) {
      maxGap = a;
      argT = t;
    }
  }
  return { maxGap, argT, samples };
}

export function evalPolyline(p, t) {
  const x = t * p.n;
  const i = Math.min(p.n - 1, Math.floor(x));
  const f = x - i;
  return p.hs[i] * (1 - f) + p.hs[i + 1] * f;
}

// Same scene with geometry and heights multiplied by s.  A correct gap instrument
// must return exactly s * gap and must still close every seam.
export function scaleScene(scene, s) {
  return { ...scene, name: `${scene.name}@x${s}`, scale: s };
}

// Uniform scale of the whole terrain (horizontal extent and height amplitude by s):
// the shape is unchanged, so every vertical gap must scale by exactly s and every
// seam must still close exactly.  Positions stay in normalized units; heights scale.
export function seamGapAtScale(seam, scale) {
  const g = (level) => {
    const n = subdivisions(level);
    const hs = new Array(n + 1);
    for (let i = 0; i <= n; i++) {
      const u = seam.from + ((seam.to - seam.from) * i) / n;
      hs[i] = (seam.axis === 'x' ? height(seam.coord, u) : height(u, seam.coord)) * scale;
    }
    return { n, hs, ts: hs.map((_, i) => i / n) };
  };
  return seamGap(g(seam.a.level), g(seam.b.level));
}
