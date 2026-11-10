/**
 * REALISM RENDERER — physical sky, image-based lighting, shadow fitting,
 * contact occlusion, camera-accurate post-processing and supersampled photo capture.
 *
 * DIAGNOSIS THIS FILE ADDRESSES
 * -----------------------------
 * The v1 renderer had five properties that, together, guarantee a "this is a
 * game" read no matter how good the geometry gets:
 *
 *  1. `scene.background = flat Color` and `scene.fog = FogExp2(sameColor)`.
 *     A flat gradient with no sun, no horizon band and no atmospheric
 *     scattering is the single most recognisable CG sky. Real photographs
 *     always have a luminance ramp toward the horizon and a coloured sun-glow
 *     lobe; its absence is read subconsciously as "render".
 *  2. No `scene.environment`. Every MeshPhysicalMaterial in the project
 *     (clearcoat car paint, chrome, glass) evaluates its specular reflection
 *     against *nothing*, so it falls back to a constant ambient term. Clearcoat
 *     paint without an environment map is indistinguishable from grey plastic,
 *     and chrome is indistinguishable from grey plastic. This one omission is
 *     why the garage cars look flat even under the spotlights.
 *  3. One 2048 px shadow map with a fixed 110 m frustum. The shadow texel is
 *     therefore ~10 cm and any car-shaped shadow has soft mush at its contact
 *     edge, which is precisely where the eye looks to decide whether an object
 *     is touching the ground.
 *  4. No contact occlusion. The car floats: the gap between tyre and asphalt is
 *     lit exactly like open ground.
 *  5. `preserveDrawingBuffer: true` plus direct `toDataURL` — a photo mode that
 *     captures at window resolution with no depth of field, no bloom, no
 *     grain, no lens aberrations. A real photograph has all five.
 *
 * WHAT THIS FILE DOES
 * -------------------
 *  - Analytic sky dome (Rayleigh-style wavelength extinction + Mie forward
 *    scatter + sun disc + horizon haze + FBM clouds + stars).
 *  - PMREM-filtered environment map generated from that sky, applied as
 *    `scene.environment` and re-generated when the sun moves more than ~1.7°.
 *    PMREM is what makes roughness read correctly: without the pre-filtered
 *    mip chain, a roughness change does nothing to the reflection.
 *  - Sun shadow cascade fitting: frustum follows the car, texel-snapped so the
 *    shadow does not crawl as the camera moves.
 *  - Contact shadow decals (a cheap, artist-controllable stand-in for
 *    ray-traced contact occlusion) under every car.
 *  - HDR pipeline: render target (half-float, 4x MSAA) -> bloom -> optional
 *    depth of field (photo mode) -> AgX/ACES tonemap -> film grade
 *    (vignette, radial chromatic aberration, sensor grain, unsharp mask).
 *  - Auto-exposure with eye adaptation, so night and storm are readable without
 *    destroying the dynamic range.
 *  - Rain as camera-following streaks with per-drop velocity, not a static
 *    point cloud.
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { WeatherPreset } from '../types/game';

export interface SkyInput {
  weather: WeatherPreset;
  hourOfDay: number;
  sunDirection: THREE.Vector3;
  dayFactor: number;
  lightning: boolean;
}

const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * Sky fragment shader.
 *
 * The physically-motivated part is the Rayleigh/Mie separation: Rayleigh
 * scattering goes as 1/lambda^4, so the sky is blue at zenith and desaturates
 * toward white at the horizon where the optical depth is largest. We model it
 * cheaply with a wavelength-weighted extinction and an optical-depth term that
 * grows as the view direction approaches the horizon. Mie scattering is
 * forward-lobed (Henyey-Greenstein, g ~ 0.76), which produces the bright halo
 * around the sun and the white glow on the sun-side horizon.
 */
