// Minimal CPU rasterizer: z-buffered, flat/vertex-normal shaded, orthographic.
// Purpose: let us SEE the procedural car geometry without a GPU.
import { writeFileSync } from 'fs';
import { deflateSync } from 'zlib';

export function writePNG(path, w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy ? rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4)
             : Buffer.from(rgba.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  const chunks = [];
  const crcTable = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
  const crc32 = (buf) => { let c = -1; for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const t = Buffer.from(type, 'ascii');
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
    return Buffer.concat([len, t, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  chunks.push(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)));
  writeFileSync(path, Buffer.concat(chunks));
}

// Collect world-space triangles {a,b,c,na,nb,nc,color} from a three.js Object3D
export function collectTris(root, THREE) {
  const tris = [];
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    const g = o.geometry;
    if (!g || !g.attributes || !g.attributes.position) return;
    const pos = g.attributes.position;
    const idx = g.index;
    const matArr = Array.isArray(o.material) ? o.material : [o.material];
    const readMat = (mi) => {
      const mat = matArr[Math.min(mi, matArr.length - 1)] || matArr[0];
      const color = mat && mat.color ? [mat.color.r, mat.color.g, mat.color.b] : [0.6, 0.62, 0.65];
      return {
        color,
        metal: mat && mat.metalness !== undefined ? mat.metalness : 0,
        rough: mat && mat.roughness !== undefined ? mat.roughness : 0.6,
        emis: mat && mat.emissive ? [mat.emissive.r, mat.emissive.g, mat.emissive.b] : [0, 0, 0],
        opac: mat && mat.transparent ? mat.opacity : 1,
      };
    };
    // Per-index material slot, resolved from geometry groups.
    const slots = [];
    const groupsList = g.groups && g.groups.length ? g.groups : [{ start: 0, count: idx ? idx.count : pos.count, materialIndex: 0 }];
    for (const grp of groupsList) for (let k = 0; k < grp.count; k++) slots.push(grp.materialIndex);
    const v = new THREE.Vector3();
    const m = o.matrixWorld;
    const nm = new THREE.Matrix3().getNormalMatrix(m);
    const count = idx ? idx.count : pos.count;
    const P = [], N = [];
    const getV = (i) => { v.fromBufferAttribute(pos, i).applyMatrix4(m); return v.clone(); };
    const getN = (i) => { const n = new THREE.Vector3().fromBufferAttribute(g.attributes.normal || pos, i); if (g.attributes.normal) n.applyMatrix3(nm).normalize(); return n; };
    for (let t = 0; t < count; t += 3) {
      const i0 = idx ? idx.getX(t) : t, i1 = idx ? idx.getX(t + 1) : t + 1, i2 = idx ? idx.getX(t + 2) : t + 2;
      const a = getV(i0), b = getV(i1), c = getV(i2);
      const na = getN(i0), nb = getN(i1), nc = getN(i2);
      // face normal from winding (more robust than stored normals)
      const fn = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
      const mm = readMat(slots[t] ?? 0);
      if (mm.opac < 0.35) { continue; }
      // Darken glass a little so it reads as an aperture in a flat-shaded preview.
      const isGlass = mm.opac < 0.85 && mm.color[0] < 0.25;
      const col = isGlass ? [mm.color[0] * 0.9 + 0.02, mm.color[1] * 0.95 + 0.03, mm.color[2] * 1.1 + 0.05] : mm.color;
      tris.push({ a, b, c, na, nb, nc, fn, color: col, metal: mm.metal, rough: isGlass ? 0.06 : mm.rough, emis: mm.emis, opac: mm.opac });
    }
  });
  return tris;
}

// Orthographic camera with an explicit basis: `dir` points FROM the subject
// TOWARD the camera, so (1,0,0) shows the right flank and (1,0.4,1) is a
// three-quarter view from the front-right-above.
const VIEWS = {
  side:  [1, 0, 0],     // right profile
  left:  [-1, 0, 0],
  front: [0, 0, 1],     // looking at the nose
  rear:  [0, 0, -1],
  top:   [0, 1, 0.0001],
  q34:   [0.86, 0.42, 0.86],
  qrear: [-0.8, 0.35, -0.9],
  qfront:[0.55, 0.18, 0.95],
};

