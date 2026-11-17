// 从 Poly Haven（全部 CC0）下载本项目用到的模型与 PBR 贴图： node tools/fetch-assets.mjs
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', 'assets');
const UA = { 'User-Agent': 'asset-fetcher/1.0' };
const MODELS = ['Rockingchair_01', 'GothicBed_01', 'GothicCabinet_01', 'ClassicNightstand_01', 'vintage_oil_lamp', 'hanging_picture_frame_01',
  'vintage_grandfather_clock_01', 'steel_frame_shelves_01', 'wooden_crate_02', 'Barrel_01', 'power_box_01', 'hanging_industrial_lamp',
  'cardboard_box_01', 'metal_toolbox', 'marble_bust_01'];
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
  const f = await files(id), g = f.gltf['1k'].gltf, dir = path.join(ROOT, 'models', id);
  total += await get(g.url, path.join(dir, id + '.gltf'));
  for (const [rel, v] of Object.entries(g.include || {})) total += await get(v.url, path.join(dir, rel));
  console.log('model  ', id);
}
for (const id of TEXTURES) {
  const f = await files(id), dir = path.join(ROOT, 'textures', id), got = [];
  for (const [key, out] of [['Diffuse', 'diff'], ['nor_gl', 'nor'], ['Rough', 'rough'], ['AO', 'ao']]) {
    const u = f[key]?.['1k']?.jpg?.url;
    if (!u) continue;
    total += await get(u, path.join(dir, out + '.jpg')); got.push(out);
  }
  console.log('texture', id, got.join(','));
}
console.log('downloaded', (total / 1e6).toFixed(1), 'MB');
