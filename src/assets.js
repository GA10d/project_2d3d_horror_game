// 素材加载：Poly Haven 的 CC0 扫描模型（glTF）与 PBR 贴图
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const MODELS = ['Rockingchair_01', 'GothicBed_01', 'GothicCabinet_01', 'ClassicNightstand_01', 'vintage_oil_lamp', 'hanging_picture_frame_01',
  'vintage_grandfather_clock_01', 'steel_frame_shelves_01', 'wooden_crate_02', 'Barrel_01', 'power_box_01', 'hanging_industrial_lamp',
  'cardboard_box_01', 'metal_toolbox', 'marble_bust_01', 'wine_bottles_01', 'wooden_bucket_01', 'book_encyclopedia_set_01',
  'vintage_wooden_drawer_01', 'old_gas_mask', 'brass_candleholders', 'plastic_bottle_gallon', 'gothic_statue'];
export const TEXTURES = ['old_wood_floor', 'wood_plank_wall', 'dark_wooden_planks', 'concrete_floor_worn_001', 'cracked_concrete_wall', 'snow_02', 'dirty_carpet', 'rusty_metal_02'];

const models = {}, tex = {};
let handTex = null;

// 真实的墨印手印（Henri Guérard《艺术家的左手》，1890 年代，美国国家美术馆，CC0）。
// 原图是印在牛皮纸上的黑色墨迹：把纸的部分抠成透明，只留下墨迹，并染成深红的血色当贴花。
function makeHandprint(img) {
  const sx = 150, sy = 80, sw = 1060, sh = 1440, c = document.createElement('canvas');
  c.width = sw; c.height = sh;
  const x = c.getContext('2d');
  x.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  const d = x.getImageData(0, 0, sw, sh), p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    const lum = (p[i] * .299 + p[i + 1] * .587 + p[i + 2] * .114) / 255;
    const a = Math.max(0, Math.min(1, (.5 - lum) / .28));
    // 干涸的血色：墨越浓的地方越暗红，边缘淡处偏亮一点
    p[i] = 96 - a * 38; p[i + 1] = 6; p[i + 2] = 5; p[i + 3] = a * 255;
  }
  x.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
export const handprint = () => handTex;

export async function loadAssets(onProgress) {
  const total = MODELS.length + TEXTURES.length * 4 + 1;
  let n = 0;
  const tick = () => onProgress(++n, total);
  const gl = new GLTFLoader(), tl = new THREE.TextureLoader();
  await Promise.all([
    ...MODELS.map((id) => gl.loadAsync(`./assets/models/${id}/${id}.gltf`).then((g) => { models[id] = g.scene; tick(); })),
    tl.loadAsync('./assets/decals/handprint.jpg').then((t) => { handTex = makeHandprint(t.image); tick(); }),
    ...TEXTURES.flatMap((id) => ['diff', 'nor', 'rough', 'ao'].map((k) => tl.loadAsync(`./assets/textures/${id}/${k}.jpg`).then((t) => { (tex[id] ??= {})[k] = t; tick(); }))),
  ]);
}

// 平铺 PBR 材质（rx, ry 为重复次数）
export function pbr(id, rx = 1, ry = 1, o = {}) {
  const mk = (k, srgb) => {
    const t = tex[id][k].clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry);
    if (o.rot) { t.center.set(.5, .5); t.rotation = o.rot; }
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8; t.needsUpdate = true;
    return t;
  };
  return new THREE.MeshStandardMaterial({ map: mk('diff', true), normalMap: mk('nor'), roughnessMap: mk('rough'), aoMap: mk('ao'), aoMapIntensity: 1, color: o.color ?? 0xffffff, metalness: o.metal ?? 0 });
}

export function model(id) {
  const m = models[id].clone(true);
  m.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
  return m;
}
