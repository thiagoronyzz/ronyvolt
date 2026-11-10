// ---------------------------------------------------------------------------
// SCENE RASTERISER — a CPU "camera" for inspecting the game without a GPU.
//
// This is a development tool, not part of the shipped game. It walks a real
// three.js scene graph (the same objects the VelocityEngine builds), projects
// every triangle through a real perspective camera, and shades it with a
// compact physical-ish model: sun N·L with a Lambert + specular split, a sky
// ambient term evaluated from the same atmosphere function the GLSL dome uses,
// fog extinction, and a filmic tonemap. It is obviously not a match for the
// WebGL path (no PMREM, no bloom, no MSAA), but it is faithful enough to answer
// the questions a visual pass asks: is the silhouette right, is the car inside
// or outside the garage, is the horizon where it should be, are the panels
// interpenetrating, does the scene die at 40 m because the fog is wrong.
//
// usage: npx vite-node tools/preview/scene.mjs -- <flags>
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { writePNG } from './raster.mjs';

// --- DOM shim: procedural textures only need a canvas-like object ----------
const mkCtx = () =>
  new Proxy(
    {},
    {
      get: (_t, k) => {
        if (k === 'createImageData') return (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
        if (k === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
        if (k === 'createRadialGradient' || k === 'createLinearGradient')
          return () => ({ addColorStop() {} });
        if (k === 'measureText') return () => ({ width: 10 });
        if (k === 'canvas') return { width: 1, height: 1 };
        return () => {};
      },
      set: () => true,
    }
  );
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: mkCtx, style: {} }) };
globalThis.performance = globalThis.performance || { now: () => Date.now() };
globalThis.window = globalThis.window || { devicePixelRatio: 1, innerWidth: 1280, innerHeight: 720 };

export const V = (x, y, z) => new THREE.Vector3(x, y, z);

// --- geometry harvesting ---------------------------------------------------
export function harvest(root, opts = {}) {
  const { instanced = true, hide = () => false } = opts;
  const tris = [];
  const tmp = new THREE.Vector3();
  root.updateMatrixWorld(true);

  const pushMesh = (geo, matWorld, material, groupsOverride) => {
    const pos = geo.attributes.position;
    if (!pos) return;
    const idx = geo.index;
    const mats = Array.isArray(material) ? material : [material];
    const readMat = (mi) => mats[Math.min(mi, mats.length - 1)] || mats[0];
    const groups = groupsOverride || (geo.groups && geo.groups.length ? geo.groups : null);
    const count = idx ? idx.count : pos.count;
    const slotOf = (t) => {
      if (!groups) return 0;
      for (const g of groups) if (t >= g.start && t < g.start + g.count) return g.materialIndex;
      return 0;
    };
    const nm = new THREE.Matrix3().getNormalMatrix(matWorld);
    const v = new THREE.Vector3();
    const getV = (i) => v.fromBufferAttribute(pos, i).applyMatrix4(matWorld);
    for (let t = 0; t < count; t += 3) {
      const i0 = idx ? idx.getX(t) : t;
      const i1 = idx ? idx.getX(t + 1) : t + 1;
      const i2 = idx ? idx.getX(t + 2) : t + 2;
      const a = getV(i0).clone();
      const b = getV(i1).clone();
      const c = getV(i2).clone();
      const m = readMat(slotOf(t));
      let col = m && m.color ? [m.color.r, m.color.g, m.color.b] : [0.6, 0.6, 0.62];
      const vcAttr = geo.attributes.color;
      if (vcAttr && m && m.vertexColors) {
        const cr = (vcAttr.getX(i0) + vcAttr.getX(i1) + vcAttr.getX(i2)) / 3;
        const cg = (vcAttr.getY(i0) + vcAttr.getY(i1) + vcAttr.getY(i2)) / 3;
        const cb = (vcAttr.getZ(i0) + vcAttr.getZ(i1) + vcAttr.getZ(i2)) / 3;
        col = [col[0] * cr, col[1] * cg, col[2] * cb];
      }
      let opac = m ? (m.transparent ? m.opacity : 1) : 1;
      if (m && m.opacity !== undefined && m.transparent === false) opac = 1;
      const inFront = !!m && m.side === THREE.DoubleSide;
      const emissive = m && m.emissive ? [m.emissive.r, m.emissive.g, m.emissive.b] : [0, 0, 0];
      const emissiveIntensity = m && m.emissiveIntensity !== undefined ? m.emissiveIntensity : 1;
      const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
      void nm;
      void inFront;
      tris.push({
        a, b, c, n,
        color: col,
        metalness: m && m.metalness !== undefined ? m.metalness : 0,
        roughness: m && m.roughness !== undefined ? m.roughness : 0.7,
        opacity: opac,
        emissive: emissive.map((x) => x * emissiveIntensity),
        transparent: !!(m && m.transparent),
        map: m && m.map ? m.map : null,
        uv: geo.attributes.uv || null,
        i0, i1, i2, geo,
      });
    }
  };

  const hiddenRoots = new Set();
  root.traverse((o) => {
    if (o === root) return;
    if (o.visible === false) hiddenRoots.add(o);
    if (o.parent && hiddenRoots.has(o.parent)) hiddenRoots.add(o);
  });
  root.traverse((o) => {
    if (!o.isMesh || o.visible === false) return;
    if (hiddenRoots.has(o)) return;
    if (hide(o)) return;
    const geo = o.geometry;
    if (!geo || !geo.attributes || !geo.attributes.position) return;
    if (o.isInstancedMesh) {
      if (!instanced) return;
      const n = o.count;
      const mtx = new THREE.Matrix4();
      for (let i = 0; i < n; i++) {
        o.getMatrixAt(i, mtx);
        const world = new THREE.Matrix4().multiplyMatrices(o.matrixWorld, mtx);
        // instance colours are ignored here; material colour carries the look
        pushMesh(geo, world, o.material);
      }
      return;
    }
    pushMesh(geo, o.matrixWorld, o.material);
    void tmp;
  });
  return tris;
}

