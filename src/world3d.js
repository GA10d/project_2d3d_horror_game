// 3D 第一人称房间：卧室 / 地下室 / 走廊闪现 / 结局门廊
// 模型与贴图来自 Poly Haven（CC0），见 src/assets.js
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { pbr, model, handprint } from './assets.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (a, b) => a + Math.random() * (b - a);

// ---------- 少量仍需程序生成的贴图 ----------
function mk(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); return c; }
function glowCanvas() {
  return mk(64, 64, (x) => {
    const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,225,150,1)'); gr.addColorStop(.3, 'rgba(255,205,110,.35)'); gr.addColorStop(1, 'rgba(255,200,100,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  });
}
export const grainURL = () => mk(128, 128, (x) => {
  const d = x.createImageData(128, 128);
  for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
  x.putImageData(d, 0, 0);
}).toDataURL();

// 手电筒的光斑：中心热点 + 反光杯造成的同心环 + 镜片上的灰尘
function cookieCanvas() {
  return mk(512, 512, (x) => {
    x.fillStyle = '#000'; x.fillRect(0, 0, 512, 512);
    const g = x.createRadialGradient(256, 256, 0, 256, 256, 250);
    g.addColorStop(0, '#fff'); g.addColorStop(.2, '#f2eee4'); g.addColorStop(.42, '#c4c0b4'); g.addColorStop(.72, '#9d998e');
    g.addColorStop(.86, '#b4b0a4'); g.addColorStop(.94, '#454340'); g.addColorStop(1, '#000');
    x.fillStyle = g; x.fillRect(0, 0, 512, 512);
    x.globalCompositeOperation = 'multiply';
    for (const [r, a] of [[92, .08], [150, .06], [205, .1]]) { x.strokeStyle = `rgba(0,0,0,${a})`; x.lineWidth = 7; x.beginPath(); x.arc(256 + rnd(-4, 4), 256 + rnd(-4, 4), r, 0, 7); x.stroke(); }
    for (let i = 0; i < 26; i++) { x.fillStyle = `rgba(0,0,0,${rnd(.08, .3)})`; x.beginPath(); x.arc(rnd(60, 450), rnd(60, 450), rnd(1.5, 6), 0, 7); x.fill(); }
  });
}
// 最终镜头处理：色散、冷暖分离调色、胶片颗粒、暗角
const LensShader = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, res: { value: new THREE.Vector2(1280, 720) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time; uniform vec2 res; varying vec2 vUv;
    void main(){
      vec2 d = vUv - .5; float r2 = dot(d, d); vec2 off = d * r2 * .014;
      vec3 c = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      float l = dot(c, vec3(.299, .587, .114));
      c = mix(c * vec3(.90, .98, 1.10), c * vec3(1.05, 1.0, .93), smoothstep(0., .55, l));
      c = mix(vec3(l), c, .9);
      c = (c - .5) * 1.05 + .5;
      float n = fract(sin(dot(floor(vUv * res) + time * 61., vec2(12.9898, 78.233))) * 43758.5453);
      c += (n - .5) * .04 * (1. - l * .6);
      c *= 1. - smoothstep(.12, .75, r2) * .85;
      gl_FragColor = vec4(max(c, 0.), 1.);
    }`,
};
// 光柱里的浮尘：只有落在手电光锥内的尘埃才会被照亮
const DustShader = {
  uniforms: { uCam: { value: new THREE.Vector3() }, uTime: { value: 0 }, uFlash: { value: 0 }, uScale: { value: 400 } },
  vertexShader: `
    uniform vec3 uCam; uniform float uTime, uScale; attribute float seed; varying float vA;
    void main(){
      vec3 p = position + vec3(sin(uTime * .21 + seed * 40.), uTime * .035 * (seed - .3), cos(uTime * .17 + seed * 30.)) * .35;
      p = mod(p - uCam + 3., 6.) - 3. + uCam;
      vec4 mv = modelViewMatrix * vec4(p, 1.);
      float dist = -mv.z;
      float cone = smoothstep(.925, .975, dot(normalize(mv.xyz), vec3(0., 0., -1.)));
      vA = cone * smoothstep(.25, .7, dist) * (1. - smoothstep(2.2, 3., dist)) * (.5 + .5 * sin(uTime * 2. + seed * 90.));
      gl_PointSize = (.006 + seed * .008) * uScale / max(dist, .2);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: `
    uniform float uFlash; varying float vA;
    void main(){ float d = length(gl_PointCoord - .5); gl_FragColor = vec4(vec3(1., .93, .8) * smoothstep(.5, .1, d) * vA * uFlash, 1.); }`,
};

const flat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? .9, metalness: o.metal ?? 0 });