const SKY_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vDir;

  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform float uDayFactor;
  uniform float uSunIntensity;
  uniform float uCloudiness;
  uniform float uTime;
  uniform float uLightning;
  uniform float uHaze;

  // Hash / value noise for clouds and stars.
  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 4; i++) {
      v += amp * noise(p);
      p *= 2.03;
      amp *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 dir = normalize(vDir);
    float h = clamp(dir.y, -0.2, 1.0);

    // --- Rayleight-ish vertical gradient -----------------------------------
    // Optical depth grows toward the horizon (1/cos(zenith) approximation).
    float opticalDepth = 1.0 / max(0.16, h + 0.16);
    float rayleigh = pow(opticalDepth, 0.85);
    vec3 base = mix(uHorizon, uZenith, clamp(pow(max(h, 0.0), 0.55), 0.0, 1.0));

    // Wavelength extinction: blue survives at zenith, red/orange dominates the
    // long path near the horizon. This is what gives sunsets their ramp.
    vec3 extinction = vec3(0.72, 1.0, 1.28);
    base *= mix(vec3(1.0), extinction, clamp(rayleigh * 0.55, 0.0, 1.0));

    // --- Mie forward scatter (sun halo) ------------------------------------
    float cosTheta = max(0.0, dot(dir, uSunDir));
    float mie = pow(cosTheta, 8.0) * 0.55 + pow(cosTheta, 64.0) * 1.5;
    base += uSunColor * mie * uSunIntensity * 0.35;

    // --- Sun disc with limb darkening --------------------------------------
    float disc = smoothstep(0.99965, 0.99991, cosTheta);
    // Limb darkening: the edge of the solar disc is ~40% dimmer than centre.
    float limb = 0.6 + 0.4 * smoothstep(0.9996, 0.99995, cosTheta);
    base += uSunColor * disc * 42.0 * uSunIntensity * limb;

    // --- Clouds (FBM, vertically squashed near the horizon) ----------------
    if (uCloudiness > 0.01 && dir.y > 0.0) {
      vec2 cloudUv = dir.xz / max(0.12, dir.y + 0.22) * 0.55;
      cloudUv += vec2(uTime * 0.0035, uTime * 0.0012);
      float density = fbm(cloudUv * 1.7);
      density = smoothstep(0.52 - uCloudiness * 0.12, 0.92, density);
      // Clouds are lit from the sun side and dark underneath.
      float lit = 0.55 + 0.45 * pow(cosTheta, 2.0);
      vec3 cloudColor = mix(uHorizon * 0.55, uSunColor * 1.15 + vec3(0.12), lit);
      cloudColor *= 0.55 + 0.45 * uDayFactor;
      base = mix(base, cloudColor, density * uCloudiness * clamp(dir.y * 3.0, 0.0, 1.0));
    }

    // --- Stars -------------------------------------------------------------
    if (uDayFactor < 0.35 && dir.y > 0.0) {
      vec2 starUv = dir.xz / (dir.y + 0.35) * 420.0;
      float s = hash(floor(starUv));
      float star = step(0.9975, s) * (0.35 + 0.65 * hash(floor(starUv) + 7.0));
      float twinkle = 0.75 + 0.25 * sin(uTime * 3.0 + s * 90.0);
      base += vec3(0.85, 0.9, 1.0) * star * twinkle * (1.0 - uDayFactor / 0.35) * 0.9;
    }

    // --- Horizon haze band -------------------------------------------------
    float haze = exp(-abs(dir.y) * 14.0) * uHaze;
    base = mix(base, uHorizon * 1.06 + uSunColor * 0.05, clamp(haze, 0.0, 0.85));

    // --- Lightning flash ---------------------------------------------------
    base += vec3(0.75, 0.82, 1.0) * uLightning * 0.85;

    gl_FragColor = vec4(base, 1.0);
  }
