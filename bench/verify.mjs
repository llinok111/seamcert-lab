// G4: real assertions, real numbers. Exit 0 only if every check passes.
import { certifyScene, seamGap, seamPolyline, samplingGap, seamGapAtScale, seamList, tileStats, stitch, height, DOMAIN, TILES } from '../src/core.mjs';
import { buildDataset } from '../tools/gen-sample.mjs';
import { naiveLodSeams, visualCheck, curvatureBound } from '../baseline/naive.mjs';

let passed = 0;
let failed = 0;
const lines = [];
function check(name, cond, detail) {
  if (cond) { passed++; lines.push(`PASS ${name}${detail ? ' :: ' + detail : ''}`); }
  else { failed++; lines.push(`FAIL ${name}${detail ? ' :: ' + detail : ''}`); }
}

const ds = buildDataset();
const byName = Object.fromEntries(ds.scenes.map((s) => [s.name, s]));
const fine = certifyScene(byName['uniform-fine']);
const dist = certifyScene(byName['dist-lod']);
const checker = certifyScene(byName['checker-lod']);

// --- 1. uniform terrain: no seam, zero gap, exact closure trivially
check('uniform-fine maxGap === 0', fine.maxGap === 0, `maxGap=${fine.maxGap}`);
check('uniform-fine mixedSeams === 0', fine.mixedSeams === 0, `mixed=${fine.mixedSeams}/${fine.seams}`);
check('uniform-fine all seams closed', fine.closedExactly === fine.seams, `${fine.closedExactly}/${fine.seams}`);

// --- 2. distance LOD: real cracks exist, and the stitched row closes every one exactly
check('dist-lod has mixed seams', dist.mixedSeams > 0, `mixed=${dist.mixedSeams}/${dist.seams}`);
check('dist-lod maxGap > 0', dist.maxGap > 0, `maxGap=${dist.maxGap.toExponential(6)} at t=${dist.worst.argT}`);
check('dist-lod closure is exact (=== 0)', dist.perSeam.every((s) => s.stitchedGap === 0), `closed=${dist.closedExactly}/${dist.seams}`);
const worstSeam = dist.worst;
check('worst seam is a mixed seam', worstSeam.a.level !== worstSeam.b.level,
  `levels ${worstSeam.a.level} vs ${worstSeam.b.level} on ${worstSeam.axis}=${worstSeam.coord}`);

// --- 3. exactness: the maximum sits at a fine knot, between any uniform sample grid
const wpa = seamPolyline(worstSeam.a.level, worstSeam.axis, worstSeam.coord, worstSeam.from, worstSeam.to);
const wpb = seamPolyline(worstSeam.b.level, worstSeam.axis, worstSeam.coord, worstSeam.from, worstSeam.to);
const wExact = seamGap(wpa, wpb);
const wSample = samplingGap(wpa, wpb, 1001);
check('exact gap >= 1001-sample gap', wExact.maxGap >= wSample.maxGap,
  `exact=${wExact.maxGap.toFixed(9)} sampled=${wSample.maxGap.toFixed(9)} (${((1 - wSample.maxGap / wExact.maxGap) * 100).toFixed(3)}% missed)`);
const wSparse = samplingGap(wpa, wpb, 50);
check('a 50-probe checker misses the peak', wSparse.maxGap < wExact.maxGap,
  `sparse=${wSparse.maxGap.toFixed(9)} exact=${wExact.maxGap.toFixed(9)} missed=${((1 - wSparse.maxGap / wExact.maxGap) * 100).toFixed(3)}%`);
check('exact >= sampled for every probe count tried', [17, 50, 64, 401, 1009].every((k) => samplingGap(wpa, wpb, k).maxGap <= wExact.maxGap),
  'no probe grid can exceed the exact maximum');
check('affected measure > 0 on the worst seam', wExact.affectedFraction > 0,
  `affected=${(wExact.affectedFraction * 100).toFixed(2)}% of the seam`);

// --- 4. the naive "does it look cracked?" gate
const naive = naiveLodSeams(byName['dist-lod']);
check('baseline naive LOD leaves every mixed seam open', naive.openSeams === naive.seams,
  `open=${naive.openSeams}/${naive.seams}, maxGap=${naive.maxGap.toFixed(6)}`);
