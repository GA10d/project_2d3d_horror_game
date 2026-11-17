// 2D 像素俯视小屋（320x180，16px 瓦片）
export const T = 16;
const W = 20, H = 11, OY = 2;

// '#': 墙   '.': 木地板   ',': 厨房地砖
const MAP = [
  '####################',
  '#,,,,,#............#',
  '#,,,,,#............#',
  '#,,,,,###.##########',
  '#,,,,,#............#',
  '#,,,,,.............#',
  '#,,,,,#............#',
  '#,,,,,#............#',
  '#,,,,,#............#',
  '#,,,,,#............#',
  '####################',
];

// 实心家具瓦片
const SOLID = new Set();
const solidTiles = [
  [1, 1], [2, 1], [3, 1], [4, 1], [5, 1],   // 橱柜
  [12, 6], [13, 6],                         // 桌子
  [14, 8], [15, 8], [16, 8],                // 沙发
  [18, 5], [18, 6],                         // 壁炉
  [16, 1], [17, 1],                         // 书架
];
for (const [x, y] of solidTiles) SOLID.add(x + ',' + y);

function hash(x, y) { let h = (x * 374761393 + y * 668265263) ^ 0x5bd1e995; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

export class World2D {
  constructor(canvas, G) {
    this.G = G;
    this.c = canvas;
    this.g = canvas.getContext('2d');
    this.g.imageSmoothingEnabled = false;
    this.p = { x: 10.5 * T, y: 8.6 * T, dir: 'up', walk: 0, moving: false };
    this.t = 0;
    this.target = null;        // 指引箭头 {tx,ty}
    this.frontOpen = false;
    this.footprints = false;
    this.windowShadow = 0;
    this.ghost = null;         // 走廊里的人影 {tx,ty}
    this.monster = null;       // 追逐者 {x,y,path,repath}
    this.flick = 1;            // 手电亮度系数
    this.blackout = false;
    this.glitchT = 0;
    this.inter = [];           // 互动点，由 main.js 填充

    this.dark = document.createElement('canvas');
    this.dark.width = 320; this.dark.height = 180;
    this.dg = this.dark.getContext('2d');
    this.bg = document.createElement('canvas');
    this.bg.width = 320; this.bg.height = 180;
    this.drawBackground(this.bg.getContext('2d'));
  }

  place(tx, ty, dir = 'down') { this.p.x = (tx + .5) * T; this.p.y = (ty + .5) * T; this.p.dir = dir; }

  solid(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= W || ty >= H) return true;
    return MAP[ty][tx] === '#' || SOLID.has(tx + ',' + ty);
  }
  blocked(x, y) {
    for (const [dx, dy] of [[-4, -3], [4, -3], [-4, 3], [4, 3]]) {
      if (this.solid(Math.floor((x + dx) / T), Math.floor((y + dy) / T))) return true;
    }
    return false;
  }

  // ---------- 静态背景 ----------
  drawBackground(g) {
    g.fillStyle = '#000'; g.fillRect(0, 0, 320, 180);
    g.translate(0, OY);
    for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
      const ch = MAP[ty][tx], x = tx * T, y = ty * T;
      if (ch === '#') {
        const face = ty + 1 < H && MAP[ty + 1][tx] !== '#';
        if (face) {
          g.fillStyle = '#4b3423'; g.fillRect(x, y, T, T);
          g.fillStyle = '#33231a'; g.fillRect(x, y + 5, T, 1); g.fillRect(x, y + 10, T, 1); g.fillRect(x, y + 15, T, 1);
          g.fillStyle = '#5f4631'; g.fillRect(x, y, T, 1); g.fillRect(x, y + 6, T, 1); g.fillRect(x, y + 11, T, 1);
          g.fillStyle = '#16100c'; g.fillRect(x, y, T, 2);
        } else { g.fillStyle = '#16100c'; g.fillRect(x, y, T, T); g.fillStyle = '#211812'; g.fillRect(x + 1, y + 1, T - 2, T - 2); }
      } else if (ch === ',') {
        for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
          g.fillStyle = (i + j) % 2 ? '#5d5d50' : '#6f6f60'; g.fillRect(x + i * 8, y + j * 8, 8, 8);
        }
        if (hash(tx, ty) > .7) { g.fillStyle = '#4c4c42'; g.fillRect(x + 3 + hash(ty, tx) * 8, y + 4, 2, 1); }
      } else {
        g.fillStyle = hash(tx, ty) > .5 ? '#5b3f2a' : '#573b27'; g.fillRect(x, y, T, T);
        g.fillStyle = '#48301f'; g.fillRect(x, y + 7, T, 1); g.fillRect(x, y + 15, T, 1);
        g.fillRect(x + (ty % 2 ? 4 : 11), y, 1, 7); g.fillRect(x + (ty % 2 ? 12 : 5), y + 8, 1, 7);
        if (hash(tx + 9, ty) > .6) { g.fillStyle = '#6a4b33'; g.fillRect(x + hash(ty, tx) * 12, y + 3, 3, 1); }
      }
    }
    // 地毯
    g.fillStyle = '#5a1f1f'; g.fillRect(10 * T + 4, 5 * T + 6, 5 * T - 8, 2 * T + 6);
    g.fillStyle = '#7a3a2a'; g.fillRect(10 * T + 6, 5 * T + 8, 5 * T - 12, 2 * T + 2);
    g.fillStyle = '#5a1f1f'; g.fillRect(10 * T + 9, 5 * T + 11, 5 * T - 18, 2 * T - 4);
    // 橱柜
    for (let tx = 1; tx <= 5; tx++) {
      const x = tx * T, y = T;
      g.fillStyle = '#8a7a63'; g.fillRect(x, y, T, 9);
      g.fillStyle = '#4a3a2c'; g.fillRect(x, y + 9, T, 7);
      g.fillStyle = '#2f241b'; g.fillRect(x, y + 9, 1, 7); g.fillRect(x + 2, y + 11, T - 4, 1);
      g.fillStyle = '#b8a67a'; g.fillRect(x + 7, y + 13, 3, 1);
    }
    g.fillStyle = '#3a4a52'; g.fillRect(4 * T + 3, T + 2, 10, 5);        // 水槽
    g.fillStyle = '#9aa'; g.fillRect(4 * T + 7, T + 1, 2, 2);
    g.fillStyle = '#222'; g.fillRect(5 * T + 3, T + 2, 4, 4); g.fillRect(5 * T + 9, T + 2, 4, 4); // 灶
    // 厨房窗
    this.drawWindow(g, 3, 0);
    this.drawWindow(g, 15, 3);
    // 桌子
    g.fillStyle = '#2a1c12'; g.fillRect(12 * T + 2, 6 * T + 12, 2, 4); g.fillRect(14 * T - 4, 6 * T + 12, 2, 4);
    g.fillStyle = '#7b5536'; g.fillRect(12 * T + 1, 6 * T + 2, 30, 11);
    g.fillStyle = '#946a45'; g.fillRect(12 * T + 1, 6 * T + 2, 30, 2);
    // 沙发
    g.fillStyle = '#2d4034'; g.fillRect(14 * T, 8 * T + 1, 3 * T, 14);
    g.fillStyle = '#3d5646'; g.fillRect(14 * T + 2, 8 * T + 6, 3 * T - 4, 7);
    g.fillStyle = '#22312a'; g.fillRect(14 * T, 8 * T + 1, 3 * T, 4); g.fillRect(14 * T + 23, 8 * T + 6, 1, 7);
    // 壁炉
    g.fillStyle = '#5c5c5c'; g.fillRect(18 * T, 5 * T, T, 2 * T);
    g.fillStyle = '#777'; g.fillRect(18 * T, 5 * T, T, 2); g.fillRect(18 * T + 2, 5 * T + 8, 5, 1); g.fillRect(18 * T + 8, 6 * T + 6, 5, 1);
    g.fillStyle = '#0a0a0a'; g.fillRect(18 * T, 5 * T + 6, 9, 20);
    g.fillStyle = '#7a2a10'; g.fillRect(18 * T + 3, 6 * T + 5, 2, 1); g.fillRect(18 * T + 5, 6 * T + 1, 1, 1);
    // 书架
    g.fillStyle = '#3b2616'; g.fillRect(16 * T, T - 6, 2 * T, 22);
    const cols = ['#7a2f2f', '#2f4f7a', '#6f6a3a', '#3a6f4f', '#5a3a6f'];
    for (let r = 0; r < 2; r++) for (let i = 0; i < 9; i++) {
      g.fillStyle = cols[Math.floor(hash(i, r + 3) * cols.length)];
      g.fillRect(16 * T + 2 + i * 3, T - 4 + r * 10, 2, 7);
    }
    // 卧室门（上墙）
    g.fillStyle = '#7a5332'; g.fillRect(10 * T + 2, 2, 12, 14);
    g.fillStyle = '#5c3d24'; g.fillRect(10 * T + 4, 4, 8, 5); g.fillRect(10 * T + 2, 2, 1, 14);
    g.fillStyle = '#d0b060'; g.fillRect(10 * T + 11, 10, 1, 2);
    // 地下室门（左墙）
    g.fillStyle = '#3f4a4f'; g.fillRect(T - 5, 8 * T + 1, 5, 14);
    g.fillStyle = '#2a3236'; g.fillRect(T - 5, 8 * T + 1, 1, 14);
    g.fillStyle = '#c9a227'; g.fillRect(T - 2, 8 * T + 8, 1, 2);
    g.setTransform(1, 0, 0, 1, 0, 0);
  }
  drawWindow(g, tx, ty) {
    const x = tx * T, y = ty * T;
    g.fillStyle = '#1b1410'; g.fillRect(x + 2, y + 3, 12, 10);
    g.fillStyle = '#26365a'; g.fillRect(x + 3, y + 4, 10, 8);
    g.fillStyle = '#3a4f7a'; g.fillRect(x + 3, y + 4, 10, 2);
    g.fillStyle = '#1b1410'; g.fillRect(x + 7, y + 4, 1, 8); g.fillRect(x + 3, y + 8, 10, 1);
  }

  // ---------- 更新 ----------
  update(dt) {
    const G = this.G, I = G.input, p = this.p;
    this.t += dt;
    if (this.glitchT > 0) this.glitchT -= dt;
    if (this.windowShadow > 0) this.windowShadow -= dt;
    const free = !G.busy && !G.talking;
    p.moving = false;
    if (free) {
      let dx = (I.down('KeyD') || I.down('ArrowRight') ? 1 : 0) - (I.down('KeyA') || I.down('ArrowLeft') ? 1 : 0);
      let dy = (I.down('KeyS') || I.down('ArrowDown') ? 1 : 0) - (I.down('KeyW') || I.down('ArrowUp') ? 1 : 0);
      if (dx || dy) {
        const l = Math.hypot(dx, dy), sp = (I.down('ShiftLeft') || I.down('ShiftRight')) ? 88 : 58;
        const nx = p.x + dx / l * sp * dt, ny = p.y + dy / l * sp * dt;
        if (!this.blocked(nx, p.y)) p.x = nx;
        if (!this.blocked(p.x, ny)) p.y = ny;
        p.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
        p.moving = true;
        const before = Math.floor(p.walk * 2);
        p.walk += dt * (sp / 14);
        if (Math.floor(p.walk * 2) !== before && Math.floor(p.walk * 2) % 2 === 0) G.sfx.step(.12);
      }
      // 互动
      let best = null, bd = 22;
      for (const it of this.inter) {
        const d = Math.hypot((it.tx + .5) * T - p.x, (it.ty + .5) * T - p.y);
        if (d < bd) { bd = d; best = it; }
      }
      G.ui.prompt(best ? 'E ' + best.label() : null);
      if (best && I.pressed('KeyE')) best.act();
    } else G.ui.prompt(null);

    // 追逐者：BFS 寻路
    const m = this.monster;
    if (m && free) {
      m.repath -= dt;
      if (m.repath <= 0) { m.repath = .2; m.path = this.bfs(Math.floor(m.x / T), Math.floor(m.y / T), Math.floor(p.x / T), Math.floor(p.y / T)); }
      let tx = p.x, ty = p.y;
      if (m.path && m.path.length > 1) { tx = (m.path[1][0] + .5) * T; ty = (m.path[1][1] + .5) * T; }
      const dx = tx - m.x, dy = ty - m.y, l = Math.hypot(dx, dy) || 1;
      m.x += dx / l * m.speed * dt; m.y += dy / l * m.speed * dt;
      m.stepT = (m.stepT || 0) - dt;
      const dist = Math.hypot(p.x - m.x, p.y - m.y);
      if (m.stepT <= 0) { m.stepT = .3; G.sfx.step(Math.max(.1, .7 - dist / 200), (m.x - p.x) / 120); }
      if (dist < 9) G.story.caught2D();
    }
  }

  bfs(sx, sy, gx, gy) {
    const key = (x, y) => y * W + x, prev = new Map([[key(sx, sy), -1]]), q = [[sx, sy]];
    while (q.length) {
      const [x, y] = q.shift();
      if (x === gx && y === gy) {
        const path = []; let k = key(x, y);
        while (k !== -1) { path.unshift([k % W, Math.floor(k / W)]); k = prev.get(k); }
        return path;
      }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (this.solid(nx, ny) || prev.has(key(nx, ny))) continue;
        prev.set(key(nx, ny), key(x, y)); q.push([nx, ny]);
      }
    }
    return null;
  }

  // ---------- 绘制 ----------
  draw() {
    const g = this.g, p = this.p, G = this.G;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(this.bg, 0, 0);
    g.translate(0, OY);

    // 正门（下墙）
    if (this.frontOpen) {
      g.fillStyle = '#9fb4d0'; g.fillRect(10 * T + 2, 10 * T, 12, 6);
      g.fillStyle = '#dfe8f5'; g.fillRect(10 * T + 3, 10 * T + 3, 10, 3);
      g.fillStyle = '#7a5332'; g.fillRect(10 * T - 1, 10 * T - 8, 3, 9);
    } else {
      g.fillStyle = '#7a5332'; g.fillRect(10 * T + 2, 10 * T, 12, 5);
      g.fillStyle = '#5c3d24'; g.fillRect(10 * T + 2, 10 * T + 4, 12, 1);
      g.fillStyle = '#d0b060'; g.fillRect(10 * T + 11, 10 * T + 2, 1, 1);
    }
    // 湿脚印：正门 -> 走廊 -> 卧室门口
    if (this.footprints) {
      g.fillStyle = 'rgba(20,28,40,.75)';
      const pts = [[10, 9], [10, 8], [10, 7], [9.6, 6], [9.5, 5], [9.5, 4], [9.5, 3], [9.6, 2], [10.2, 1.4]];
      pts.forEach(([tx, ty], i) => {
        const x = Math.round((tx + .5) * T), y = Math.round((ty + .5) * T), o = i % 2 ? 2 : -3;
        g.fillRect(x + o, y, 2, 3); g.fillRect(x + o, y + 6, 2, 3);
      });
    }
    // 桌上的物品
    if (!G.has.light) {
      g.fillStyle = '#e8e2c8'; g.fillRect(12 * T + 6, 6 * T + 5, 5, 4);
      g.fillStyle = '#888'; g.fillRect(12 * T + 16, 6 * T + 6, 6, 2);
      g.fillStyle = '#e0c040'; g.fillRect(12 * T + 22, 6 * T + 5, 2, 4);
    }
    // 窗外的影子
    if (this.windowShadow > 0) {
      const sx = 3 * T + 3 + Math.floor((1.3 - this.windowShadow) * 6);
      g.fillStyle = '#05060a'; g.fillRect(sx, 5, 4, 7); g.fillRect(sx + 1, 4, 2, 1);
    }

    // 角色按 y 排序
    const ents = [{ y: p.y, f: () => this.drawPlayer(g) }];
    if (this.ghost) ents.push({ y: (this.ghost.ty + .5) * T, f: () => this.drawShade(g, (this.ghost.tx + .5) * T, (this.ghost.ty + .5) * T) });
    if (this.monster) ents.push({ y: this.monster.y, f: () => this.drawShade(g, this.monster.x, this.monster.y, true) });
    ents.sort((a, b) => a.y - b.y).forEach(e => e.f());

    // 黑暗与手电
    const d = this.dg;
    d.setTransform(1, 0, 0, 1, 0, 0);
    d.globalCompositeOperation = 'source-over';
    d.clearRect(0, 0, 320, 180);
    d.fillStyle = 'rgba(2,3,10,.965)'; d.fillRect(0, 0, 320, 180);
    d.globalCompositeOperation = 'destination-out';
    const hole = (x, y, r, a) => {
      const gr = d.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(.55, `rgba(0,0,0,${a * .75})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
      d.fillStyle = gr; d.fillRect(x - r, y - r, r * 2, r * 2);
    };
    if (!this.blackout) {
      const off = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[p.dir];
      const fl = this.flick * (1 + Math.sin(this.t * 13) * .015);
      if (G.has.light) { hole(p.x + off[0] * 22, p.y + OY - 5 + off[1] * 22, 62 * fl, 1); hole(p.x, p.y + OY - 5, 30, .8); }
      else hole(p.x, p.y + OY - 5, 34, .8);
      hole(3.5 * T, 10 + OY, 30, .35); hole(15.5 * T, 4 * T + OY, 26, .3);       // 窗外月光
      if (this.frontOpen) hole(10.5 * T, 10 * T + OY, 26, .5);
      hole(18.3 * T, 6.4 * T + OY, 12, .35);                                     // 余烬
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(this.dark, 0, 0);

    // 黑暗中仍然看得见的眼睛
    const eyes = (x, y, h) => { x = Math.round(x); y = Math.round(y) + OY; g.fillStyle = '#e8e8e8'; g.fillRect(x - 1, y - h - 2, 1, 1); g.fillRect(x + 1, y - h - 2, 1, 1); };
    if (this.ghost) eyes((this.ghost.tx + .5) * T, (this.ghost.ty + .5) * T, 20);
    if (this.monster) eyes(this.monster.x, this.monster.y, 22);

    // 指引箭头（画在黑暗之上）
    if (this.target && !G.busy) {
      const x = Math.round((this.target.tx + .5) * T), y = Math.round(this.target.ty * T + OY - 7 + Math.sin(this.t * 5) * 2);
      g.fillStyle = '#000'; g.fillRect(x - 4, y - 1, 9, 3); g.fillRect(x - 3, y + 2, 7, 2); g.fillRect(x - 1, y + 4, 3, 2);
      g.fillStyle = '#f2c94c'; g.fillRect(x - 3, y, 7, 2); g.fillRect(x - 2, y + 2, 5, 1); g.fillRect(x - 1, y + 3, 3, 1); g.fillRect(x, y + 4, 1, 1);
    }

    // 画面撕裂
    if (this.glitchT > 0) {
      for (let i = 0; i < 7; i++) {
        const y = Math.floor(Math.random() * 170), h = 2 + Math.floor(Math.random() * 10), o = Math.floor(Math.random() * 30 - 15);
        g.drawImage(this.c, 0, y, 320, h, o, y, 320, h);
      }
      g.fillStyle = `rgba(160,0,0,${Math.random() * .18})`; g.fillRect(0, 0, 320, 180);
    }
  }

  drawPlayer(g) {
    const p = this.p, x = Math.round(p.x), y = Math.round(p.y);
    const step = p.moving ? Math.floor(p.walk * 2) % 2 : 0;
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x - 4, y + 2, 8, 2);
    g.fillStyle = '#2a2d3a'; g.fillRect(x - 3, y - 1, 2, 4 - step); g.fillRect(x + 1, y - 1, 2, 3 + step); // 腿
    g.fillStyle = '#a33b2a'; g.fillRect(x - 4, y - 8, 8, 7);                                              // 外套
    g.fillStyle = '#7d2a1e'; g.fillRect(x - 4, y - 3, 8, 1);
    g.fillStyle = '#e0b48c'; g.fillRect(x - 3, y - 13, 6, 5);                                             // 头
    g.fillStyle = '#2b1d14';
    if (p.dir === 'up') g.fillRect(x - 3, y - 14, 6, 5);
    else {
      g.fillRect(x - 3, y - 14, 6, 2);
      g.fillStyle = '#111';
      if (p.dir === 'down') { g.fillRect(x - 2, y - 11, 1, 1); g.fillRect(x + 1, y - 11, 1, 1); }
      else g.fillRect(x + (p.dir === 'right' ? 1 : -2), y - 11, 1, 1);
    }
  }

  drawShade(g, x, y, big = false) {
    x = Math.round(x); y = Math.round(y);
    const h = big ? 22 : 20, sway = Math.round(Math.sin(this.t * 9) * (big ? 1 : 0));
    g.fillStyle = '#000';
    g.fillRect(x - 3 + sway, y - h, 6, h + 2);
    g.fillRect(x - 2 + sway, y - h - 4, 4, 5);
    g.fillRect(x - 5 + sway, y - h + 3, 2, 13); g.fillRect(x + 3 + sway, y - h + 3, 2, 13);
    g.fillStyle = '#e8e8e8';
    g.fillRect(x - 1 + sway, y - h - 2, 1, 1); g.fillRect(x + 1 + sway, y - h - 2, 1, 1);
  }
}