export class World3D {
  constructor(canvas, G) {
    this.G = G; this.canvas = canvas;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = .95;
    this.camera = new THREE.PerspectiveCamera(68, 16 / 9, 0.05, 80);
    this.camera.rotation.order = 'YXZ';
    this.p = { x: 0, z: 0, yaw: 0, pitch: 0, bob: 0 };
    this.res = 1; this.t = 0;
    this.scene = new THREE.Scene();
    // 微弱的环境反射，让金属与漆面有质感
    const pm = new THREE.PMREMGenerator(r);
    this.envMap = pm.fromScene(new RoomEnvironment(), .04).texture;
    // 后期：HDR + MSAA + 泛光
    const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(r, rt);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(4, 4), .28, .6, .95);
    this.gtao = new GTAOPass(this.scene, this.camera, 4, 4);          // 环境光遮蔽：让家具「落地」，墙角缝隙变暗
    this.gtao.updateGtaoMaterial({ radius: .45, distanceExponent: 1.4, thickness: 1.2, scale: 1.25, samples: 12 });
    this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
    this.lens = new ShaderPass(LensShader);
    for (const p of [this.renderPass, this.gtao, this.bloom, new OutputPass(), this.lens]) this.composer.addPass(p);
    this.cookie = new THREE.CanvasTexture(cookieCanvas()); this.cookie.colorSpace = THREE.SRGBColorSpace;
    this.ray = new THREE.Raycaster();
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = Math.max(32, Math.floor(innerWidth * this.res)), h = Math.max(18, Math.floor(innerHeight * this.res));
    this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.lens.uniforms.res.value.set(w, h);
  }
  setRes(s) { this.res = s; this.resize(); }
  async animRes(levels, ms) { for (const s of levels) { this.setRes(s); await this.G.wait(ms); } }
  look(dx, dy) { if (this.lockLook) return; this.p.yaw -= dx * .0022; this.p.pitch = clamp(this.p.pitch - dy * .0022, -1.2, 1.2); }

  // ---------- 场景装载 ----------
  load(name) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    this.scene.environment = this.envMap; this.scene.environmentIntensity = .06;
    this.renderPass.scene = this.scene; this.gtao.scene = this.scene;
    this.solids = []; this.frame = 0;
    this.name = name;
    this.colliders = []; this.inter = []; this.tick = null; this.st = {};
    this.canMove = true; this.lockLook = false; this.lightOff = false; this.flickerT = 0; this.shake = 0;
    this.walkSpeed = 1.9; this.runSpeed = 3.6; this.holdT = 0; this.weak = false; this.dustOff = false;
    this.p.pitch = 0; this.p.bob = 0;
    this.camera.clear();                 // 相机跨场景复用：先摘掉上一个场景挂在它身上的灯
    this.scene.add(this.camera);
    // 手电筒
    this.flashBase = 84;
    const f = this.flash = new THREE.SpotLight(0xfff0d8, this.flashBase, 20, .37, .8, 1.5);
    f.map = this.cookie; f.shadow.radius = 2.5; f.shadow.blurSamples = 12;
    f.position.set(.06, -.08, 1.2); f.castShadow = true;   // 光源放在身后 1.2m：贴近墙面时不会过曝 f.shadow.mapSize.set(2048, 2048); f.shadow.bias = -.0015; f.shadow.normalBias = .02;
    f.shadow.camera.near = 1.35; f.shadow.camera.far = 20;
    const tg = new THREE.Object3D(); tg.position.set(0, .05, -4);
    this.camera.add(f); this.camera.add(tg); f.target = tg;
    this.faceLight = new THREE.PointLight(0xfff0e0, 0, 2.5); this.faceLight.position.set(0, -.3, -.12); this.camera.add(this.faceLight);
    // 手电照到的表面把光反弹回房间（廉价的单次间接光）
    this.bounce = new THREE.PointLight(0xffd2a6, 0, 7, 1.8); this.scene.add(this.bounce);
    this.bounceTo = new THREE.Vector3(); this.bounceI = 0;
    // 浮尘
    const N = 900, dp = new Float32Array(N * 3), ds = new Float32Array(N);
    for (let i = 0; i < N; i++) { dp[i * 3] = rnd(0, 6); dp[i * 3 + 1] = rnd(0, 6); dp[i * 3 + 2] = rnd(0, 6); ds[i] = Math.random(); }
    const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(dp, 3)); dg.setAttribute('seed', new THREE.BufferAttribute(ds, 1));
    this.dustMat = new THREE.ShaderMaterial({ ...DustShader, uniforms: THREE.UniformsUtils.clone(DustShader.uniforms), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.dust = new THREE.Points(dg, this.dustMat); this.dust.frustumCulled = false; this.scene.add(this.dust);
    // 目标光点
    this.marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(glowCanvas()), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
    this.marker.scale.set(.2, .2, 1); this.marker.visible = false; this.scene.add(this.marker);
    this.fig = this.makeFigure(); this.fig.visible = false; this.scene.add(this.fig);
    this['build_' + name]();
    this.syncCamera();
  }
  setMarker(x, y, z) { if (x === null) { this.marker.visible = false; return; } this.marker.position.set(x, y, z); this.marker.visible = true; }

  box(w, h, d, mat, x, y, z, solid = false) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; this.scene.add(m); this.solids.push(m);
    if (solid) this.colliders.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 });
    return m;
  }
  // 放置一个扫描模型：h 指定目标高度（自动缩放），底部落在 y 上
  prop(id, { x = 0, y = 0, z = 0, ry = 0, h = null, s = 1, solid = false, ground = true } = {}) {
    const m = model(id);
    if (h) { const b = new THREE.Box3().setFromObject(m); s = h / (b.max.y - b.min.y); }
    m.scale.setScalar(s); m.rotation.y = ry; m.position.set(x, y, z);
    this.scene.add(m); m.updateMatrixWorld(true);
    let b = new THREE.Box3().setFromObject(m);
    if (ground) { m.position.y += y - b.min.y; m.updateMatrixWorld(true); b = new THREE.Box3().setFromObject(m); }
    if (solid) this.colliders.push({ x0: b.min.x, x1: b.max.x, z0: b.min.z, z1: b.max.z });
    return m;
  }
  // 从 (x, fromY, z) 垂直向下打一条射线，返回 target 上第一个朝上的表面高度
  surfaceY(target, x, z, fromY, fallback) {
    target.updateMatrixWorld(true);
    this.ray.set(new THREE.Vector3(x, fromY, z), new THREE.Vector3(0, -1, 0)); this.ray.far = 10;
    for (const h of this.ray.intersectObject(target, true)) {
      const n = h.face.normal.clone().transformDirection(h.object.matrixWorld);
      if (n.y > .5) return h.point.y;
    }
    return fallback;
  }
  // 把模型 id 放在 target 的表面上
  propOn(target, id, x, z, fromY, o = {}) {
    const y = this.surfaceY(target, x, z, fromY, null);
    return y === null ? null : this.prop(id, { ...o, x, y, z });
  }
  // 地板 + 天花板 + 四面墙（skip 中列出的墙不建）
  shell(x0, x1, z0, z1, h, floorId, wallId, ceilId, skip = '') {
    const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    this.bounds = { x0, x1, z0, z1 };
    this.box(w, .2, d, pbr(floorId, w / 2, d / 2), cx, -.1, cz);
    this.box(w, .2, d, pbr(ceilId, w / 2, d / 2), cx, h + .1, cz);
    if (!skip.includes('N')) this.box(w + .4, h, .2, pbr(wallId, w / 2, h / 2), cx, h / 2, z0 - .1);
    if (!skip.includes('S')) this.box(w + .4, h, .2, pbr(wallId, w / 2, h / 2), cx, h / 2, z1 + .1);
    if (!skip.includes('W')) this.box(.2, h, d, pbr(wallId, d / 2, h / 2), x0 - .1, h / 2, cz);
    if (!skip.includes('E')) this.box(.2, h, d, pbr(wallId, d / 2, h / 2), x1 + .1, h / 2, cz);
  }

  // 「它」：一尊戴冠、蒙面、缠着锁链的哥特石像（Poly Haven 扫描级模型，CC0）。
  // 它不会走——只会在你没看着的时候，换一个更近的位置。
  makeFigure() {
    const g = new THREE.Group(), m = model('gothic_statue');
    m.scale.setScalar(1.18);
    m.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.setHex(0xb8b4aa); o.material.envMapIntensity = .3; } });
    g.add(m);
    return g;
  }
  faceTo(obj, x, z) { obj.rotation.y = Math.atan2(x - obj.position.x, z - obj.position.z); }
  figDist() { return Math.hypot(this.fig.position.x - this.p.x, this.fig.position.z - this.p.z); }
  viewDot(x, y, z) {
    const d = new THREE.Vector3(x, y, z).sub(this.camera.position).normalize();
    return d.dot(this.camera.getWorldDirection(new THREE.Vector3()));
  }
  panOf(x, z) { const dx = x - this.p.x, dz = z - this.p.z, d = Math.hypot(dx, dz) || 1; return (dx * Math.cos(this.p.yaw) - dz * Math.sin(this.p.yaw)) / d; }

  // 脸贴脸跳吓
  async faceScare(ms = 600) {
    const p = this.p, f = this.fig;
    p.pitch = 0; this.lockLook = true;
    const sx = -Math.sin(p.yaw), sz = -Math.cos(p.yaw);
    f.visible = true; f.position.set(p.x + sx * .62, -.2, p.z + sz * .62); this.faceTo(f, p.x, p.z);
    const wasOff = this.lightOff; this.lightOff = true;      // 近距离关掉手电，只留一盏自下而上的弱光
    this.faceLight.intensity = 1.1; this.shake = ms / 1000;
    this.G.sfx.stinger();
    await this.G.wait(ms);
    this.faceLight.intensity = 0; this.lockLook = false; this.lightOff = wasOff;
  }

  // ---------- 每帧 ----------
  syncCamera() {
    const p = this.p, c = this.camera;
    let sx = 0, sy = 0;
    if (this.shake > 0) { sx = rnd(-.025, .025); sy = rnd(-.025, .025); }
    c.position.set(p.x + sx, 1.6 + Math.sin(p.bob * 2) * .028 + sy, p.z);
    c.rotation.set(p.pitch, p.yaw, this.shake > 0 ? rnd(-.03, .03) : 0);
    c.updateMatrixWorld();
  }
  collide() {
    const p = this.p, r = .3, b = this.bounds;
    p.x = clamp(p.x, b.x0 + r, b.x1 - r); p.z = clamp(p.z, b.z0 + r, b.z1 - r);
    for (const c of this.colliders) {
      const nx = clamp(p.x, c.x0, c.x1), nz = clamp(p.z, c.z0, c.z1), dx = p.x - nx, dz = p.z - nz, d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-8) { const d = Math.sqrt(d2); p.x = nx + dx / d * r; p.z = nz + dz / d * r; }
      else {
        const l = p.x - c.x0, rr = c.x1 - p.x, t = p.z - c.z0, bb = c.z1 - p.z, m = Math.min(l, rr, t, bb);
        if (m === l) p.x = c.x0 - r; else if (m === rr) p.x = c.x1 + r; else if (m === t) p.z = c.z0 - r; else p.z = c.z1 + r;
      }
    }
  }
  update(dt) {
    const G = this.G, I = G.input, p = this.p;
    this.t += dt;
    if (this.shake > 0) this.shake -= dt;
    const free = !G.busy && !G.talking;
    if (!this.lockLook) {
      const ty = (I.down('ArrowLeft') ? 1 : 0) - (I.down('ArrowRight') ? 1 : 0), tp = (I.down('ArrowUp') ? 1 : 0) - (I.down('ArrowDown') ? 1 : 0);
      p.yaw += ty * 2.4 * dt; p.pitch = clamp(p.pitch + tp * 1.4 * dt, -1.2, 1.2);
    }
    if (free && this.canMove) {
      const f = (I.down('KeyW') ? 1 : 0) - (I.down('KeyS') ? 1 : 0), s = (I.down('KeyD') ? 1 : 0) - (I.down('KeyA') ? 1 : 0);
      if (f || s) {
        const l = Math.hypot(f, s), sp = (I.down('ShiftLeft') || I.down('ShiftRight')) ? this.runSpeed : this.walkSpeed;
        const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
        p.x += (-sin * f + cos * s) / l * sp * dt; p.z += (-cos * f - sin * s) / l * sp * dt;
        const before = Math.floor(p.bob / Math.PI * 2);
        p.bob += dt * sp * 2.3;
        if (Math.floor(p.bob / Math.PI * 2) !== before) G.sfx.step(.22);
        this.collide();
      }
    }
    this.syncCamera();
    // 手电闪烁
    if (this.flickerT > 0) this.flickerT -= dt;
    const flick = this.flickerT > 0 ? Math.random() < .5 : this.weak && Math.random() < .12;
    this.flash.intensity = this.lightOff ? 0 : flick ? this.flashBase * rnd(0, .3) : this.flashBase;
    this.frame++;
    if (this.frame % 2 === 0) {
      this.ray.setFromCamera({ x: 0, y: .03 }, this.camera); this.ray.far = 14;
      const hit = this.ray.intersectObjects(this.solids, false)[0];
      if (hit) {
        const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
        this.bounceTo.copy(hit.point).addScaledVector(n, .35);
        this.bounceI = .075 / (1 + hit.distance * .22);
      } else this.bounceI = 0;
    }
    this.bounce.position.lerp(this.bounceTo, Math.min(1, dt * 10));
    this.bounce.intensity += (this.flash.intensity * this.bounceI - this.bounce.intensity) * Math.min(1, dt * 14);
    this.dustMat.uniforms.uCam.value.copy(this.camera.position);
    this.dustMat.uniforms.uTime.value = this.t;
    this.dustMat.uniforms.uFlash.value = this.dustOff ? 0 : Math.min(1, this.flash.intensity / 60) * .8;
    this.dustMat.uniforms.uScale.value = this.renderer.domElement.height;
    this.lens.uniforms.time.value = this.t % 100;
    if (this.tick) this.tick(dt);
    if (this.marker.visible) this.marker.material.opacity = .45 + Math.sin(this.t * 4) * .3;

    // 互动
    let best = null, bd = 1e9;
    if (free) for (const it of this.inter) {
      if (it.can && !it.can()) continue;
      const dx = it.x - p.x, dz = it.z - p.z, d = Math.hypot(dx, dz);
      if (d > (it.r || 1.7)) continue;
      const dot = (dx * -Math.sin(p.yaw) + dz * -Math.cos(p.yaw)) / (d || 1);
      if (dot < .55 && d > .5) continue;
      if (d < bd) { bd = d; best = it; }
    }
    if (best) {
      const label = typeof best.label === 'function' ? best.label() : best.label;
      G.ui.prompt((best.hold ? '按住 E ' : 'E ') + label);
      if (best.hold) {
        if (I.down('KeyE')) { this.holdT += dt; if (this.holdT >= best.hold) { this.holdT = 0; best.act(); } }
        else this.holdT = 0;
        G.ui.hold(this.holdT / best.hold);
      } else { G.ui.hold(0); if (I.pressed('KeyE')) best.act(); }
    } else { this.holdT = 0; G.ui.prompt(null); G.ui.hold(0); }
  }
  render() { this.composer.render(); }

  // =====================================================================
  //  卧室：窗外人影 / 自己摇的摇椅 / 断光后出现在门边
  // =====================================================================
  build_bedroom() {
    const s = this.scene, G = this.G, st = this.st, h = 2.6;
    s.fog = new THREE.FogExp2(0x020304, .12);
    s.add(new THREE.AmbientLight(0x8fa6ff, .04));
    this.shell(-2.5, 2.5, -2, 2, h, 'old_wood_floor', 'wood_plank_wall', 'dark_wooden_planks', 'E');
    this.p.x = -1.5; this.p.z = 1.3; this.p.yaw = -.5;
    // 东墙（带窗洞 z∈[-.3,.9], y∈[1,2]）
    const wm = (len, hh) => pbr('wood_plank_wall', len / 2, hh / 2);
    this.box(.2, 1.0, 4, wm(4, 1), 2.6, .5, 0); this.box(.2, h - 2 + .4, 4, wm(4, .6), 2.6, 2 + (h - 2 + .4) / 2, 0); this.box(1.2, .4, 5, flat(0x000000), 2.9, h + .2, 0);
    this.box(.2, 1.0, 1.7, wm(1.7, 1), 2.6, 1.5, -1.15); this.box(.2, 1.0, 1.1, wm(1.1, 1), 2.6, 1.5, 1.45);
    const fr = pbr('dark_wooden_planks', .5, .5);
    this.box(.26, .06, 1.32, fr, 2.6, 1.0, .3); this.box(.26, .06, 1.32, fr, 2.6, 2.0, .3);
    this.box(.26, 1.0, .06, fr, 2.6, 1.5, -.3); this.box(.26, 1.0, .06, fr, 2.6, 1.5, .9);
    this.box(.05, 1.0, .03, fr, 2.6, 1.5, .3); this.box(.05, .03, 1.2, fr, 2.6, 1.5, .3);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.0), new THREE.MeshPhysicalMaterial({ color: 0x8899aa, transparent: true, opacity: .04, roughness: .4, metalness: 0, depthWrite: false }));
    glass.position.set(2.62, 1.5, .3); glass.rotation.y = -Math.PI / 2; s.add(glass);
    // 窗外：雪夜背景 + 月光
    const back = new THREE.Mesh(new THREE.PlaneGeometry(14, 8), new THREE.MeshBasicMaterial({ color: 0x0a1322, fog: false }));
    back.position.set(7, 1.5, .3); back.rotation.y = -Math.PI / 2; s.add(back);
    const moon = new THREE.SpotLight(0x8fb0ff, 70, 14, .5, .5, 1.2);
    moon.position.set(6, 3.6, .9); moon.target.position.set(-1, 0, 0); moon.castShadow = true; moon.shadow.mapSize.set(1024, 1024); moon.shadow.bias = -.002;
    s.add(moon); s.add(moon.target);
    // 门（南墙）
    this.box(.95, 2.05, .07, pbr('dark_wooden_planks', .6, 1.2), -1.5, 1.02, 1.97);
    this.box(.05, .05, .06, flat(0xb89a50, { metal: .9, rough: .35 }), -1.15, 1.0, 1.92);
    // 天花板横梁、地毯
    for (const z of [-.9, .9]) this.box(5, .18, .2, pbr('dark_wooden_planks', 3, .2), 0, h - .09, z);
    this.box(1.9, .015, 1.3, pbr('dirty_carpet', 1.4, 1, { color: 0x6a5a4c }), -.1, .008, .3);
    // 家具（扫描模型）
    this.prop('GothicBed_01', { x: -1.72, z: -.95, solid: true });
    const base = pbr('dark_wooden_planks', 2.5, .1);                                    // 踢脚线
    this.box(5, .11, .03, base, 0, .055, -1.985); this.box(5, .11, .03, base, 0, .055, 1.985);
    this.box(.03, .11, 4, base, -2.485, .055, 0); this.box(.03, .11, 4, base, 2.485, .055, 0);
    const ns = this.prop('ClassicNightstand_01', { x: -.72, z: -1.72, solid: true });
    const lampY = this.surfaceY(ns, -.72, -1.72, 1.3, .7);
    const lampM = this.prop('vintage_oil_lamp', { x: -.72, y: lampY, z: -1.72, s: .7 });
    st.lamp = new THREE.PointLight(0xff9a3c, 1.1, 5, 1.6); st.lamp.position.set(-.72, lampY + .36, -1.72); s.add(st.lamp);
    st.lamp.castShadow = true; st.lamp.shadow.mapSize.set(512, 512); st.lamp.shadow.bias = -.004; st.lamp.shadow.radius = 4;
    const dr = this.prop('vintage_wooden_drawer_01', { x: .5, z: 1.62, ry: Math.PI, s: .7, solid: true });   // 斗柜
    this.propOn(dr, 'brass_candleholders', .3, 1.66, 1.6, { ry: Math.PI, s: .55 });
    this.propOn(dr, 'book_encyclopedia_set_01', .82, 1.68, 1.6, { ry: Math.PI + .2 });
    st.lampM = lampM;
    this.prop('vintage_grandfather_clock_01', { x: -2.25, z: .75, ry: Math.PI / 2, solid: true });
    const pic = this.prop('hanging_picture_frame_01', { x: -2.48, z: -.9, ry: Math.PI / 2, ground: false }); pic.position.y = 1.75;
    // 衣柜（上层两扇门可开）
    const wx = 1.25, cab = this.prop('GothicCabinet_01', { x: wx, z: -1.52 });
    this.colliders.push({ x0: wx - .88, x1: wx + .88, z0: -2, z1: -1.0 });
    st.doors = [];
    cab.traverse((o) => { if (/door1$|door2$/.test(o.name)) st.doors.push({ o, rest: o.rotation.y, dir: o.position.x < 0 ? -1 : 1 }); });
    const tinY = this.surfaceY(cab, wx, -1.5, 2.0, 1.36);
    const tin = this.box(.26, .12, .18, pbr('rusty_metal_02', .5, .3, { metal: .2, color: 0x8a8a8a }), wx, tinY + .06, -1.5);
    // 摇椅
    const chair = st.chair = new THREE.Group(), rock = st.rock = new THREE.Group(); chair.add(rock);
    const cm = model('Rockingchair_01'); cm.position.y = -.1; rock.add(cm);
    chair.position.set(1.65, 0, 1.25); chair.rotation.y = -2.3; s.add(chair);
    this.colliders.push({ x0: 1.3, x1: 2.0, z0: .9, z1: 1.6 });
    // 窗外的东西
    const fig = this.fig; fig.visible = true; fig.position.set(3.2, -.2, .3); fig.rotation.y = -Math.PI / 2;
    Object.assign(st, { winFig: true, look: 0, open: false, doorA: 0, rocking: false, creakT: 0, roomFig: false });

    this.setMarker(wx, 1.6, -.98);
    this.inter.push(
      { x: wx, z: -1.0, label: '打开衣柜', can: () => !st.open, act: () => { st.open = true; G.sfx.creak(.5, 0, 1.1); st.rocking = true; this.setMarker(wx, 1.5, -1.5); } },
      { x: wx, z: -1.0, label: '拿取保险丝', can: () => st.open && st.doorA > 1.4 && !G.has.fuse, act: () => this.bedroomTakeFuse(tin) },
      { x: -1.5, z: 1.95, label: '离开卧室', can: () => G.has.fuse && !st.dark, act: () => G.story.leaveBedroom() },
    );

    this.tick = (dt) => {
      if (st.lamp.intensity > 0) st.lamp.intensity = 1.1 + Math.sin(this.t * 11) * .08 + Math.sin(this.t * 23) * .05;
      // 衣柜门
      if (st.open && st.doorA < 1.75) { st.doorA = Math.min(1.75, st.doorA + dt * 1.8); for (const d of st.doors) d.o.rotation.y = d.rest + d.dir * st.doorA; }
      // 窗外人影：直视片刻就消失
      if (st.winFig) {
        if (this.viewDot(3.2, 1.75, .3) > .93 && !this.lightOff) st.look += dt; else st.look = Math.max(0, st.look - dt);
        if (st.look > .5) { st.winFig = false; fig.visible = false; G.sfx.thump(.7, this.panOf(3, .3)); this.flickerT = .25; }
      }
      // 摇椅：背对它时自己摇，盯着看就停
      if (st.rocking) {
        rock.rotation.x = Math.sin(this.t * 2.6) * .12;
        st.creakT -= dt;
        if (st.creakT <= 0) { st.creakT = 1.2; G.sfx.creak(.3, this.panOf(1.65, 1.25), .7); }
        if (this.viewDot(1.65, .7, 1.25) > .82) { st.look2 = (st.look2 || 0) + dt; if (st.look2 > .4) { st.rocking = false; st.stopT = .25; } }
      } else if (st.stopT > 0) { st.stopT -= dt; rock.rotation.x *= .7; }
      // 门边的人影
      if (st.roomFig) {
        if (this.viewDot(fig.position.x, 1.8, fig.position.z) > .78) st.seen += dt;
        if (st.seen > .55 || this.figDist() < 1.3) {
          st.roomFig = false; G.sfx.stinger(.45);
          this.lightOff = true;
          G.wait(380).then(() => { fig.visible = false; this.lightOff = false; this.flickerT = .5; });
        }
      }
    };
  }
  async bedroomTakeFuse(tin) {
    const G = this.G, st = this.st;
    G.has.fuse = true; tin.visible = false; G.sfx.clunk(); st.dark = true;
    this.setMarker(null);
    await G.wait(500);
    this.lightOff = true; st.lamp.intensity = 0; G.sfx.slam(this.panOf(-1.5, 2));     // 手电和油灯一起灭
    st.lampM.traverse((o) => { if (/flame/.test(o.name)) o.visible = false; });
    st.rocking = false; st.rock.rotation.x = 0;
    await G.wait(1500);
    // 灯回来时：它站在门边，摇椅转过来对着你
    st.winFig = false;
    this.fig.visible = true; this.fig.position.set(-.95, 0, 1.2); this.faceTo(this.fig, this.p.x, this.p.z);
    this.faceTo(st.chair, this.p.x, this.p.z);
    st.seen = 0; st.roomFig = true;
    this.lightOff = false; this.flickerT = .4; st.dark = false;
    G.ui.objective('离开卧室', '门在你身后');
    this.setMarker(-1.15, 1.0, 1.88);
  }

  // =====================================================================
  //  地下室：手电失灵 / 「不看它就靠近」的电闸小游戏 / 假安全 / 追逐
  // =====================================================================
  build_cellar() {
    const s = this.scene, G = this.G, st = this.st, h = 2.6;
    s.fog = new THREE.FogExp2(0x010101, .15);
    s.add(new THREE.AmbientLight(0x666677, .025));
    this.shell(-1.8, 1.8, -5, 4.6, h, 'concrete_floor_worn_001', 'cracked_concrete_wall', 'dark_wooden_planks', '');
    s.traverse((o) => { if (o.isMesh && o.material.map && /concrete/.test(o.material.map.source?.data?.src || '')) o.material.color.setHex(0xa8a8a8); });
    this.p.x = 0; this.p.z = 3.9; this.p.yaw = 0;
    for (const z of [-3.6, -1.2, 1.2, 3.4]) this.box(3.6, .2, .16, pbr('dark_wooden_planks', 2, .2), 0, h - .1, z);
    // 楼梯 + 铁门
    for (let i = 0; i < 3; i++) this.box(1.1, .2 * (i + 1), .25, pbr('dark_wooden_planks', .6, .2), 0, .1 * (i + 1), 4.45 + i * .25);
    this.box(.95, 2.0, .06, pbr('rusty_metal_02', .6, 1.2, { metal: .6 }), 0, 1.3, 4.58);
    // 货架与杂物（扫描模型）
    const sh1 = this.prop('steel_frame_shelves_01', { x: -1.5, z: 1.8, ry: Math.PI / 2, h: 2.0, solid: true });
    const sh2 = this.prop('steel_frame_shelves_01', { x: 1.5, z: .2, ry: -Math.PI / 2, h: 2.0, solid: true });
    const sh3 = this.prop('steel_frame_shelves_01', { x: -1.5, z: -2.2, ry: Math.PI / 2, h: 2.0, solid: true });
    // 每层搁板的高度靠射线探测，避免物件悬空
    const put = (shelf, id, x, z, from, o) => this.propOn(shelf, id, x, z, from, o);
    put(sh1, 'cardboard_box_01', -1.5, 1.5, 1.2, { ry: 1.7 }); put(sh1, 'wine_bottles_01', -1.52, 2.1, 1.2, { ry: Math.PI / 2 });
    put(sh1, 'plastic_bottle_gallon', -1.5, 2.0, .7, { ry: .4 }); put(sh1, 'plastic_bottle_gallon', -1.48, 1.75, .7, { ry: 2 }); put(sh1, 'metal_toolbox', -1.5, 1.6, 1.75, { ry: 1.5 });
    put(sh2, 'wooden_bucket_01', 1.5, -.2, .7, { s: .8 }); put(sh2, 'cardboard_box_01', 1.5, .6, 1.2, { ry: -1.5 }); put(sh2, 'book_encyclopedia_set_01', 1.52, .1, 1.2, { ry: -Math.PI / 2 });
    put(sh2, 'wine_bottles_01', 1.52, .2, 1.75, { ry: -Math.PI / 2 }); put(sh2, 'plastic_bottle_gallon', 1.5, .75, .7, { ry: 1 });
    put(sh3, 'cardboard_box_01', -1.5, -2.5, .7, { ry: 1.4 }); put(sh3, 'wooden_bucket_01', -1.5, -1.9, 1.2, { s: .7 }); put(sh3, 'wine_bottles_01', -1.52, -2.3, 1.75, { ry: Math.PI / 2 });
    const mask = this.prop('old_gas_mask', { x: -1.76, y: 1.2, z: 3.9, ry: Math.PI / 2, s: .75, ground: false });        // 挂在楼梯边墙上的旧防毒面具
    this.prop('wooden_crate_02', { x: 1.42, z: 3.2, ry: .2, solid: true });
    this.prop('wooden_crate_02', { x: 1.45, y: .45, z: 3.15, ry: 1.4, s: .8 });
    this.prop('Barrel_01', { x: 1.42, z: -2.6, solid: true });
    this.prop('Barrel_01', { x: 1.38, z: -3.3, ry: 1, solid: true });
    this.prop('Barrel_01', { x: -1.4, z: -4.45, ry: 2, solid: true });
    this.prop('cardboard_box_01', { x: -1.4, z: -.4, ry: .5, s: 1.3 });
    this.prop('cardboard_box_01', { x: -1.45, z: 3.6, ry: -.3, s: 1.3 });
    this.prop('wooden_bucket_01', { x: 1.35, z: 2.1, ry: -1.2 });
    // 电箱 + 电闸面板
    this.prop('power_box_01', { x: -.42, y: 1.45, z: -4.94, s: 1.3, ground: false });
    const bx = .28;
    this.box(.5, .62, .07, pbr('rusty_metal_02', .5, .6, { metal: .7 }), bx, 1.42, -4.96);
    st.levers = []; st.lamps = [];
    for (let i = 0; i < 3; i++) {
      const x = bx - .14 + i * .14;
      this.box(.05, .2, .02, flat(0x0c0c0c, { rough: .6, metal: .5 }), x, 1.36, -4.915);
      const piv = new THREE.Group(); piv.position.set(x, 1.36, -4.9); piv.rotation.x = .9; s.add(piv);
      const l = new THREE.Mesh(new THREE.CylinderGeometry(.012, .012, .13, 8), flat(0x777777, { rough: .3, metal: 1 })); l.position.y = .065; piv.add(l);
      const k = new THREE.Mesh(new THREE.SphereGeometry(.024, 10, 8), flat(0x101010, { rough: .35 })); k.position.y = .13; piv.add(k);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(.016, 8, 8), new THREE.MeshBasicMaterial({ color: 0x660000 })); lamp.position.set(x, 1.63, -4.92); s.add(lamp);
      st.levers.push(piv); st.lamps.push(lamp);
    }
    // 吊灯
    st.bulbs = [];
    for (const z of [1.6, -2.6]) {
      const lm = this.prop('hanging_industrial_lamp', { x: 0, y: h, z, s: .5, ground: false });
      lm.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.emissiveIntensity = 0; st.lampMats = (st.lampMats || []).concat(o.material); } });
      const b = new THREE.Mesh(new THREE.SphereGeometry(.035, 12, 10), new THREE.MeshBasicMaterial({ color: 0x15130c })); b.position.set(0, h - .62, z); s.add(b);
      const l = new THREE.PointLight(0xffd9a0, 0, 12, 1.5); l.position.set(0, h - .72, z); l.castShadow = true; l.shadow.mapSize.set(512, 512); l.shadow.bias = -.003; s.add(l);
      st.bulbs.push({ b, l });
    }
    // 墙上的手印（来电后才看得见）
    st.hands = new THREE.Group(); st.hands.visible = false; s.add(st.hands);
    const hm = new THREE.MeshStandardMaterial({ map: handprint(), transparent: true, depthWrite: false, opacity: 1, roughness: .95, polygonOffset: true, polygonOffsetFactor: -2, side: THREE.DoubleSide });
    for (let i = 0; i < 46; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(.25, .34), hm), side = i % 3;
      if (side === 0) { m.position.set(-1.795, rnd(.3, 2.2), rnd(-4.8, 4.2)); m.rotation.y = Math.PI / 2; }
      else if (side === 1) { m.position.set(1.795, rnd(.3, 2.2), rnd(-4.8, 4.2)); m.rotation.y = -Math.PI / 2; }
      else { m.position.set(rnd(-1.6, 1.6), rnd(.3, 2.3), -4.995); if (Math.abs(m.position.x) < .7 && m.position.y > .9 && m.position.y < 1.9) m.position.y = rnd(2.0, 2.4); }
      m.rotateZ(rnd(-1.2, 1.2)); m.scale.set((Math.random() < .5 ? -1 : 1) * rnd(.9, 1.15), rnd(.9, 1.15), 1); st.hands.add(m);   // 随机镜像成左右手
    }
    st.exitGlow = new THREE.PointLight(0xff2a1a, 0, 7, 1.5); st.exitGlow.position.set(0, 2.2, 4.2); s.add(st.exitGlow);

    Object.assign(st, { phase: 'walk', n: 0, e1: false, e2: false, stalk: false, respawn: 0, ban: 0, stepT: 0, beatT: 0 });
    this.setMarker(bx, 1.45, -4.86);

    this.inter.push(
      { x: bx, z: -4.9, r: 1.5, label: '装上保险丝', can: () => st.phase === 'walk', act: () => this.cellarFuse() },
      { x: bx, z: -4.9, r: 1.5, hold: 2.3, label: () => `扳起电闸（${st.n}/3）`, can: () => st.phase === 'breakers', act: () => this.cellarBreaker() },
    );

    this.tick = (dt) => {
      const p = this.p, fig = this.fig;
      if (!st.e1 && p.z < 1.4) { st.e1 = true; this.flickerT = 1.1; G.sfx.crash(this.panOf(1.5, 3.5)); }
      if (!st.e2 && p.z < -2.2) { st.e2 = true; G.sfx.knock(4, { vol: .7, gap: .5 }); }
      if (G.busy || G.talking) return;
      const beat = () => { st.beatT -= dt; if (st.beatT <= 0 && fig.visible) { const d = this.figDist(); st.beatT = clamp(d / 5, .35, 1.1); G.sfx.heartbeat(clamp(1.1 - d / 8, .15, .9)); } };

      if (st.phase === 'breakers') {
        if (!st.stalk) { st.respawn -= dt; if (st.respawn <= 0) { st.stalk = true; st.ban = 0; fig.visible = true; fig.position.set(rnd(-.7, .7), 0, 4.0); this.faceTo(fig, p.x, p.z); } }
        else {
          const dot = this.viewDot(fig.position.x, 1.7, fig.position.z), d = this.figDist();
          if (dot > .6 && !this.lightOff) {             // 被看着：不动；被手电照住 1 秒：退散
            if (dot > .85) { st.ban += dt; if (st.ban > 1.0) { st.stalk = false; st.respawn = 2.4; fig.visible = false; G.sfx.hiss(this.panOf(fig.position.x, fig.position.z)); this.flickerT = .3; } }
          } else {
            st.ban = 0;
            const dx = p.x - fig.position.x, dz = p.z - fig.position.z;
            fig.position.x += dx / d * 1.45 * dt; fig.position.z += dz / d * 1.45 * dt; this.faceTo(fig, p.x, p.z);
            st.stepT -= dt; if (st.stepT <= 0) { st.stepT = .5; G.sfx.step(clamp(1.0 - d / 10, .15, .9), this.panOf(fig.position.x, fig.position.z)); }
          }
          beat();
          if (d < .95) this.cellarDeath('你没有回头。', () => { st.n = 0; this.cellarLevers(); st.stalk = false; st.respawn = 3; p.x = bx; p.z = -4.0; p.yaw = 0; });
        }
      } else if (st.phase === 'chase') {
        st.delay -= dt;
        if (st.delay <= 0) {
          const dx = p.x - fig.position.x, dz = p.z - fig.position.z, d = Math.hypot(dx, dz);
          fig.position.x += dx / d * 2.45 * dt; fig.position.z += dz / d * 2.45 * dt; this.faceTo(fig, p.x, p.z);
          st.stepT -= dt; if (st.stepT <= 0) { st.stepT = .26; G.sfx.step(clamp(1.1 - d / 9, .2, 1), this.panOf(fig.position.x, fig.position.z)); }
          beat();
          if (d < .9) this.cellarDeath('它追上了你。', () => { p.x = 0; p.z = -2.4; p.yaw = Math.PI; fig.visible = true; fig.position.set(0, 0, -4.7); st.delay = 1.0; });
        }
        if (p.z > 3.7) { st.phase = 'out'; G.story.leaveCellar(); }
      }
    };
  }
  cellarLevers() { const st = this.st; st.levers.forEach((l, i) => { l.rotation.x = i < st.n ? -.9 : .9; }); st.lamps.forEach((l, i) => l.material.color.setHex(i < st.n ? 0x22ff44 : 0x660000)); }
  async cellarFuse() {
    const G = this.G, st = this.st;
    st.phase = 'pre'; G.sfx.clunk();
    await G.say(['保险丝装上了。还得把三个电闸一个个扳上去。', '……身后有脚步声。', '别慌。手电照着它的时候，它不会动。']);
    st.phase = 'breakers'; st.respawn = 1.2;
    G.ui.objective('按住 E 扳起三个电闸', '听到脚步声就回头，用手电照住它');
  }
  cellarBreaker() {
    const st = this.st;
    st.n++; this.cellarLevers(); this.G.sfx.clunk();
    if (st.n >= 3) this.cellarPowerOn();
  }
  async cellarPowerOn() {
    const G = this.G, st = this.st, p = this.p;
    st.phase = 'lit'; st.stalk = false; this.fig.visible = false; this.setMarker(null);
    G.ui.objective('……', '');
    for (const { b, l } of st.bulbs) { b.material.color.setHex(0xfff0c8); l.intensity = 9; }
    for (const m of st.lampMats) m.emissiveIntensity = 2;
    G.sfx.hum(true); G.sfx.setDrone(.1); st.hands.visible = true;
    await G.wait(2600);
    await G.say(['有电了。', '……等等。', '墙上这些手印，刚才有吗？']);
    await G.wait(500);
    G.sfx.pop(); G.sfx.hum(false); G.sfx.setDrone(.8);
    for (const { b, l } of st.bulbs) { b.material.color.setHex(0x15130c); l.intensity = 0; }
    for (const m of st.lampMats) m.emissiveIntensity = 0;
    this.flashBase = 28; this.weak = true; st.exitGlow.intensity = 5;
    await G.wait(700);
    this.fig.visible = true; this.fig.position.set(p.x > 0 ? -1.1 : 1.1, 0, Math.max(-4.6, p.z - 4)); this.faceTo(this.fig, p.x, p.z);
    G.sfx.stinger(.6);
    st.delay = .9; st.phase = 'chase';
    G.ui.objective('跑！回到楼上！', '按住 Shift 奔跑 · 朝红光的方向');
    this.setMarker(0, 1.2, 4.5);
  }
  async cellarDeath(text, reset) {
    const G = this.G;
    if (G.busy) return;
    G.busy = true;
    await this.faceScare(650);
    await G.ui.fade(1, 60);
    this.fig.visible = false;
    await G.ui.center(text, 1700);
    reset(); this.p.pitch = 0; this.holdT = 0;
    await G.ui.fade(0, 600);
    G.busy = false;
  }

  // =====================================================================
  //  走廊：仅用于 2D 中的「强制切 3D」闪现
  // =====================================================================
  build_hall() {
    this.scene.fog = new THREE.FogExp2(0x000000, .2);
    this.scene.add(new THREE.AmbientLight(0x8899bb, .04));
    this.shell(-.8, .8, -6, 1.5, 2.5, 'old_wood_floor', 'wood_plank_wall', 'dark_wooden_planks');
    this.p.x = 0; this.p.z = 0; this.p.yaw = 0; this.canMove = false;
  }

  // =====================================================================
  //  结局：冲出门外 → 门自己关上并反锁 → 你亲手敲了四下
  // =====================================================================
  build_porch() {
    const s = this.scene, G = this.G, st = this.st;
    s.background = new THREE.Color(0x060a11);
    s.fog = new THREE.FogExp2(0x060a11, .06);
    s.add(new THREE.AmbientLight(0x7f97c8, .2));
    const moon = new THREE.DirectionalLight(0x9fb8ff, .9); moon.position.set(-5, 9, -9); s.add(moon);
    this.bounds = { x0: -1, x1: 1, z0: -2.6, z1: -1.2 }; this.canMove = false; this.dustOff = true;
    this.p.x = 0; this.p.z = -2.2; this.p.yaw = Math.PI;           // 站在门外，面朝屋门
    const wall = (len, hh) => pbr('wood_plank_wall', len / 2, hh / 2), dark = (rx, ry) => pbr('dark_wooden_planks', rx, ry);
    // 门里的玄关（门关上之前能看到一瞬）
    this.box(2.6, .2, 3.2, pbr('old_wood_floor', 1.3, 1.6), 0, -.1, 1.7); this.box(2.6, .2, 3.2, dark(1.3, 1.6), 0, 2.6, 1.7);
    this.box(.2, 2.5, 3.2, wall(3.2, 2.5), -1.3, 1.25, 1.7); this.box(.2, 2.5, 3.2, wall(3.2, 2.5), 1.3, 1.25, 1.7);
    this.box(2.6, 2.5, .2, wall(2.6, 2.5), 0, 1.25, 3.4);
    // 木屋正面：门两侧的墙，左手边（厨房那一侧）有一扇窗
    this.box(5.5, 3.3, .2, wall(5.5, 3.3), -3.25, 1.65, 0);
    this.box(.65, 3.3, .2, wall(.65, 3.3), .825, 1.65, 0); this.box(3.65, 3.3, .2, wall(3.65, 3.3), 4.175, 1.65, 0);
    this.box(1.2, 1.1, .2, wall(1.2, 1.1), 1.75, .55, 0); this.box(1.2, 1.3, .2, wall(1.2, 1.3), 1.75, 2.65, 0);
    this.box(1.0, 1.2, .2, wall(1, 1.2), 0, 2.7, 0);
    const fr = dark(.5, .5);
    this.box(1.3, .07, .26, fr, 1.75, 1.1, 0); this.box(1.3, .07, .26, fr, 1.75, 2.0, 0); this.box(.07, .9, .26, fr, 1.15, 1.55, 0); this.box(.07, .9, .26, fr, 2.35, 1.55, 0);
    this.box(.04, .9, .05, fr, 1.75, 1.55, -.08); this.box(1.2, .04, .05, fr, 1.75, 1.55, -.08);
    st.pane = new THREE.Mesh(new THREE.PlaneGeometry(1.2, .9), new THREE.MeshBasicMaterial({ color: 0x030508, fog: false }));
    st.pane.position.set(1.75, 1.55, .05); st.pane.rotation.y = Math.PI; s.add(st.pane);
    st.glow = new THREE.PointLight(0xffb060, 0, 5, 1.8); st.glow.position.set(1.75, 1.5, -.5); s.add(st.glow);
    for (const x of [-.56, .56]) this.box(.1, 2.2, .26, fr, x, 1.1, 0);                 // 门框
    this.box(1.22, .1, .26, fr, 0, 2.15, 0);
    // 门廊：木地板、柱子、屋檐
    this.box(5, .12, 2.4, pbr('old_wood_floor', 2.5, 1.2), 0, -.04, -1.2);
    for (const x of [-2.3, 2.3]) this.box(.15, 3.2, .15, fr, x, 1.6, -2.3);
    this.box(12, .16, 2.9, dark(6, 1.4), 0, 3.3, -1.2);
    this.prop('Barrel_01', { x: -1.5, z: -.45 }); this.prop('wooden_crate_02', { x: 3.9, z: -.5, ry: .3 });
    // 屋门：铰链在一侧，开场时向屋里敞开
    const piv = st.door = new THREE.Group(); piv.position.set(-.5, 1.05, .02); piv.rotation.y = -1.35; s.add(piv);
    const slab = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.1, .06), dark(.6, 1.2)); slab.position.x = .5; slab.castShadow = slab.receiveShadow = true; piv.add(slab);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(.035, 12, 10), flat(0xb89a50, { metal: .9, rough: .35 })); knob.position.set(.9, -.05, -.06); piv.add(knob);
    this.solids.push(slab);
    // 它站在玄关里，没有跟出来
    this.fig.visible = true; this.fig.position.set(0, 0, 2.3); this.fig.rotation.y = Math.PI;
    // 雪地、树、通向屋门的脚印
    const snow = new THREE.Mesh(new THREE.PlaneGeometry(90, 70), pbr('snow_02', 34, 26)); snow.rotation.x = -Math.PI / 2; snow.position.set(0, -.12, -30); snow.receiveShadow = true; s.add(snow);
    const tm = flat(0x04070a, { rough: 1 });
    for (let i = 0; i < 70; i++) {
      const x = rnd(-26, 26), z = rnd(-44, -7), hh = rnd(5, 10), r0 = rnd(1.1, 1.8);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.1, .16, hh * .5, 6), tm); trunk.position.set(x, hh * .25, z); s.add(trunk);
      for (let k = 0; k < 4; k++) { const c = new THREE.Mesh(new THREE.ConeGeometry(r0 * (1 - k * .2), hh * .34, 8), tm); c.position.set(x, hh * (.38 + k * .17), z); s.add(c); }
    }
    const wet = new THREE.MeshBasicMaterial({ color: 0x0a0705, transparent: true, opacity: .75 });
    for (let i = 0; i < 6; i++) { const f = new THREE.Mesh(new THREE.CircleGeometry(.1, 10), wet); f.rotation.x = -Math.PI / 2; f.scale.set(.8, 1.7, 1); f.position.set((i % 2 ? .13 : -.13), .025, -2.3 + i * .4); s.add(f); }
    const N = 2200, pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { pos[i * 3] = rnd(-9, 9); pos[i * 3 + 1] = rnd(0, 7); pos[i * 3 + 2] = rnd(-16, -2.6); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    s.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xdde6f5, size: .04, transparent: true, opacity: .8 })));

    Object.assign(st, { closed: false, slamAt: this.t + 2.7, stage: -1, n: 0, lit: false });
    this.inter.push({ x: 0, z: 0, r: 3, label: () => (st.stage === 0 ? '开门' : '敲门'), can: () => st.stage === 0 || st.stage === 1, act: () => this.porchDoor() });

    this.tick = (dt) => {
      for (let i = 0; i < N; i++) { pos[i * 3 + 1] -= dt * 1.1; pos[i * 3] += dt * .5; if (pos[i * 3 + 1] < 0) { pos[i * 3 + 1] = 7; pos[i * 3] = rnd(-9, 9); } }
      geo.attributes.position.needsUpdate = true;
      // 门自己甩上
      if (!st.closed && this.t > st.slamAt) {
        piv.rotation.y = Math.min(0, piv.rotation.y + dt * 9);
        if (piv.rotation.y >= 0) { st.closed = true; this.fig.visible = false; this.shake = .25; G.sfx.slam(); }
      }
      // 屋里有人打着手电——窗户亮了
      if (st.lit) {
        const k = .55 + Math.sin(this.t * 5.3) * .2 + Math.sin(this.t * 13.1) * .12;
        st.pane.material.color.setRGB(1.0 * k, .62 * k, .28 * k); st.glow.intensity = 2.2 * k;
      }
    };
  }
  async porchEnding() {
    const G = this.G, st = this.st;
    while (!st.closed) await G.wait(100);
    await G.wait(1100);
    await G.say(['……门自己关上了。', '它没有跟出来。', '可是手机、车钥匙……全都在屋里。']);
    st.stage = 0;
    G.ui.objective('回屋里去', 'E 开门');
    this.setMarker(.4, 1.0, -.1);
  }
  async porchDoor() {
    const G = this.G, st = this.st;
    if (st.stage === 0) {
      st.stage = -1; G.sfx.clunk(); G.wait(180).then(() => G.sfx.clunk()); this.shake = .06;
      await G.wait(500);
      await G.say(['锁上了。', '……是从里面锁上的。', '里面要是还有别人——爷爷说过，敲三下的是人。']);
      st.stage = 1; G.ui.objective('敲门', 'E 敲门');
      return;
    }
    st.n++; st.stage = -1;
    G.sfx.knock(1, { vol: 1.35 }); this.shake = .07;
    if (st.n < 3) { await G.wait(330); st.stage = 1; return; }
    if (st.n === 3) {
      await G.wait(1900);
      await G.say(['……没有人应。']);
      st.stage = 1;                         // 提示还在——第四下，由玩家自己敲
      return;
    }
    // 第四下
    G.busy = true; this.lockLook = true;
    G.ui.objective(null); G.ui.prompt(null); this.setMarker(null);
    G.sfx.setWind(.08); G.sfx.setDrone(0);
    await G.wait(1700);
    st.lit = true;                          // 窗户里亮起手电的光
    await G.wait(900);
    await G.caption('……敲门声？', '屋里传来', 2300);
    G.story.loopReplay();
  }
}