`;

export const GRADE_SHADER = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uGrain: { value: 0.028 },
    uVignette: { value: 0.42 },
    uAberration: { value: 0.0016 },
    uSharpen: { value: 0.22 },
    uSaturation: { value: 1.04 },
    uLift: { value: 0.0 },
    uPhotoMode: { value: 0.0 },
    uSpeedBlur: { value: 0.0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform vec2 uResolution;
    uniform float uTime;
    uniform float uGrain;
    uniform float uVignette;
    uniform float uAberration;
    uniform float uSharpen;
    uniform float uSaturation;
    uniform float uLift;
    uniform float uPhotoMode;
    uniform float uSpeedBlur;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    void main() {
      vec2 uv = vUv;
      vec2 center = uv - 0.5;
      float r2 = dot(center, center);

      // --- Radial chromatic aberration -------------------------------------
      // Real glass has lateral CA that grows with distance from the optical
      // axis. Sampling R and B at slightly different radii is the same trick
      // every photographic lens simulation uses; it is subtle but it is one of
      // the strongest "recorded through an optic" cues.
      vec2 dir = normalize(center + 1e-6);
      float ca = uAberration * (0.35 + r2 * 2.2);
      vec3 color;
      color.r = texture2D(tDiffuse, uv - dir * ca).r;
      color.g = texture2D(tDiffuse, uv).g;
      color.b = texture2D(tDiffuse, uv + dir * ca).b;

      // --- Speed blur (radial, subtle) -------------------------------------
      // At speed a real shutter smears the periphery toward the vanishing
      // point. Four taps along the radial direction, scaled by uSpeedBlur
      // (0 at rest, ~0.35 at top speed), sell velocity without a full
      // motion-blur pass. Disabled in photo mode (still = sharp).
      if (uSpeedBlur > 0.002 && uPhotoMode < 0.5) {
        float blurAmt = uSpeedBlur * r2 * 0.055;
        vec3 blurred = color;
        blurred += texture2D(tDiffuse, uv - dir * blurAmt).rgb;
        blurred += texture2D(tDiffuse, uv - dir * blurAmt * 2.0).rgb;
        blurred += texture2D(tDiffuse, uv - dir * blurAmt * 3.0).rgb;
        blurred += texture2D(tDiffuse, uv - dir * blurAmt * 4.0).rgb;
        color = mix(color, blurred * 0.2, clamp(uSpeedBlur, 0.0, 1.0) * 0.55);
      }

      // --- Unsharp mask (photographic micro-contrast) -----------------------
      // A small 4-tap high-pass adds perceived detail without a real sharpen
      // kernel. This is what makes 1080p look like it has more resolution.
      if (uSharpen > 0.001) {
        vec2 texel = 1.0 / uResolution;
        vec3 blur =
          texture2D(tDiffuse, uv + vec2(texel.x, 0.0)).rgb +
          texture2D(tDiffuse, uv - vec2(texel.x, 0.0)).rgb +
          texture2D(tDiffuse, uv + vec2(0.0, texel.y)).rgb +
          texture2D(tDiffuse, uv - vec2(0.0, texel.y)).rgb;
        blur *= 0.25;
        color += (color - blur) * uSharpen;
      }

      // --- Vignette ---------------------------------------------------------
      float vig = smoothstep(0.95, 0.22, r2 * 1.55);
      color *= mix(1.0, vig, uVignette);

      // --- Sensor grain -----------------------------------------------------
      // Luminance-dependent: shadows are noisy, highlights are clean. Uniform
      // grain (the usual mistake) reads as video compression, not film.
      float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
      float n = hash(uv * uResolution + fract(uTime) * 517.0) - 0.5;
      float grainAmount = uGrain * (1.0 - smoothstep(0.45, 0.95, luma)) * (0.55 + 0.45 * (1.0 - luma));
      color += n * grainAmount;

      // --- Grade ------------------------------------------------------------
      color = mix(vec3(luma), color, uSaturation);
      color += uLift * (1.0 - color);
      // Highlight desaturation: film and digital sensors both roll chroma off
      // toward white before clipping. Without this, blown skies look like
      // saturated cyan blobs (the classic "game sky" tell).
      float hi = smoothstep(0.72, 1.0, luma);
      color = mix(color, vec3(luma), hi * 0.35);

      gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
    }
  `,
};

export class RealismRenderer {
  public readonly composer: EffectComposer;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;

  private skyMesh: THREE.Mesh;
  private skyMat: THREE.ShaderMaterial;
  private skyScene: THREE.Scene;
  private pmrem: THREE.PMREMGenerator;
  private envTarget: THREE.WebGLRenderTarget | null = null;

  private renderPass: RenderPass;
  private bloomPass: UnrealBloomPass;
  private outputPass: OutputPass;
  private gradePass: ShaderPass;
  private bokehPass: BokehPass;

  /**
   * Interior sets (the garage) need their own air: a neutral studio bounce
   * instead of the outdoor horizon. Overriding the *sky uniforms* rather than
   * swapping the dome means the IBL keeps working, so paint, chrome and glass
   * still have something shaped to reflect indoors.
   */
  private skyOverride: { zenith: number; horizon: number; sun: number; sunIntensity: number } | null = null;
  private fogOverride: { color: number; density: number } | null = null;

  private lastEnvSunY = -99;
  private lastEnvWeather = '';
  private lastEnvTime = 0;

  private rain: THREE.LineSegments | null = null;
  private rainVelocities: Float32Array | null = null;
  private rainMat: THREE.LineBasicMaterial | null = null;

