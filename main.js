// Viewer only: every number on screen comes from src/core.mjs (the module bench/verify.mjs asserts).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { certifyScene, seamPolyline, stitch, seamGap, lodLevels, uniformLevels, DOMAIN, TILES, TILE_SIZE, height, tileStats } from './src/core.mjs';

const scenes = [
  { name: 'dist-lod', levels: lodLevels({ focus: [1.2, 2.8], maxLevel: 4, falloff: 1.1, minLevel: 1 }) },
  { name: 'checker-lod', levels: Array.from({ length: TILES }, (_, j) => Array.from({ length: TILES }, (_, i) => 1 + ((i + j) % 2) * 2)) },
  { name: 'uniform-fine', levels: uniformLevels(4, TILES) },
].map((s) => ({ ...s, tiles: TILES, tileSize: TILE_SIZE, maxLevel: 4 }));

let sceneIndex = 0;
let stitched = false;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0f14);
scene.fog = new THREE.Fog(0x0b0f14, 7, 16);

const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.05, 80);
camera.position.set(5.2, 3.6, 6.4);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(DOMAIN / 2, 0, DOMAIN / 2);
controls.enableDamping = true;

scene.add(new THREE.HemisphereLight(0xbfd8ff, 0x1a2430, 1.1));
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(4, 8, 3);
scene.add(sun);

const root = new THREE.Group();
scene.add(root);
let current = null;

function vertexColor(y) {
  const t = THREE.MathUtils.clamp((y + 1.6) / 3.2, 0, 1);
  return new THREE.Color().setHSL(0.58 - 0.42 * t, 0.55, 0.28 + 0.34 * t);
}

function buildTile(level, ox, oz) {
  const n = 1 << level;
  const pos = [];
  const col = [];
  const idx = [];
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const x = ox + (i / n) * TILE_SIZE;
      const z = oz + (j / n) * TILE_SIZE;
      const y = height(x, z);
      pos.push(x, y, z);
      const c = vertexColor(y);
      col.push(c.r, c.g, c.b);
    }
  }
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i;
      idx.push(a, a + 1, a + n + 1, a + 1, a + n + 2, a + n + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85, metalness: 0.05, wireframe: false });
  const mesh = new THREE.Mesh(g, m);
  const wire = new THREE.LineSegments(new THREE.WireframeGeometry(g), new THREE.LineBasicMaterial({ color: 0x0d1b26, transparent: true, opacity: 0.55 }));
  const grp = new THREE.Group();
  grp.add(mesh, wire);
  return grp;
}

function polyline(p, color, lift) {
  const pts = [];
  for (let i = 0; i <= p.n; i++) {
    const u = p.from + ((p.to - p.from) * i) / p.n;
    const y = p.hs[i] + lift;
    pts.push(p.axis === 'x' ? new THREE.Vector3(p.coord, y, u) : new THREE.Vector3(u, y, p.coord));
  }
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color, linewidth: 2 }));
  return line;
}

function render() {
  if (current) {
    root.remove(current);
    current.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
  }
  current = new THREE.Group();
  const s = scenes[sceneIndex];
  const cert = certifyScene(s);

  for (let j = 0; j < TILES; j++) {
    for (let i = 0; i < TILES; i++) {
      current.add(buildTile(s.levels[j][i], i * TILE_SIZE, j * TILE_SIZE));
    }
  }

  // Draw both sides of every seam.  When stitching is on, the coarse side is redrawn
  // with the fine knot set — exactly what stitch() does in the certificate.
  const seamObjs = [];
  for (let j = 0; j < TILES; j++) {
    for (let i = 0; i < TILES; i++) {
      const build = (axis, coord, from, to, la, lb) => {
        const A = seamPolyline(la, axis, coord, from, to);
        const B = seamPolyline(lb, axis, coord, from, to);
        const fine = A.n >= B.n ? A : B;
        const coarse = A.n >= B.n ? B : A;
        let gap;
        let shown = coarse;
        if (stitched) {
          const st = stitch(fine, coarse);
          shown = st.polyline;
          gap = seamGap(st.polyline, fine).maxGap;
        } else {
          gap = seamGap(fine, coarse).maxGap;
        }
        seamObjs.push(polyline(fine, 0x7ee0c0, 0.004));
        seamObjs.push(polyline(shown, gap === 0 ? 0x7ee0c0 : 0xff9d7a, 0.008));
      };
      if (i + 1 < TILES) build('x', (i + 1) * TILE_SIZE, j * TILE_SIZE, (j + 1) * TILE_SIZE, s.levels[j][i], s.levels[j][i + 1]);
      if (j + 1 < TILES) build('z', (j + 1) * TILE_SIZE, i * TILE_SIZE, (i + 1) * TILE_SIZE, s.levels[j][i], s.levels[j + 1][i]);
    }
  }
  for (const o of seamObjs) current.add(o);
  root.add(current);

  const tiles = s.levels.flat();
  const verts = tiles.reduce((a, l) => a + tileStats(l).vertices, 0);
  document.getElementById('mode').textContent = `scene ${s.name} · ${stitched ? 'stitched (shared boundary row)' : 'naive LOD (no stitching)'}`;
  document.getElementById('stats').innerHTML =
    `mixed seams: <b>${cert.mixedSeams}/${cert.seams}</b><br>` +
    `max crack (exact): <b class="${cert.maxGap === 0 ? 'ok' : 'bad'}">${cert.maxGap.toFixed(9)}</b><br>` +
    `closed exactly (=== 0): <b class="${cert.closedExactly === cert.seams ? 'ok' : 'bad'}">${cert.closedExactly}/${cert.seams}</b><br>` +
    `tile vertices ${verts} · stitched row +${cert.addedVertices} (${(cert.vertexOverhead * 100).toFixed(2)}%)<br>` +
    `<span style="color:${stitched ? '#7ee0c0' : '#ff9d7a'}">shown: ${stitched ? 'coarse side redrawn at the fine knots → gap 0' : 'coarse side at its own knots → visible crack'}</span>`;
}

document.getElementById('toggle').addEventListener('click', () => { stitched = !stitched; render(); });
document.getElementById('next').addEventListener('click', () => { sceneIndex = (sceneIndex + 1) % scenes.length; render(); });
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

render();
renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
