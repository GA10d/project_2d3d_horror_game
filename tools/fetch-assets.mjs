// 从 Poly Haven（全部 CC0）下载本项目用到的模型与 PBR 贴图： node tools/fetch-assets.mjs
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', 'assets');
const UA = { 'User-Agent': 'asset-fetcher/1.0' };
const MODELS = ['Rockingchair_01', 'GothicBed_01', 'GothicCabinet_01', 'ClassicNightstand_01', 'vintage_oil_lamp', 'hanging_picture_frame_01',
  'vintage_grandfather_clock_01', 'steel_frame_shelves_01', 'wooden_crate_02', 'Barrel_01', 'power_box_01', 'hanging_industrial_lamp',
  'cardboard_box_01', 'metal_toolbox', 'marble_bust_01', 'wine_bottles_01', 'wooden_bucket_01', 'book_encyclopedia_set_01',
  'vintage_wooden_drawer_01', 'old_gas_mask', 'brass_candleholders', 'plastic_bottle_gallon', 'gothic_statue'];
const MODEL_2K = new Set(['gothic_statue']);   // 会贴脸出现的模型用 2k 贴图
const TEX_2K = new Set(['old_wood_floor', 'wood_plank_wall', 'concrete_floor_worn_001', 'cracked_concrete_wall']);   // 会贴脸看的墙面地面用 2k，其余 1k
const TEXTURES = ['old_wood_floor', 'wood_plank_wall', 'dark_wooden_planks', 'concrete_floor_worn_001', 'cracked_concrete_wall', 'snow_02', 'dirty_carpet', 'rusty_metal_02'];

async function get(url, file) {
  if (fs.existsSync(file) && fs.statSync(file).size > 0) return 0;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers: UA });
      if (!r.ok) throw new Error(r.status);
      const b = Buffer.from(await r.arrayBuffer());
      fs.writeFileSync(file, b);
      return b.length;
    } catch (e) { if (i === 2) throw new Error(`${url}: ${e.message}`); }
  }
}
const files = async (id) => (await fetch(`https://api.polyhaven.com/files/${id}`, { headers: UA })).json();

let total = 0;
for (const id of MODELS) {
  const f = await files(id), g = f.gltf?.[MODEL_2K.has(id) ? '2k' : '1k']?.gltf, dir = path.join(ROOT, 'models', id);
  if (!g) { console.log('SKIP   ', id, '(no 1k glTF)'); continue; }
  total += await get(g.url, path.join(dir, id + '.gltf'));
  for (const [rel, v] of Object.entries(g.include || {})) total += await get(v.url, path.join(dir, rel));
  console.log('model  ', id);
}
for (const id of TEXTURES) {
  const f = await files(id), dir = path.join(ROOT, 'textures', id), got = [];
  for (const [key, out] of [['Diffuse', 'diff'], ['nor_gl', 'nor'], ['Rough', 'rough'], ['AO', 'ao']]) {
    const u = f[key]?.[TEX_2K.has(id) ? '2k' : '1k']?.jpg?.url;
    if (!u) continue;
    total += await get(u, path.join(dir, out + '.jpg')); got.push(out);
  }
  console.log('texture', id, got.join(','));
}
console.log('downloaded', (total / 1e6).toFixed(1), 'MB');