  private clock = 0;
  private exposure = 1.0;
  private targetExposure = 1.0;
  private manualExposure: number | null = null;

  private contactTexture: THREE.CanvasTexture;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;

    // Half-float, 4x MSAA intermediate. Half float is mandatory: bloom and
    // tonemapping must see values above 1.0 or highlights clip before the
    // tonal curve can roll them off.
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(Math.max(2, size.x), Math.max(2, size.y), {
      type: THREE.HalfFloatType,
      samples: 4,
      colorSpace: THREE.LinearSRGBColorSpace,
    });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.setPixelRatio(renderer.getPixelRatio());

    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      uniforms: {
        uZenith: { value: new THREE.Color(0x2a6fdb) },
        uHorizon: { value: new THREE.Color(0xbfd8ef) },
        uSunDir: { value: new THREE.Vector3(0.4, 0.5, 0.2).normalize() },
        uSunColor: { value: new THREE.Color(0xfff2d8) },
        uDayFactor: { value: 1 },
        uSunIntensity: { value: 1 },
        uCloudiness: { value: 0.25 },
        uTime: { value: 0 },
        uLightning: { value: 0 },
        uHaze: { value: 0.5 },
      },
    });

    // Radius must stay inside the camera's far plane (2800 in this build) or the
    // dome is clipped and the sky renders black. Because the material writes no
    // depth and draws first, a small dome still covers geometry beyond it.
    this.skyMesh = new THREE.Mesh(new THREE.SphereGeometry(1200, 48, 32), this.skyMat);
    this.skyMesh.frustumCulled = false;
    this.skyMesh.renderOrder = -1000;
    this.scene.add(this.skyMesh);

    // Environment is rendered from a dedicated scene so PMREM does not have to
    // walk the whole world (cars, tracks, particles) every regeneration.
    this.skyScene = new THREE.Scene();
    const envSky = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 20), this.skyMat);
    envSky.frustumCulled = false;
    this.skyScene.add(envSky);

    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.pmrem.compileEquirectangularShader();

    this.renderPass = new RenderPass(scene, camera);
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(Math.max(2, size.x), Math.max(2, size.y)),
      0.34, // strength — restrained; game bloom is usually 3-4x too strong
      0.55, // radius
      0.86 // threshold: only sun glints, headlights and brake lights bloom
    );
    this.bokehPass = new BokehPass(scene, camera, {
      focus: 8.0,
      aperture: 0.00018,
      maxblur: 0.006,
    });
    this.bokehPass.enabled = false;

    this.outputPass = new OutputPass();
    this.gradePass = new ShaderPass(GRADE_SHADER);
    this.gradePass.renderToScreen = true;

    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bokehPass);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(this.outputPass);
    this.composer.addPass(this.gradePass);

    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.contactTexture = this.buildContactShadowTexture();
    this.setSize(renderer.domElement.clientWidth || window.innerWidth, renderer.domElement.clientHeight || window.innerHeight);
  }

  public get skyObject(): THREE.Object3D {
    return this.skyMesh;
  }

  /**
   * Photo mode lets the player set exposure directly (like a camera's shutter
   * dial). While an override is active the auto-exposure loop is suspended —
   * otherwise the grade would fight the player's slider every frame.
   */
  public setManualExposure(value: number | null): void {
    this.manualExposure = value;
    if (value !== null) this.renderer.toneMappingExposure = value;
  }

  /** Locks the dome to a neutral interior bounce (or clears it with null). */
  public setSkyOverride(o: { zenith: number; horizon: number; sun: number; sunIntensity: number } | null): void {
    this.skyOverride = o;
    this.lastEnvWeather = '__override__';
    this.lastEnvTime = -999;
  }

  /** Forces scene fog (used indoors so the hall does not fog to the horizon). */
  public setFogOverride(o: { color: number; density: number } | null): void {
    this.fogOverride = o;
  }

  public setSize(width: number, height: number): void {
    this.composer.setSize(width, height);
    this.bokehPass.setSize(width, height);
    this.bloomPass.setSize(width, height);
    const px = this.renderer.getPixelRatio();
    this.gradePass.uniforms.uResolution.value.set(width * px, height * px);
  }

  /** Speed-blur strength 0..1 (0 = off). Fed by the engine from car speed. */
  public setSpeedBlur(amount: number): void {
    this.gradePass.uniforms.uSpeedBlur.value = Math.max(0, Math.min(1, amount));
  }

  public setBloomEnabled(enabled: boolean): void {
    this.bloomPass.enabled = enabled;
  }

  public get bloomEnabled(): boolean {
    return this.bloomPass.enabled;
  }

  /** Radially-faded blob used as a cheap contact occlusion decal. */
  private buildContactShadowTexture(): THREE.CanvasTexture {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const grad = ctx.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2);
      // Two-lobe falloff: a hard dark core within the tyre contact patch, then a
      // long soft skirt. A single linear gradient reads as a painted blob.
      grad.addColorStop(0.0, 'rgba(0,0,0,0.95)');
      grad.addColorStop(0.35, 'rgba(0,0,0,0.62)');
      grad.addColorStop(0.62, 'rgba(0,0,0,0.24)');
      grad.addColorStop(1.0, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /**
   * Returns a ground-projected contact shadow. Parents to the world, not the
   * car, so it does not tilt with body roll (real contact shadows stay flat).
   */
  public createContactShadow(widthM: number, lengthM: number, opacity = 0.72): THREE.Mesh {
    const geo = new THREE.PlaneGeometry(widthM, lengthM);
    const mat = new THREE.MeshBasicMaterial({
      map: this.contactTexture,
      transparent: true,
      opacity,
      depthWrite: false,
      color: 0x000000,
      blending: THREE.NormalBlending,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.renderOrder = 2;
    return mesh;
  }

  /**
   * Fits the sun's shadow camera to a region around `focus`. Also snaps the
   * light target to whole shadow texels: without the snap the shadow crawls
   * (shimmering edge) as the car moves, which reads as "cheap shadow".
   */
  public updateSunShadow(light: THREE.DirectionalLight, focus: THREE.Vector3, radiusM = 42): void {
    const mapSize = light.shadow.mapSize.x || 2048;
    const texelWorld = (radiusM * 2) / mapSize;
    const fx = Math.round(focus.x / texelWorld) * texelWorld;
    const fz = Math.round(focus.z / texelWorld) * texelWorld;

    const cam = light.shadow.camera;
    cam.left = -radiusM;
    cam.right = radiusM;
    cam.top = radiusM;
    cam.bottom = -radiusM;
    cam.near = 1;
    cam.far = radiusM * 6;
    cam.updateProjectionMatrix();

    const dir = light.position.clone().sub(light.target.position);
    if (dir.lengthSq() < 1e-4) dir.set(0.4, 1, 0.3);
    dir.normalize();
    const dist = radiusM * 2.4;
    light.position.set(fx + dir.x * dist, focus.y + dir.y * dist, fz + dir.z * dist);
    light.target.position.set(fx, focus.y, fz);
    light.target.updateMatrixWorld();

    light.shadow.bias = -0.00035;
    light.shadow.normalBias = texelWorld * 1.4;
  }

  /** Updates sky, environment lighting and auto-exposure. */
  public updateSky(input: SkyInput, dt: number): void {
    this.clock += dt;
    const u = this.skyMat.uniforms;
    const zenith = new THREE.Color(input.weather.skyTopHex);
    const horizon = new THREE.Color(input.weather.skyHorizonHex);
    const day = THREE.MathUtils.clamp(input.dayFactor, 0, 1);

    // Night sky is not black: airglow + light pollution gives a dark blue-grey
    // that a camera exposes up to. Pure black is a rendering artefact.
    zenith.lerp(new THREE.Color(0x05070f), 1 - day);
    horizon.lerp(new THREE.Color(0x0b1020), 1 - day);

    if (this.skyOverride) {
      zenith.setHex(this.skyOverride.zenith);
      horizon.setHex(this.skyOverride.horizon);
    }
    u.uZenith.value.copy(zenith);
    u.uHorizon.value.copy(horizon);
    u.uSunDir.value.copy(input.sunDirection).normalize();
    u.uDayFactor.value = day;
    u.uTime.value = this.clock;
    u.uLightning.value = input.lightning ? 1 : 0;

    const golden = Math.abs(input.sunDirection.y) < 0.26;
    const sunColor = this.skyOverride
      ? new THREE.Color(this.skyOverride.sun)
      : new THREE.Color(golden ? 0xffa24a : 0xfff4e2);
    u.uSunColor.value.copy(sunColor);
    if (this.skyOverride) {
      u.uSunIntensity.value = this.skyOverride.sunIntensity;
      u.uCloudiness.value = 0;
      u.uHaze.value = 0.12;
    } else {
      u.uSunIntensity.value = 0.35 + day * 0.9;
      u.uCloudiness.value =
        input.weather.precipitationIntensity > 0.05 ? Math.min(0.95, 0.35 + input.weather.precipitationIntensity * 0.6) : 0.22;
      u.uHaze.value = Math.min(0.95, 0.35 + input.weather.visibilityFog * 18);
    }

    // Match fog to the horizon so distant geometry dissolves into the sky
    // instead of into a different colour (a classic compositing tell).
    const fogColor = horizon.clone().lerp(zenith, 0.25);
    if (this.fogOverride) {
      fogColor.setHex(this.fogOverride.color);
      if (this.scene.fog instanceof THREE.FogExp2) {
        this.scene.fog.color.copy(fogColor);
        this.scene.fog.density = this.fogOverride.density;
      } else {
        this.scene.fog = new THREE.FogExp2(this.fogOverride.color, this.fogOverride.density);
      }
    } else if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.copy(fogColor);
    } else {
      this.scene.fog = new THREE.FogExp2(fogColor.getHex(), input.weather.visibilityFog);
    }
    this.scene.background = null; // the dome is the background now

    // Sky dome follows the camera so the horizon never shifts with translation.
    this.skyMesh.position.copy(this.camera.position);

    // --- Environment map regeneration -------------------------------------
    // Throttled: PMREM costs ~1.5 ms and is only perceptible when the sun has
    // moved enough to change the specular lobe direction.
    const sunY = input.sunDirection.y;
    const needsUpdate =
      Math.abs(sunY - this.lastEnvSunY) > 0.018 ||
      input.weather.id !== this.lastEnvWeather ||
      this.clock - this.lastEnvTime > 4.0;
    if (needsUpdate) {
      this.lastEnvSunY = sunY;
      this.lastEnvWeather = input.weather.id;
      this.lastEnvTime = this.clock;
      if (this.envTarget) this.envTarget.dispose();
      this.envTarget = this.pmrem.fromScene(this.skyScene, 0, 1, 200);
      this.scene.environment = this.envTarget.texture;
      this.scene.environmentIntensity = 0.55 + day * 0.65;
    }

    // --- Auto exposure -----------------------------------------------------
    // Heuristic target: night needs ~5x the exposure of noon; storms cut it.
    const stormPenalty = 1 - Math.min(0.45, input.weather.visibilityFog * 3);
    this.targetExposure = (0.52 + (1 - day) * 1.55) * stormPenalty;
    // Eye adaptation is asymmetric: pupils constrict fast, dilate slowly (~1.2 s
    // vs ~0.35 s). Using one time constant is why game auto-exposure feels "swimmy".
    const tau = this.targetExposure > this.exposure ? 0.28 : 1.15;
    this.exposure += (this.targetExposure - this.exposure) * Math.min(1, dt / Math.max(0.001, tau));
    if (this.manualExposure === null) {
      this.renderer.toneMappingExposure = this.exposure;
    }
  }

  /** Rebuilds the precipitation system: rain streaks follow the camera volume. */
  public updatePrecipitation(camera: THREE.Camera, weather: WeatherPreset): void {
    const wantsRain = weather.precipitationType === 'rain' || weather.precipitationType === 'acid_rain';
    if (!wantsRain || weather.precipitationIntensity <= 0.01) {
      if (this.rain) this.rain.visible = false;
      return;
    }
    if (!this.rain) {
      const count = 2600;
      const positions = new Float32Array(count * 2 * 3);
      const velocities = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        const x = (Math.random() - 0.5) * 70;
        const y = Math.random() * 26;
        const z = (Math.random() - 0.5) * 70;
        positions[i * 6] = x;
        positions[i * 6 + 1] = y;
        positions[i * 6 + 2] = z;
        positions[i * 6 + 3] = x;
        positions[i * 6 + 4] = y - 0.6;
        positions[i * 6 + 5] = z;
        velocities[i * 3] = (Math.random() - 0.5) * 1.2;
        velocities[i * 3 + 1] = 13 + Math.random() * 7;
        velocities[i * 3 + 2] = (Math.random() - 0.5) * 1.2;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const mat = new THREE.LineBasicMaterial({
        color: weather.precipitationType === 'acid_rain' ? 0x9dff4a : 0xcfd8e3,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: true,
      });
      this.rain = new THREE.LineSegments(geo, mat);
      this.rain.frustumCulled = false;
      this.rainMat = mat;
      this.rainVelocities = velocities;
      this.scene.add(this.rain);
    }
    this.rain.visible = true;
    if (this.rainMat) {
      this.rainMat.opacity = 0.12 + weather.precipitationIntensity * 0.2;
    }
    void camera;
  }

  public advancePrecipitation(dt: number, windX: number, windZ: number): void {
    if (!this.rain || !this.rain.visible || !this.rainVelocities) return;
    const pos = this.rain.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const count = this.rainVelocities.length / 3;
    const camPos = this.camera.position;
    const exposure = 0.035; // 1/30 s shutter: streak length = v * shutter
    for (let i = 0; i < count; i++) {
      const vx = this.rainVelocities[i * 3] + windX;
      const vy = this.rainVelocities[i * 3 + 1];
      const vz = this.rainVelocities[i * 3 + 2] + windZ;
      const x = arr[i * 6] + vx * dt;
      let y = arr[i * 6 + 1] - vy * dt;
      const z = arr[i * 6 + 2] + vz * dt;

      // Wrap the volume around the camera: a fixed rain box is one of the
      // most obvious "the rain stops when I drive away" bugs.
      let rx = x;
      let rz = z;
      if (rx - camPos.x > 35) rx -= 70;
      if (rx - camPos.x < -35) rx += 70;
      if (rz - camPos.z > 35) rz -= 70;
      if (rz - camPos.z < -35) rz += 70;
      if (y < camPos.y - 6) y += 26;

      arr[i * 6] = rx;
      arr[i * 6 + 1] = y;
      arr[i * 6 + 2] = rz;
      arr[i * 6 + 3] = rx - vx * exposure;
      arr[i * 6 + 4] = y + vy * exposure;
      arr[i * 6 + 5] = rz - vz * exposure;
    }
    pos.needsUpdate = true;
  }

  public setPhotoMode(active: boolean, focusDistance = 8): void {
    this.bokehPass.enabled = active;
    this.gradePass.uniforms.uPhotoMode.value = active ? 1 : 0;
    this.gradePass.uniforms.uGrain.value = active ? 0.036 : 0.024;
    this.gradePass.uniforms.uVignette.value = active ? 0.5 : 0.38;
    if (active) {
      const bokeh = this.bokehPass as unknown as {
        materialBokeh?: { uniforms?: Record<string, { value: number }> };
      };
      const uniforms = bokeh.materialBokeh?.uniforms;
      if (uniforms?.focus) uniforms.focus.value = focusDistance;
      if (uniforms?.maxblur) uniforms.maxblur.value = 0.0075;
    }
  }

  public render(dt: number): void {
    this.gradePass.uniforms.uTime.value = this.clock;
    void dt;
    this.composer.render();
  }

  /**
   * Supersampled capture. Renders at 2x device pixels into the composer, reads
   * the canvas, then restores. 2x2 supersampling is the cheapest way to get
   * clean, aliasing-free edges in a still — which is one of the first things a
   * viewer uses to distinguish a screenshot from a photograph.
   */
  public capturePhoto(): string {
    const size = this.renderer.getSize(new THREE.Vector2());
    const prevRatio = this.renderer.getPixelRatio();
    const prevBokeh = this.bokehPass.enabled;
    this.renderer.setPixelRatio(Math.min(3, prevRatio * 2));
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(size.x, size.y);
    this.gradePass.uniforms.uResolution.value.set(
      size.x * this.renderer.getPixelRatio(),
      size.y * this.renderer.getPixelRatio()
    );
    this.bokehPass.setSize(size.x, size.y);
    this.bloomPass.setSize(size.x, size.y);

    this.composer.render();
    const dataUrl = this.renderer.domElement.toDataURL('image/png');

    this.renderer.setPixelRatio(prevRatio);
    this.composer.setPixelRatio(prevRatio);
    this.composer.setSize(size.x, size.y);
    this.gradePass.uniforms.uResolution.value.set(size.x * prevRatio, size.y * prevRatio);
    this.bokehPass.setSize(size.x, size.y);
    this.bloomPass.setSize(size.x, size.y);
    this.bokehPass.enabled = prevBokeh;
    return dataUrl;
  }

  public dispose(): void {
    if (this.envTarget) this.envTarget.dispose();
    this.pmrem.dispose();
    this.composer.dispose();
    this.skyMat.dispose();
  }
}
