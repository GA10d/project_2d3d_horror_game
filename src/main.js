// 入口：输入、UI、2D/3D 切换、线性剧情脚本
import { Sfx } from './audio.js';
import { World2D, T } from './world2d.js';
import { World3D, grainURL } from './world3d.js';
import { loadAssets } from './assets.js';

const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- 输入 ----------
const keys = new Set(), just = new Set();
addEventListener('keydown', (e) => {
  if (!keys.has(e.code)) just.add(e.code);
  keys.add(e.code);
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

// ---------- 全局状态 ----------
const G = {
  mode: '2d', step: 0, has: {}, busy: true, talking: false, started: false,
  input: { down: (c) => keys.has(c), pressed: (c) => just.has(c) },
  sfx: new Sfx(), wait,
};
window.__G = G;

// ---------- UI ----------
const dlg = { queue: [], res: null };
function nextLine() {
  if (!dlg.queue.length) { $('dlg').style.display = 'none'; G.talking = false; const r = dlg.res; dlg.res = null; r && r(); return; }
  showLine(dlg.queue.shift(), true);
  G.sfx.tick();
}
// 一行对话可以是字符串（内心独白），也可以是 { who, text }（说出口的话 / 有来源的声音）
function showLine(line, hint) {
  const who = typeof line === 'string' ? null : line.who, text = typeof line === 'string' ? line : line.text;
  $('dlgWho').textContent = who || ''; $('dlgWho').style.display = who ? 'block' : 'none';
  $('dlgText').textContent = text;
  $('dlg').lastElementChild.style.display = hint ? 'block' : 'none';
  $('dlg').style.display = 'block';
}
// 不需要按键、定时消失的字幕（结局演出用）
G.caption = async (text, who, ms) => { showLine({ who, text }, false); G.sfx.tick(); await wait(ms); $('dlg').style.display = 'none'; };
G.say = (lines) => new Promise((res) => { dlg.queue = [...lines]; dlg.res = res; G.talking = true; nextLine(); });

G.ui = {
  prompt(t) { const e = $('prompt'); if (t) { if (e.textContent !== t) e.textContent = t; e.style.display = 'block'; } else e.style.display = 'none'; },
  hold(v) { $('hold').style.display = v > 0 ? 'block' : 'none'; $('hold').firstElementChild.style.width = Math.min(100, v * 100) + '%'; },
  objective(t, sub = '') {
    const e = $('obj');
    if (!t) { e.style.display = 'none'; return; }
    e.querySelector('b').textContent = t; e.querySelector('i').textContent = sub;
    e.style.display = 'block'; e.classList.remove('pop'); void e.offsetWidth; e.classList.add('pop');
  },
  fade(v, ms) {
    return new Promise((res) => {
      const e = $('fade'), from = parseFloat(e.style.opacity === '' ? 1 : e.style.opacity), t0 = performance.now();
      clearInterval(G.ui._fid);
      if (ms <= 0) { e.style.opacity = v; return res(); }
      G.ui._fid = setInterval(() => {
        const k = Math.min(1, (performance.now() - t0) / ms);
        e.style.opacity = from + (v - from) * k;
        if (k >= 1) { clearInterval(G.ui._fid); res(); }
      }, 16);
    });
  },
  async center(t, ms) { const e = $('center'); e.textContent = t; e.style.display = 'flex'; await wait(ms); e.style.display = 'none'; },
};

const w2 = new World2D($('c2d'), G);
const w3 = new World3D($('c3d'), G);
G.w2 = w2; G.w3 = w3;
$('grain').style.backgroundImage = `url(${grainURL()})`;

function showMode() {
  const d3 = G.mode === '3d';
  $('c2d').style.display = d3 ? 'none' : 'block';
  for (const id of ['c3d', 'cross']) $(id).style.display = d3 ? 'block' : 'none';
  if (!d3) $('lockhint').style.display = 'none';
}
function lock() { try { const r = $('stage').requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch { /* 无指针锁也能用方向键 */ } }
$('stage').addEventListener('mousedown', () => {
  if (!G.started) return;
  if (G.talking) nextLine();
  if (G.mode === '3d' && document.pointerLockElement !== $('stage')) lock();
});
addEventListener('mousemove', (e) => { if (G.mode === '3d' && document.pointerLockElement === $('stage')) w3.look(e.movementX, e.movementY); });

// 2D -> 3D：像素逐级「解析」成写实画面
async function to3D(name) {
  G.busy = true; w2.target = null; G.ui.prompt(null);
  G.sfx.door();
  await G.ui.fade(1, 500);
  w3.load(name);
  G.mode = '3d'; showMode(); w3.setRes(.035); w3.update(0); w3.render();
  G.sfx.setDrone(.55); G.sfx.setWind(.2);
  await G.ui.fade(0, 250);
  await w3.animRes([.035, .05, .07, .1, .15, .22, .33, .5, .75, 1], 150);
  G.busy = false; lock();
}
// 3D -> 2D：画面重新塌缩成像素
async function to2D(tx, ty, dir) {
  G.busy = true; G.ui.prompt(null); G.ui.hold(0);
  await w3.animRes([.5, .25, .12, .06, .035], 90);
  await G.ui.fade(1, 200);
  if (document.pointerLockElement) document.exitPointerLock();
  G.mode = '2d'; showMode(); w3.setRes(1);
  w2.place(tx, ty, dir);
  G.sfx.setDrone(0); G.sfx.setWind(.45); G.sfx.door();
  await G.ui.fade(0, 500);
}
// 在 2D 中强制闪切 3D 的脸
async function faceFlash(ms) {
  w3.load('hall');
  G.mode = '3d'; showMode(); w3.setRes(1);
  await w3.faceScare(ms);
  G.mode = '2d'; showMode();
  w2.glitchT = .6; G.sfx.glitch();
}

// 包一层：剧情演出期间锁住玩家
async function scene(fn) { if (G.busy) return; G.busy = true; try { await fn(); } finally { G.busy = false; } }

// ---------- 剧情 ----------
const story = G.story = {
  table: () => scene(async () => {
    if (G.step !== 0) { await G.say(['爷爷的字条：「敲三下的是人。敲四下的，别开。」']); return; }
    G.has.light = true; G.sfx.blip();
    await G.say([
      '桌上有一支手电筒，还有爷爷留下的字条。',
      '「阿远：电闸在地下室，钥匙在厨房抽屉里。」',
      '「保险丝老是烧，备用的我收在卧室衣柜的铁盒里。」',
      '「还有——天黑以后有人敲门，先数。」',
      '「敲三下的是人。敲四下的，别开。」',
    ]);
    G.step = 1;
    G.ui.objective('去厨房找地下室钥匙', '厨房在左边 · 钥匙在橱柜抽屉里');
    w2.target = { tx: 2, ty: 1 };
  }),

  drawer: () => scene(async () => {
    if (G.step !== 1) { await G.say(['抽屉里只剩些旧餐具。']); return; }
    G.has.key = true; G.sfx.blip(); w2.target = null;
    await G.say(['抽屉里有一把生锈的钥匙。', '拿到了【地下室钥匙】。']);
    w2.windowShadow = 1.3;
    await wait(700);
    G.sfx.knock(4, { vol: .9, pan: .6 });
    await wait(2400);
    await G.say(['……敲门声？', '一、二、三……四下。', { who: '阿远', text: '「四下的，是鬼。」' }, '……我怎么把这句话说出口了。']);
    G.step = 2;
    G.ui.objective('回客厅看看', '敲门声是从正门传来的');
    w2.target = { tx: 10, ty: 9 };
  }),

  doorEvent: () => scene(async () => {
    G.step = 3; w2.target = null;
    w2.frontOpen = true; w2.footprints = true; G.sfx.setWind(.6);
    await wait(500);
    await G.say(['正门开着。', '我进来的时候，明明锁上了。', '地上有一串湿脚印……从门口，一直通向走廊。']);
    G.ui.objective('去卧室拿保险丝', '顺着脚印走 · 走廊上方的门');
    w2.target = { tx: 10, ty: 0 };
  }),

  async bedroomDoor() {
    if (G.busy) return;
    if (G.step < 3) return scene(() => G.say(['爷爷的卧室。先弄清楚屋里的情况再说。']));
    if (G.step > 3) return scene(() => G.say(['……我不想再进去了。']));
    G.step = 4;
    await to3D('bedroom');
    G.ui.objective('打开衣柜，找到保险丝', '鼠标转动视角 · WASD 移动 · E 互动');
    G.say(['爷爷的卧室。……比外面还冷。']);
  },

  async leaveBedroom() {
    if (G.busy) return;
    await to2D(10, 1, 'right');
    G.step = 5; G.ui.objective(null);
    await G.say(['脚印到卧室门口就没有了。']);
    // 走廊尽头的人影：每黑一次，近一点
    w2.ghost = { tx: 17, ty: 2 };
    await wait(1100);
    for (const tx of [14, 12]) {
      w2.blackout = true; G.sfx.thump(.5, .5); await wait(230);
      w2.ghost.tx = tx; w2.blackout = false; await wait(650);
    }
    w2.blackout = true; await wait(320);
    await faceFlash(450);
    w2.ghost = null; w2.blackout = false;
    await wait(1100);
    await G.say(['……！', '刚才那是什么。', '得赶紧把电弄好。']);
    G.ui.objective('去地下室恢复供电', '厨房左下角的铁门');
    w2.target = { tx: 0, ty: 8 };
    G.busy = false;
  },

  async cellarDoor() {
    if (G.busy) return;
    if (!G.has.key) return scene(() => G.say(['一扇铁门，锁着。']));
    if (G.step < 5) return scene(() => G.say(['地下室的门。保险丝还没找到，下去也没用。']));
    if (G.step > 5) return scene(() => G.say(['不。绝不再下去。']));
    G.step = 6;
    await to3D('cellar');
    G.ui.objective('把保险丝装进电闸箱', '电闸箱在地下室最里面');
    G.say(['地下室。电闸箱在最里面。']);
  },

  async leaveCellar() {
    await to2D(1, 8, 'right');
    G.step = 7; G.sfx.setWind(.7);
    G.ui.objective('逃出小屋！', '按住 Shift 奔跑 · 冲向正门');
    w2.target = { tx: 10, ty: 10 };
    G.busy = false;
    spawnMonster();
  },

  async caught2D() {
    if (G.busy) return;
    G.busy = true;
    await faceFlash(600);
    await G.ui.fade(1, 60);
    w2.monster = null; w2.place(1, 8, 'right');
    await G.ui.center('它追上了你。', 1600);
    await G.ui.fade(0, 500);
    G.busy = false;
    spawnMonster();
  },

  // 冲到正门：夺门而出（切到屋外 3D）
  async doorReached() {
    if (G.busy) return;
    G.step = 9; w2.monster = null; w2.target = null; G.ui.objective(null);
    G.sfx.chase(false);
    await to3D('porch');
    G.sfx.setWind(.85); G.sfx.setDrone(.15);
    w3.porchEnding();
  },

  frontDoor() {
    if (G.busy) return;
    return scene(() => G.say(G.step < 3 ? ['外面是暴风雪，车也陷住了。', '先把电弄好，熬到天亮再说。'] : ['门外只有风雪。……先把电弄好。']));
  },

  // 轮回收尾：镜头切回屋里的 2D 画面——正是开局厨房里的那一幕
  async loopReplay() {
    G.busy = true;
    if (document.pointerLockElement) document.exitPointerLock();
    G.ui.prompt(null); G.ui.hold(0); G.ui.objective(null);
    Object.assign(w2, { monster: null, ghost: null, target: null, frontOpen: false, footprints: false, blackout: false, flick: 1 });
    w2.place(2, 2, 'up'); w2.windowShadow = 1.3; w2.glitchT = .3;
    G.mode = '2d'; showMode(); w3.setRes(1);
    G.sfx.glitch(); G.sfx.setDrone(0); G.sfx.setWind(.45);
    await G.caption('一、二、三……四下。', null, 2100);
    w2.p.dir = 'right';                       // 他朝正门的方向转过头
    await wait(450);
    await G.caption('「四下的，是鬼。」', '阿远', 1500);
    // 戛然而止
    await G.ui.fade(1, 0);
    G.sfx.setWind(0); G.sfx.setDrone(0);
    G.started = false;
    for (const id of ['c2d', 'c3d', 'grain', 'vignette', 'cross', 'obj', 'prompt', 'lockhint', 'dlg']) $(id).style.display = 'none';
    await wait(2200);
    $('end').style.display = 'flex';
    await G.ui.fade(0, 1500);
  },
};

async function spawnMonster() {
  // 等玩家跑开一点（最多 3 秒）再让它从地下室门里出来
  for (let i = 0; i < 30; i++) { await wait(100); if (i >= 9 && Math.hypot(w2.p.x - 1.5 * T, w2.p.y - 8.5 * T) > 30) break; }
  if (G.step === 7 && !w2.monster && !G.busy) { w2.monster = { x: 1.2 * T, y: 8.5 * T, speed: 66, repath: 0, path: null }; G.sfx.stinger(.5); w2.glitchT = .3; }
}

w2.inter.push(
  { tx: 12.5, ty: 6, label: () => (G.step === 0 ? '调查桌子' : '看字条'), act: story.table },
  { tx: 2, ty: 1, label: () => '打开抽屉', act: story.drawer },
  { tx: 10, ty: 0, label: () => '卧室', act: () => story.bedroomDoor() },
  { tx: 0, ty: 8, label: () => '地下室', act: () => story.cellarDoor() },
  { tx: 10, ty: 10, label: () => '正门', act: () => story.frontDoor() },
  { tx: 18, ty: 5.5, label: () => '壁炉', act: () => scene(() => G.say(['炉灰是凉的。', '只有正中间一小块是湿的——像是有什么东西，刚从烟囱里下来过。'])) },
  { tx: 16.5, ty: 1, label: () => '书架', act: () => scene(() => G.say(['相册里夹着一张全家福。', '爷爷身后的窗户外面……好像多站了一个人。'])) },
);

// ---------- 主循环 ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  if (G.started) {
    if (G.talking && (just.has('KeyE') || just.has('Space') || just.has('Enter'))) { just.clear(); nextLine(); }
    if (G.mode === '2d') {
      w2.update(dt);
      if (!G.busy && !G.talking) {
        if (G.step === 2 && w2.p.x > 7.3 * T) story.doorEvent();
        else if (G.step === 7 && Math.hypot(w2.p.x - 10.5 * T, w2.p.y - 9.5 * T) < 13) story.doorReached();
      }
      w2.draw();
    } else {
      w3.update(dt); w3.render();
      $('grain').style.backgroundPosition = `${Math.floor(Math.random() * 128)}px ${Math.floor(Math.random() * 128)}px`;
      $('lockhint').style.display = (!G.busy && !G.talking && document.pointerLockElement !== $('stage')) ? 'block' : 'none';
    }
  }
  just.clear();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
G.frame = frame;   // 调试用：页面不可见时可手动驱动主循环

// ---------- 开始 ----------
$('startBtn').addEventListener('click', async () => {
  $('title').style.display = 'none';
  G.sfx.init(); G.sfx.setWind(.45);
  w3.load('hall'); w3.render();            // 预热着色器，避免首次闪现卡顿
  G.mode = '2d'; showMode(); G.started = true;
  await G.ui.fade(0, 1500);
  await G.say(['暴风雪把车困在了半山腰。', '爷爷走后的第七天，我终于回到了这间小屋。', '屋里没有电，黑得什么都看不清。', '先看看桌上有什么。']);
  G.ui.objective('调查客厅的桌子', 'WASD 移动 · E 互动');
  w2.target = { tx: 12.5, ty: 6 };
  G.busy = false;
});
loadAssets((n, total) => { $('startBtn').textContent = `加载素材 ${n}/${total}`; })
  .then(() => { $('startBtn').textContent = '开 始'; $('startBtn').disabled = false; G.loaded = true; })
  .catch((e) => { $('startBtn').textContent = '素材加载失败'; console.error(e); });
$('againBtn').addEventListener('click', () => location.reload());