// --- atmosphere (mirrors the GLSL dome closely enough for composition) ------
export function atmosphere(zenithHex, horizonHex, sunDir, sunColorHex, sunIntensity = 1) {
  const zenith = new THREE.Color(zenithHex);
  const horizon = new THREE.Color(horizonHex);
  const sunColor = new THREE.Color(sunColorHex);
  const s = sunDir.clone().normalize();
  return (dir) => {
    const d = dir.clone().normalize();
    const h = Math.max(-0.25, d.y);
    const opticalDepth = 1 / Math.max(0.16, h + 0.16);
    const rayleigh = Math.pow(opticalDepth, 0.85);
    let base = zenith.clone().multiplyScalar(Math.pow(Math.max(h, 0), 0.55)).add(
      horizon.clone().multiplyScalar(1 - Math.pow(Math.max(h, 0), 0.55))
    );
    const ext = [0.72, 1.0, 1.28];
    const k = Math.min(1, rayleigh * 0.55);
    base.setRGB(base.r * (1 + (ext[0] - 1) * k), base.g * (1 + (ext[1] - 1) * k), base.b * (1 + (ext[2] - 1) * k));
    const ct = Math.max(0, d.dot(s));
    const mie = Math.pow(ct, 8) * 0.55 + Math.pow(ct, 64) * 1.5;
    base.add(sunColor.clone().multiplyScalar(mie * sunIntensity * 0.35));
    const disc = ct > 0.99965 ? 1 : 0;
    if (disc) base.add(sunColor.clone().multiplyScalar(42 * sunIntensity));
    return base;
  };
}

