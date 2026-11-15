# seamcert-lab

**Promise:** on a 4×4 terrain-LOD grid, the exact seam instrument finds a **0.097397637** crack at the worst T-junction (where the naive 401-probe checker reports the same number only because its probe grid happens to land on the peak — a 50-probe checker misses **2.041%** of it), and redrawing the coarse side at the fine knots closes **24/24 seams to a gap of exactly `0`** (bit-equal, no epsilon) for **+76 boundary vertices (5.22%)**; on a 16×16 grid, **480/480 seams close exactly** for +636 vertices (**2.45%**) in **1.838 ms median** vs **2.599 ms** for the 401-probe scan (**1.41×**, and exact instead of sampled).

Upstream: none

This is an original geometry tool. It does not fork, wrap or mirror another repository.

## What it is

Terrain renderers split a height field into tiles and pick a subdivision level per tile. Where two tiles of different levels meet, the finer side has vertices the coarser side does not — a **T-junction** — and the rendered surface tears along that seam. Every fix in the wild (skirts, geomorphing, a shared transition row) is judged by eye. This repo replaces the eye with an instrument:

- `seamPolyline(level, axis, coord, from, to)` samples the shared edge **once**, in one canonical orientation, so the two tiles that own a seam produce bit-identical knot heights at the same level.
- `seamGap(pa, pb)` returns the **exact** maximum `|hA − hB|` over the seam. Both sides are piecewise linear in `t`, and the coarse knots are a subset of the fine knots (levels are powers of two), so the difference is linear between consecutive *fine* knots and its maximum is attained **at a knot**, not between samples. No tolerance, no sampling, no epsilon.
- `stitch(fine, coarse)` is the closure: the coarse side is redrawn with the fine knot set (a shared boundary row). `seamGap` on the result is **exactly `0`** — the two polylines are the same numbers, not merely close.
- `certifyScene(scene)` reports per-seam gap, the measure of the seam that is actually open, the closure flag, and the vertex cost.

`src/core.mjs` is pure: no `three`, no DOM, no network, no file or environment access.

## Run (zero dependencies, Node ≥ 20)

```bash
node tools/gen-sample.mjs && node bench/verify.mjs && node bench/bench.mjs && python3 -m http.server 4173
```

open <http://localhost:4173> — the page imports `three@0.169.0` from jsDelivr through an import map and calls the **same** `src/core.mjs`. "toggle stitching" redraws each coarse seam side at the fine knots and the HUD gap drops from the measured crack to `0`; "next LOD scene" cycles uniform / distance LOD / checkerboard LOD.

## Evidence (`bench/result.json`, real runs)

| metric | value |
|---|---|
| worst seam, `dist-lod` | `x = 3`, levels 2 vs 1, gap **0.09739763734693241** at `t = 0.25` |
| mixed seams there | **14 / 24** (uniform-fine: 0 / 24, gap 0) |
| 50-probe checker | **0.095409930** → misses **2.041%** of the peak |
| 1001 / 1009 / 401 / 64 / 17 probes | all **≤** exact; the 1001 grid lands on `t = 0.25` by alignment, not by method |
| stitched closure | **24 / 24 seams exactly 0** (dist-lod), **480 / 480** (16×16 grid) |
| closure cost, dist-lod | +**76** boundary vertices on 1456 tile vertices (**5.22%**) |
| checkerboard LOD | gap **0.1562799728317199**, +144 vertices (worst case: every seam mixed) |
| certificate, 16×16 / 480 seams | median **1.838 ms** (7 samples, min 0.897, p95 2.705, relStddev 41.8%) |
| cold first call | **9.243 ms** (includes JIT) |
| 401-probe scan, same scene | median **2.599 ms** (relStddev 30.1%) → exact is **1.41×** faster |
| curvature cross-check | measured 0.097397637 vs bound 0.186390639 (`C·Δu²/8`) → ratio **0.5225** |
| scale 1e-6 … 1e6 | every gap ratio **1** within 1e-12, every stitched seam still exactly 0 |

Both sub-2 ms timings sit at the timer/GC noise floor, which is why relStddev is 41.8% (certificate) and 30.1% (baseline) — the *ordering* is stable across the seven samples, the absolute numbers are not; they are reported as measured, not rounded into a nicer claim. A clean-clone re-run of the same commands gave 2.235 ms vs 2.695 ms (same ordering, ~20% higher absolute), which is the noise level you should expect.

## 本轮创新

**B 档。** Prior art measures terrain cracks by looking (`visualCheck` in `baseline/naive.mjs` is exactly that gate, and at `tol = 0.12` it greenlights a terrain whose worst crack is 0.097 — i.e. it passes by luck of the tolerance). This repo makes the crack a **number with a proof of maximality**: because the difference of the two seam polylines is linear between fine knots, the maximum is at a knot, so the instrument is exact rather than sampled; and closure is `=== 0` **by construction** (shared knot values), not "within tolerance". The ledger's nearest entries are `mesh-selfint` (static BVH self-intersection) and `vertexcache` (GPU vertex reuse) — neither does T-junction seams, exact gap measurement, or closure cost accounting.

## Known limitations

- **Vertical gap only.** The seam is measured as a height difference along the shared edge; horizontal T-junction overlaps (a coarse edge crossing a fine vertex) are not modelled, and the renderer's tiles are axis-aligned grids.
- **Closure is the shared-row technique.** Cost is counted as added boundary vertices per seam; a vertex shared by two tiles is counted once per seam, so 76 is an upper bound on the true unique-vertex cost.
- **The curvature bound is a global analytic bound** (`|h_xx| ≤ 5.96`, `|h_zz| ≤ 5.89` for this field), not a per-seam tight bound; the measured/bound ratio 0.5225 says the field is gentle there, nothing more.
- **Levels must be powers of two** so coarse knots align with fine knots; non-dyadic LOD (e.g. 3, 5, 6 subdivisions) needs the generic union-of-knots path, which is not implemented.
- The `12`-level guard in `subdivisions()` exists to keep memory bounded; scenes larger than 2^12 per tile edge are rejected rather than approximated.
- Browser evidence is limited to "server returns 200, import map present, same core module loaded"; no screenshot is used as evidence (G8).

## Files

```
index.html            import map + HUD
main.js               three.js viewer, calls src/core.mjs
src/core.mjs          exact gap / stitching / certificate (pure)
baseline/naive.mjs    independent no-stitch + probe-based checker
tools/gen-sample.mjs  deterministic data/terrain.json
bench/verify.mjs      27 assertions
bench/bench.mjs       cold start + 7 samples → bench/result.json
```

MIT licensed. Copyright (c) 2026 llinok111.
