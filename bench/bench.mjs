// G5: cold start + >=5 repeats, median/min/p95/stddev, writes bench/result.json.
import { writeFileSync } from 'node:fs';
import { certifyScene, lodLevels } from '../src/core.mjs';
import { naiveLodSeams } from '../baseline/naive.mjs';

function stats(xs) {
  const sorted = [...xs].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
  const p95 = sorted[Math.min(n - 1, Math.ceil(0.95 * n) - 1)];
  return { samples: n, min: sorted[0], median: sorted[Math.floor(n / 2)], p95, max: sorted[n - 1], mean, stddev: sd, relStddev: mean ? sd / mean : 0 };
}

function timeIt(fn) {
  const t0 = process.hrtime.bigint();
  const out = fn();
  const t1 = process.hrtime.bigint();
  return { ms: Number(t1 - t0) / 1e6, out };
}

const scene = {
  name: 'grid16-lod',
  tiles: 16,
  tileSize: 0.25,
  maxLevel: 5,
  levels: lodLevels({ tiles: 16, tileSize: 0.25, focus: [1.2, 2.8], maxLevel: 5, falloff: 2.2, minLevel: 1 }),
};

const cold = timeIt(() => certifyScene(scene));
const samples = [];
for (let i = 0; i < 7; i++) samples.push(timeIt(() => certifyScene(scene)).ms);
const exact = stats(samples);

const coldNaive = timeIt(() => naiveLodSeams(scene));
const naiveSamples = [];
for (let i = 0; i < 7; i++) naiveSamples.push(timeIt(() => naiveLodSeams(scene)).ms);
const naive = stats(naiveSamples);

const c = cold.out;
const n = coldNaive.out;

const result = {
  generated_by: 'bench/bench.mjs',
  node: process.version,
  scene: { name: scene.name, tiles: scene.tiles, seams: c.seams, mixedSeams: c.mixedSeams },
  certificate: {
    coldMs: cold.ms,
    exactMs: exact,
    maxGap: c.maxGap,
    worst: c.worst,
    closedExactly: c.closedExactly,
    addedVertices: c.addedVertices,
    vertexOverhead: c.vertexOverhead,
    affectedMeasure: c.affectedMeasure,
  },
  baseline_sampling: {
    coldMs: coldNaive.ms,
    exactMs: naive,
    maxGap: n.maxGap,
    openSeams: n.openSeams,
    probesPerSeam: 401,
    speedup: naive.median / exact.median,
  },
};
writeFileSync(new URL('./result.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