const vis = visualCheck(byName['dist-lod'], 0.12);
check('a 0.12-tolerance visual gate greenlights the cracked terrain', vis.pass === true,
  `gate maxGap=${vis.maxGap.toFixed(6)} tol=${vis.tol}`);

// --- 5. analytic curvature bound: measured gap <= C * (coarse spacing)^2 / 8 (with slack disclosed)
const coarseN = Math.min(worstSeam.a.level, worstSeam.b.level);
const du = (worstSeam.to - worstSeam.from) / Math.pow(2, coarseN);
const bound = (curvatureBound(worstSeam.axis) * du * du) / 8;
check('measured gap within 1.3x of the curvature bound', wExact.maxGap <= 1.3 * bound,
  `measured=${wExact.maxGap.toExponential(6)} bound=${bound.toExponential(6)} ratio=${(wExact.maxGap / bound).toFixed(4)}`);

// --- 6. scale invariance 1e-6 .. 1e6: gap scales exactly, closure stays exact
const scales = [1e-6, 1e-3, 1, 1e3, 1e6];
const sRows = [];
for (const s of scales) {
  const g = seamGapAtScale(worstSeam, s);
  const ratio = g.maxGap / (s * wExact.maxGap);
  sRows.push({ s, gap: g.maxGap, ratio });
  check(`scale ${s}: gap ratio === 1`, Math.abs(ratio - 1) < 1e-12, `ratio=${ratio.toFixed(15)}`);
}
check('closure is exact at every scale', (() => {
  for (const s of scales) {
    const mk = (level) => {
      const n = 1 << level;
      const hs = [];
      for (let i = 0; i <= n; i++) {
        const u = ((worstSeam.from + ((worstSeam.to - worstSeam.from) * i) / n)) * s;
        hs.push((worstSeam.axis === 'x' ? height(worstSeam.coord * s, u) : height(u, worstSeam.coord * s)) * s);
      }
      return { n, hs };
    };
    const lvA = worstSeam.a.level, lvB = worstSeam.b.level;
    const pa = mk(lvA), pb = mk(lvB);
    const fineP = pa.n >= pb.n ? pa : pb, coarseP = pa.n >= pb.n ? pb : pa;
    const st = stitch(fineP, coarseP);
    if (seamGap(st.polyline, fineP).maxGap !== 0) return false;
  }
  return true;
})(), `5 scales 1e-6..1e6, stitched gap === 0 at each`);

// --- 7. checker LOD is worse than distance LOD, and costs more vertices to close
check('checker-lod gap > dist-lod gap', checker.maxGap > dist.maxGap,
  `checker=${checker.maxGap.toFixed(6)} vs dist=${dist.maxGap.toFixed(6)}`);
check('checker-lod needs more added vertices', checker.addedVertices > dist.addedVertices,
  `checker=${checker.addedVertices} vs dist=${dist.addedVertices}`);

// --- 8. cost accounting is consistent
const summed = dist.perSeam.reduce((s, x) => s + x.addedVertices, 0);
check('addedVertices equals the per-seam sum', summed === dist.addedVertices, `sum=${summed} total=${dist.addedVertices}`);
check('vertex overhead stays under 15% of the tile grid', dist.vertexOverhead < 0.15,
  `added=${dist.addedVertices} tiles=${dist.tileVertices} overhead=${(dist.vertexOverhead * 100).toFixed(2)}%`);

// --- 9. determinism and tile cost formulas
check('dataset is byte-deterministic in-process', JSON.stringify(buildDataset()) === JSON.stringify(ds), 'two builds identical');
check('tileStats(4) = 289 vertices / 512 triangles',
  tileStats(4).vertices === 289 && tileStats(4).triangles === 512,
  `${tileStats(4).vertices}/${tileStats(4).triangles}`);
check('seam geometry matches tile layout', seamList(byName['dist-lod']).length === 2 * TILES * (TILES - 1),
  `seams=${seamList(byName['dist-lod']).length} domain=${DOMAIN}`);

console.log(lines.join('\n'));
console.log(`\nRESULT ${failed === 0 ? 'PASS' : 'FAIL'}: ${passed} passed / ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
