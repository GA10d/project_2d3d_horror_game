// 打一个不需要安装 Node.js 的可分发包： node tools/package.mjs  ->  dist/Knock-demo.zip
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist'), OUT = path.join(DIST, 'Knock'), ZIP = path.join(DIST, 'Knock-demo.zip');
const cp = (from, to = from) => fs.cpSync(path.join(ROOT, from), path.join(OUT, to), { recursive: true });

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

for (const f of ['index.html', 'src', 'assets']) cp(f);
// three.js：只带运行时真正用到的部分
cp('node_modules/three/build/three.module.js');
cp('node_modules/three/build/three.core.js');
cp('node_modules/three/LICENSE');
for (const d of ['postprocessing', 'shaders', 'math', 'utils', 'environments']) cp('node_modules/three/examples/jsm/' + d);
cp('node_modules/three/examples/jsm/loaders/GLTFLoader.js');
// 启动器：用 Windows 自带的 PowerShell 开本地服务器
for (const f of ['Play-Knock.bat', 'serve.ps1']) cp('tools/package/' + f, f);
fs.writeFileSync(path.join(OUT, 'README.txt'), '﻿' + fs.readFileSync(path.join(ROOT, 'tools/package/README.txt'), 'utf8').replace(/\r?\n/g, '\r\n'));
fs.writeFileSync(path.join(OUT, 'Play-Knock.bat'), fs.readFileSync(path.join(ROOT, 'tools/package/Play-Knock.bat'), 'utf8').replace(/\r?\n/g, '\r\n'));

execFileSync('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path '${OUT}' -DestinationPath '${ZIP}' -Force`], { stdio: 'inherit' });
const mb = (p) => (fs.statSync(p).size / 1e6).toFixed(1) + ' MB';
console.log('packaged', ZIP, mb(ZIP));