export function renderView(tris, opts) {
  const { width = 900, height = 560, view = 'side', zoom = 1, bg = [0.09, 0.1, 0.12],
          fovWorld = 6.2, camY = 0, dirOverride = null } = opts;
  const zbuf = new Float32Array(width * height).fill(-1e9);
  const buf = new Float32Array(width * height * 3);
  for (let i = 0; i < width * height; i++) { buf[i * 3] = bg[0]; buf[i * 3 + 1] = bg[1]; buf[i * 3 + 2] = bg[2]; }

  const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map(x => x / l); };
  const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  const dot = (a, b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];

  const d = norm(dirOverride || VIEWS[view] || VIEWS.side);
  const worldUp = Math.abs(d[1]) > 0.95 ? [0, 0, 1] : [0, 1, 0];
  const right = norm(cross(worldUp, d));      // screen +X
  const up = cross(d, right);                 // screen +Y

  // Fit the subject: use the projected bounding box of the triangle set.
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (const t of tris) {
    for (const v of [t.a, t.b, t.c]) {
      const sx = dot([v.x, v.y - camY, v.z], right);
      const sy = dot([v.x, v.y - camY, v.z], up);
      if (sx < minX) minX = sx; if (sx > maxX) maxX = sx;
      if (sy < minY) minY = sy; if (sy > maxY) maxY = sy;
    }
  }
  const spanX = Math.max(1e-3, maxX - minX), spanY = Math.max(1e-3, maxY - minY);
  const fitScale = Math.min(width / (spanX * 1.12), height / (spanY * 1.32));
  const scale = (opts.autofit === false ? Math.min(width, height) / fovWorld : fitScale) * zoom;
  const centre = opts.autofit === false ? [0, 0] : [(minX + maxX) / 2, (minY + maxY) / 2];
  const cx = width / 2, cy = height / 2;
  const lightDir = norm([-0.42, 0.86, 0.32]);

  const proj = (v) => [
    cx + (dot([v.x, v.y - camY, v.z], right) - centre[0]) * scale,
    cy - (dot([v.x, v.y - camY, v.z], up) - centre[1]) * scale,
    dot([v.x, v.y, v.z], d),
  ];
  // World normal from camera-space normal.
  const toWorld = (n) => [
    n[0] * right[0] + n[1] * up[0] + n[2] * d[0],
    n[0] * right[1] + n[1] * up[1] + n[2] * d[1],
    n[0] * right[2] + n[1] * up[2] + n[2] * d[2],
  ];

  for (const t of tris) {
    if (t.opac < 0.4) continue;
    const pa = proj(t.a), pb = proj(t.b), pc = proj(t.c);
    const minX = Math.max(0, Math.floor(Math.min(pa[0], pb[0], pc[0])));
    const maxX = Math.min(width - 1, Math.ceil(Math.max(pa[0], pb[0], pc[0])));
    const minY = Math.max(0, Math.floor(Math.min(pa[1], pb[1], pc[1])));
    const maxY = Math.min(height - 1, Math.ceil(Math.max(pa[1], pb[1], pc[1])));
    if (minX > maxX || minY > maxY) continue;
    const area = (pb[0] - pa[0]) * (pc[1] - pa[1]) - (pc[0] - pa[0]) * (pb[1] - pa[1]);
    if (Math.abs(area) < 1e-9) continue;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5, py = y + 0.5;
        const l0 = ((pb[0] - px) * (pc[1] - py) - (pc[0] - px) * (pb[1] - py)) / area;
        const l1 = ((pc[0] - px) * (pa[1] - py) - (pa[0] - px) * (pc[1] - py)) / area;
        const l2 = 1 - l0 - l1;
        if (l0 < -0.0002 || l1 < -0.0002 || l2 < -0.0002) continue;
        const depth = l0 * pa[2] + l1 * pb[2] + l2 * pc[2];
        const di = y * width + x;
        if (depth <= zbuf[di]) continue;
        zbuf[di] = depth;

        const n = [
          l0 * t.na.x + l1 * t.nb.x + l2 * t.nc.x,
          l0 * t.na.y + l1 * t.nb.y + l2 * t.nc.y,
          l0 * t.na.z + l1 * t.nb.z + l2 * t.nc.z,
        ];
        const nl = Math.hypot(n[0], n[1], n[2]) || 1;
        const wn = toWorld([n[0] / nl, n[1] / nl, n[2] / nl]);
        // Face the viewer.
        if (dot(wn, d) < 0) { wn[0] *= -1; wn[1] *= -1; wn[2] *= -1; }

        let ndl = dot(wn, lightDir);
        if (ndl < 0) ndl = 0;
        const hemi = 0.5 + 0.5 * wn[1];
        const viewF = Math.max(0, dot(wn, d));
        const fres = Math.pow(1 - viewF, 4.2);
        const sky = 0.26 + 0.30 * hemi;
        const shin = 2 / Math.max(0.015, t.rough * t.rough) - 2;
        const specPow = Math.pow(Math.max(0, ndl), Math.min(4096, shin + 8));
        const spec = (specPow * Math.min(60, (shin + 8) / 8)) * (1 - t.rough) * 0.22
                   + fres * (0.18 + t.metal * 0.55) * (1 - t.rough * 0.7);
        const k = ndl * 0.74 + sky * 0.85;
        for (let ch = 0; ch < 3; ch++) {
          let v2 = t.color[ch] * k * (1 - t.metal * 0.5)
                 + spec * (0.6 + t.color[ch] * 0.75)
                 + t.emis[ch] * 0.9;
          v2 = v2 / (v2 + 0.74) * 1.34;
          buf[di * 3 + ch] = Math.pow(Math.max(0, Math.min(1, v2)), 0.4545);
        }
      }
    }
  }
  const out = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    out[i * 4] = Math.min(255, Math.max(0, Math.round(buf[i * 3] * 255)));
    out[i * 4 + 1] = Math.min(255, Math.max(0, Math.round(buf[i * 3 + 1] * 255)));
    out[i * 4 + 2] = Math.min(255, Math.max(0, Math.round(buf[i * 3 + 2] * 255)));
    out[i * 4 + 3] = 255;
  }
  return { buf: out, width, height };
}