// --- renderer ---------------------------------------------------------------
export function renderScene(tris, opts) {
  const {
    width = 1280,
    height = 720,
    camera,
    lookAt,
    fov = 55,
    sky = () => new THREE.Color(0.1, 0.12, 0.16),
    sunDir = V(-0.42, 0.56, 0.72),
    sunColor = new THREE.Color(1, 0.96, 0.9),
    sunIntensity = 2.6,
    fog = null, // { color: THREE.Color, density }
    ground = null, // { y, color } fills the lower half behind geometry
    exposure = 1.0,
    ssaa = 1,
  } = opts;

  const W = width * ssaa;
  const H = height * ssaa;
  const cam = new THREE.PerspectiveCamera(fov, W / H, 0.05, 4000);
  cam.position.copy(camera);
  cam.lookAt(lookAt);
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  const viewProj = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);

  const zbuf = new Float32Array(W * H).fill(Infinity);
  const rgb = new Float32Array(W * H * 3);
  const skySampler = sky;

  // Background: sky per pixel.
  const invProj = new THREE.Matrix4().copy(cam.projectionMatrix).invert();
  const camWorld = cam.matrixWorld;
  const dirTmp = new THREE.Vector3();
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const ndc = new THREE.Vector3((x + 0.5) / W * 2 - 1, -((y + 0.5) / H * 2 - 1), 0.5);
      ndc.applyMatrix4(invProj);
      dirTmp.copy(ndc).applyMatrix4(camWorld).sub(cam.position).normalize();
      const c = skySampler(dirTmp);
      const i = (y * W + x) * 3;
      rgb[i] = c.r; rgb[i + 1] = c.g; rgb[i + 2] = c.b;
    }
  }

  const s = sunDir.clone().normalize();
  const vA = new THREE.Vector4();
  const vB = new THREE.Vector4();
  const vC = new THREE.Vector4();
  const poly = [];
  const p0 = new THREE.Vector4();
  const p1 = new THREE.Vector4();
  const p2 = new THREE.Vector4();
  const nrm = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const triN = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const camDir = new THREE.Vector3();

  for (const t of tris) {
    if (t.opacity < 0.02) continue;
    // Backface: cull if the face points away, unless it is double sided (we
    // approximate by culling nothing for transparent glass-like materials).
    nrm.copy(t.n);
    e1.subVectors(t.a, cam.position);
    if (!t.transparent && nrm.dot(e1) > 0) continue;

    // Clip the triangle against the near plane in homogeneous clip space. Big
    // ground quads routinely have vertices behind the camera; rejecting whole
    // triangles there would delete the floor of every outdoor shot.
    const NEAR = 0.05;
    vA.set(t.a.x, t.a.y, t.a.z, 1).applyMatrix4(viewProj);
    vB.set(t.b.x, t.b.y, t.b.z, 1).applyMatrix4(viewProj);
    vC.set(t.c.x, t.c.y, t.c.z, 1).applyMatrix4(viewProj);
    poly.length = 0;
    if (vA.w < NEAR && vB.w < NEAR && vC.w < NEAR) continue;
    if (vA.w >= NEAR && vB.w >= NEAR && vC.w >= NEAR) {
      poly.push(vA.clone(), vB.clone(), vC.clone());
    } else {
      // Sutherland-Hodgman against the single plane w = NEAR (clip space w is
      // the linear view depth, so this plane is linear and safe to interpolate).
      const src = [vA, vB, vC];
      let cur = src[0].clone();
      let curIn = cur.w >= NEAR;
      for (let i = 1; i <= 3; i++) {
        const nxt = src[i % 3].clone();
        const nxtIn = nxt.w >= NEAR;
        if (curIn) poly.push(cur.clone());
        if (curIn !== nxtIn) {
          const f = (NEAR - cur.w) / (nxt.w - cur.w);
          poly.push(new THREE.Vector4(
            cur.x + (nxt.x - cur.x) * f,
            cur.y + (nxt.y - cur.y) * f,
            cur.z + (nxt.z - cur.z) * f,
            NEAR
          ));
        }
        cur = nxt;
        curIn = nxtIn;
      }
    }
    if (poly.length < 3) continue;
    for (let pi = 1; pi + 1 < poly.length; pi++) {
      drawTri(poly[0], poly[pi], poly[pi + 1], t);
    }
  }

  function drawTri(P0, P1, P2, t) {
    const p0 = P0, p1 = P1, p2 = P2;
    if (p0.w <= 0.02 || p1.w <= 0.02 || p2.w <= 0.02) return;
    const iw0 = 1 / p0.w, iw1 = 1 / p1.w, iw2 = 1 / p2.w;
    const ax = (p0.x * iw0 * 0.5 + 0.5) * W, ay = (1 - (p0.y * iw0 * 0.5 + 0.5)) * H;
    const bx = (p1.x * iw1 * 0.5 + 0.5) * W, by = (1 - (p1.y * iw1 * 0.5 + 0.5)) * H;
    const cx = (p2.x * iw2 * 0.5 + 0.5) * W, cy = (1 - (p2.y * iw2 * 0.5 + 0.5)) * H;
    const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
    const maxX = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx)));
    const minY = Math.max(0, Math.floor(Math.min(ay, by, cy)));
    const maxY = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)));
    if (minX > maxX || minY > maxY) return;
    const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
    if (Math.abs(area) < 1e-9) return;

    // Shading constants for this triangle.
    const ndl = Math.max(0, nrm.dot(s));
    const wrap = Math.max(0, (nrm.dot(s) + 0.35) / 1.35);
    const rough = t.roughness;
    const metal = t.metalness;
    const specExp = Math.min(4096, 2 / Math.max(0.02, rough * rough));
    const specNorm = (specExp + 8) / (8 * Math.PI);
    const baseC = t.color;
    const albedo = [
      baseC[0] * (1 - metal) + 0.04 * metal,
      baseC[1] * (1 - metal) + 0.04 * metal,
      baseC[2] * (1 - metal) + 0.04 * metal,
    ];
    const f0 = metal > 0.5 ? baseC : [0.04, 0.04, 0.04];
    const emis = t.emissive;
    const opac = t.transparent ? t.opacity : 1;

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5, py = y + 0.5;
        const l0 = ((bx - px) * (cy - py) - (cx - px) * (by - py)) / area;
        const l1 = ((cx - px) * (ay - py) - (ax - px) * (cy - py)) / area;
        const l2 = 1 - l0 - l1;
        if (l0 < -0.0004 || l1 < -0.0004 || l2 < -0.0004) continue;
        const iw = l0 * iw0 + l1 * iw1 + l2 * iw2;
        const depth = 1 / iw; // view-space distance
        const di = y * W + x;
        if (depth >= zbuf[di] - 1e-7) continue;

        // Reflection direction for cheap environment specular.
        camDir.copy(cam.position).sub(t.a).normalize();
        const ndv = Math.max(0.001, nrm.dot(camDir));
        const fresnel = Math.pow(1 - ndv, 5);
        const specD = Math.pow(ndv, 1) * 0; // placeholder to keep V8 happy
        const spec = (specExp + 8) / (8 * Math.PI) * Math.pow(Math.max(0, nrm.dot(s.clone().add(camDir).normalize())), specExp);
        void specD;

        // Ambient: average of the sky hemisphere along the normal, weighted.
        const upness = 0.5 + 0.5 * nrm.y;
        const skyAtNormal = skySampler(nrm.clone().lerp(V(0, 1, 0), 0.35));
        const amb = [skyAtNormal.r, skyAtNormal.g, skyAtNormal.b];

        const out = [0, 0, 0];
        for (let ch = 0; ch < 3; ch++) {
          const sc = ch === 0 ? sunColor.r : ch === 1 ? sunColor.g : sunColor.b;
          const sunL = sc * sunIntensity;
          const diff = albedo[ch] * (ndl * 0.75 + wrap * 0.25) * sunL * (1 / Math.PI);
          const specular = (f0[ch] + (1 - f0[ch]) * fresnel * 0.6) * spec * sunL;
          const ambient = albedo[ch] * amb[ch] * (0.35 + 0.65 * upness) * 0.9;
          let v = diff + specular + ambient + emis[ch];
          if (fog) {
            const f = 1 - Math.exp(-Math.pow(depth * (fog.density ?? 1) * 0.004, 2));
            const fc = ch === 0 ? fog.color.r : ch === 1 ? fog.color.g : fog.color.b;
            v = v * (1 - f) + fc * f;
          }
          out[ch] = v;
        }

        const idx = di * 3;
        if (opac >= 0.98) {
          zbuf[di] = depth;
          rgb[idx] = out[0]; rgb[idx + 1] = out[1]; rgb[idx + 2] = out[2];
        } else {
          // Blend, but do not commit depth: glass should not occlude what is
          // behind it in the preview.
          rgb[idx] = rgb[idx] * (1 - opac) + out[0] * opac;
          rgb[idx + 1] = rgb[idx + 1] * (1 - opac) + out[1] * opac;
          rgb[idx + 2] = rgb[idx + 2] * (1 - opac) + out[2] * opac;
        }
      }
    }
  }
  void ground;

  // Tonemap (ACES-ish) + sRGB + box downsample.
  const outDark = Buffer.alloc(width * height * 4);
  const aces = (x) => {
    const a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
    return Math.min(1, Math.max(0, (x * (a * x + b)) / (x * (c * x + d) + e)));
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < ssaa; sy++) {
        for (let sx = 0; sx < ssaa; sx++) {
          const i = ((y * ssaa + sy) * W + (x * ssaa + sx)) * 3;
          r += rgb[i]; g += rgb[i + 1]; b += rgb[i + 2];
        }
      }
      const n = ssaa * ssaa;
      r = aces((r / n) * exposure);
      g = aces((g / n) * exposure);
      b = aces((b / n) * exposure);
      const o = (y * width + x) * 4;
      outDark[o] = Math.round(Math.pow(r, 1 / 2.2) * 255);
      outDark[o + 1] = Math.round(Math.pow(g, 1 / 2.2) * 255);
      outDark[o + 2] = Math.round(Math.pow(b, 1 / 2.2) * 255);
      outDark[o + 3] = 255;
    }
  }
  return { buf: outDark, width, height };
}
