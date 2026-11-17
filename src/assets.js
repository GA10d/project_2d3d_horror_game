// 素材加载：Poly Haven 的 CC0 扫描模型（glTF）与 PBR 贴图
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const MODELS = ['Rockingchair_01', 'GothicBed_01', 'GothicCabinet_01', 'ClassicNightstand_01', 'vintage_oil_lamp', 'hanging_picture_frame_01',
  'vintage_grandfather_clock_01', 'steel_frame_shelves_01', 'wooden_crate_02', 'Barrel_01', 'power_box_01', 'hanging_industrial_lamp',
  'cardboard_box_01', 'metal_toolbox', 'marble_bust_01'];
export const TEXTURES = ['old_wood_floor', 'wood_plank_wall', 'dark_wooden_planks', 'concrete_floor_worn_001', 'cracked_concrete_wall', 'snow_02', 'dirty_carpet', 'rusty_metal_02'];

const models = {}, tex = {};

export async function loadAssets(onProgress) {
  const total = MODELS.length + TEXTURES.length * 3;
  let n = 0;
  const tick = () => onProgress(++n, total);
  const gl = new GLTFLoader(), tl = new THREE.TextureLoader();
  await Promise.all([
    ...MODELS.map((id) => gl.loadAsync(`./assets/models/${id}/${id}.gltf`).then((g) => { models[id] = g.scene; tick(); })),
    ...TEXTURES.flatMap((id) => ['diff', 'nor', 'rough'].map((k) => tl.loadAsync(`./assets/textures/${id}/${k}.jpg`).then((t) => { (tex[id] ??= {})[k] = t; tick(); }))),
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
  return new THREE.MeshStandardMaterial({ map: mk('diff', true), normalMap: mk('nor'), roughnessMap: mk('rough'), color: o.color ?? 0xffffff, metalness: o.metal ?? 0 });
}

export function model(id) {
  const m = models[id].clone(true);
  m.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
  return m;
}
