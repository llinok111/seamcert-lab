// Deterministic sample generator: writes data/terrain.json (no timestamps, no randomness).
import { writeFileSync, mkdirSync } from 'node:fs';
import { lodLevels, uniformLevels, certifyScene } from '../src/core.mjs';

export const MAX_LEVEL = 4;

export function buildDataset() {
  const checker = Array.from({ length: 4 }, (_, j) =>
    Array.from({ length: 4 }, (_, i) => (1 + ((i + j) % 2) * 2)));
  const scenes = [
    { name: 'uniform-fine', tiles: 4, tileSize: 1, maxLevel: MAX_LEVEL, levels: uniformLevels(MAX_LEVEL, 4) },
    { name: 'dist-lod', tiles: 4, tileSize: 1, maxLevel: MAX_LEVEL, levels: lodLevels({ focus: [1.2, 2.8], maxLevel: MAX_LEVEL, falloff: 1.1, minLevel: 1 }) },
    { name: 'checker-lod', tiles: 4, tileSize: 1, maxLevel: MAX_LEVEL, levels: checker },
  ];
  const summary = {};
  for (const s of scenes) {
    const c = certifyScene(s);
    summary[s.name] = { levels: s.levels, seams: c.seams, mixedSeams: c.mixedSeams, maxGap: c.maxGap, addedVertices: c.addedVertices, vertexOverhead: c.vertexOverhead };
  }
  return { domain: 4, tiles: 4, maxLevel: MAX_LEVEL, scenes, summary };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  mkdirSync(new URL('../data/', import.meta.url), { recursive: true });
  const body = JSON.stringify(buildDataset(), null, 2) + '\n';
  writeFileSync(new URL('../data/terrain.json', import.meta.url), body);
  const bytes = Buffer.byteLength(body);
  console.log(`wrote data/terrain.json (${bytes} bytes)`);
}
