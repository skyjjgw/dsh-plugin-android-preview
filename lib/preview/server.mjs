import http from 'node:http';
import net from 'node:net';
import { spawn, execFile } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { readFile, access } from 'node:fs/promises';
import { watch } from 'node:fs';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { authorizeUpgrade, controlPacket, VideoParser, wsFrame, ClientFrames } from './protocol.mjs';
import { checkApplication, flutterCommand, launchApplication } from '../application.mjs';

const exec = promisify(execFile), here = path.dirname(fileURLToPath(import.meta.url));
export async function createAndroidPreview(options) {
const app = options.appRoot;
const port = options.port ?? 18772, origin = `http://127.0.0.1:${port}`, serial = options.serial ?? 'emulator-5556';
const adb = options.adbPath;
const jar = options.scrcpyServer;
const remoteJar = '/data/local/tmp/dsh-android-preview-scrcpy.jar';
let environment = { ...process.env };
const scid = (randomBytes(4).readUInt32BE() & 0x7fffffff).toString(16).padStart(8, '0');
const token = randomBytes(32).toString('hex');
let state = { mirror: '点击“启动预览”连接安卓', flutter: '尚未启动调试', hotReload: options.hotReload, reloads: 0 }, meta, config, video, control, remote, forwarded;
let flutter, appId, starting = false, started = false, reloadTimer, reloading = false, dirty = false, requestId = 0, stopping = false;
let preparation;
const clients = new Set(), watchers = [];
const adbRun = (...args) => exec(adb, ['-s', serial, ...args], { env: environment, windowsHide: true, timeout: 20000, maxBuffer: 1024 * 1024 });
const send = (client, value) => { if (!client.destroyed) client.write(wsFrame(JSON.stringify(value), 1)); };
function status(patch = {}) { state = { ...state, ...patch }; for (const c of clients) send(c, { type: 'status', ...state }); console.log(JSON.stringify(state)); }

const server = http.createServer(async (req, res) => {
  if (req.headers.host !== `127.0.0.1:${port}`) { res.writeHead(403).end(); return; }
  let pathname;
  try { pathname = new URL(req.url, origin).pathname; } catch { res.writeHead(400).end(); return; }
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', `default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self' ws://127.0.0.1:${port}; img-src 'self'; frame-ancestors ${options.frameAncestors.join(' ') || "'none'"}; base-uri 'none'; form-action 'none'`);
  if (req.method !== 'GET') { res.writeHead(405).end(); return; }
  if (pathname === '/health') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ service: 'dsh-android-preview', ...state })); return; }
  if (pathname === '/session') {
    if (req.headers['sec-fetch-site'] !== 'same-origin') { res.writeHead(403).end(); return; }
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ token })); return;
  }
  const files = { '/': ['index.html', 'text/html; charset=utf-8'], '/client.js': ['client.js', 'text/javascript; charset=utf-8'], '/style.css': ['style.css', 'text/css; charset=utf-8'] };
  if (!Object.hasOwn(files, pathname)) { res.writeHead(404).end(); return; }
  try { const [file, type] = files[pathname]; res.setHeader('Content-Type', type); res.end(await readFile(path.join(here, file))); }
  catch { res.writeHead(500).end(); }
});
server.on('upgrade', (req, socket, head) => {
  const key = req.headers['sec-websocket-key'];
  if (!authorizeUpgrade(req, token, port) || clients.size >= 3) { socket.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return; }
  const accept = createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  clients.add(socket); socket.setNoDelay(true);
  send(socket, { type: 'status', ...state }); if (meta) send(socket, { type: 'meta', ...meta });
  if (config) socket.write(wsFrame(config));
  // Force a new keyframe for each joining browser; no stale video queue.
  if (config && meta) control?.write(Buffer.from([17]));
  const parser = new ClientFrames((opcode, data) => {
    if (opcode === 8) { socket.end(wsFrame(data, 8)); return; }
    if (opcode === 9) { socket.write(wsFrame(data, 10)); return; }
    if (opcode !== 1) return;
    const msg = JSON.parse(data.toString('utf8'));
    if (msg.type === 'start') { if (!started && !starting) restartApp(); return; }
    if (msg.type === 'restart') { restartApp(); return; }
    if (msg.type === 'reload') { requestReload(); return; }
    if (msg.type === 'refresh') { if (config && meta) control?.write(Buffer.from([17])); return; }
    if (!control || !meta) return;
    control.write(controlPacket(msg, meta.width, meta.height));
  });
  socket.on('data', data => { try { parser.push(data); } catch { socket.destroy(); } });
  socket.on('error', () => {}); socket.on('close', () => { clients.delete(socket); if (control && meta) control.write(controlPacket({ type: 'touch', action: 1, x: 0, y: 0 }, meta.width, meta.height)); });
  if (head.length) { try { parser.push(head); } catch { socket.destroy(); } }
});

async function connect(portNumber, waitForDummy = false) {
  for (let i = 0; i < 80 && !stopping; i++) {
    try { return await new Promise((resolve, reject) => {
      const s = net.connect(portNumber, '127.0.0.1');
      const timer = setTimeout(() => { s.destroy(); reject(Error('Connection timed out')); }, 2000);
      const fail = () => { clearTimeout(timer); reject(Error('Waiting for scrcpy')); };
      const done = first => { clearTimeout(timer); s.removeListener('close', fail); s.removeListener('error', fail); if (waitForDummy) s.pause(); resolve({ socket: s, first }); };
      s.once('error', fail); s.once('close', fail);
      if (waitForDummy) s.once('data', done); else s.once('connect', () => done(null));
    }); }
    catch { await new Promise(r => setTimeout(r, 150)); }
  }
  throw Error('scrcpy did not accept connection');
}
async function mirror() {
  await access(jar);
  await adbRun('push', jar, remoteJar);
  forwarded = (await adbRun('forward', 'tcp:0', `localabstract:scrcpy_${scid}`)).stdout.trim();
  if (!/^\d+$/.test(forwarded)) throw Error('ADB forward failed');
  remote = spawn(adb, ['-s', serial, 'shell', `CLASSPATH=${remoteJar}`, 'app_process', '/', 'com.genymobile.scrcpy.Server', '3.3.3', `scid=${scid}`, 'tunnel_forward=true', 'audio=false', 'control=true', 'clipboard_autosync=false', 'max_size=1080', 'max_fps=30', 'video_bit_rate=4000000', 'video_codec=h264', 'send_device_meta=true', 'send_codec_meta=true', 'send_frame_meta=true', 'log_level=warn', 'stay_awake=false', 'power_off_on_close=false'], { env: environment, windowsHide: true });
  remote.stdout.on('data', d => console.log(`scrcpy: ${d.toString().trim()}`)); remote.stderr.on('data', d => console.log(`scrcpy: ${d.toString().trim()}`));
  remote.on('error', e => status({ mirror: e.message }));
  remote.on('exit', () => { if (!stopping) status({ mirror: '安卓连接断开，请重新启动预览' }); });
  const firstVideo = await connect(Number(forwarded), true); video = firstVideo.socket;
  video.on('error', e => status({ mirror: e.message }));
  const parser = new VideoParser(info => { meta = info; status({ mirror: '已连接 · 真实安卓画面' }); for (const c of clients) send(c, { type: 'meta', ...meta }); }, packet => {
    if (packet.readBigUInt64BE(0) >> 63n) config = Buffer.from(packet);
    const frame = wsFrame(packet);
    for (const c of clients) {
      // Disconnect slow viewers rather than letting unbounded delta frames accumulate.
      if (c.writableLength > 4 * 1024 * 1024) c.destroy(); else c.write(frame);
    }
  });
  video.on('data', d => { try { parser.push(d); } catch (e) { status({ mirror: e.message }); video.destroy(); } });
  video.on('close', () => { if (!stopping) status({ mirror: '视频流已断开，请重新启动预览' }); });
  parser.push(firstVideo.first); video.resume();
  control = (await connect(Number(forwarded))).socket; control.on('error', e => status({ mirror: e.message }));
  control.on('data', () => {}); // Clipboard autosync is disabled; ignore optional ACKs.
}

function requestReload() {
  if (!started || !appId || !flutter?.stdin.writable) return;
  if (reloading) { dirty = true; return; }
  reloading = true; status({ flutter: '正在热重载…' });
  flutter.stdin.write(JSON.stringify([{ id: ++requestId, method: 'app.restart', params: { appId, fullRestart: false, pause: false } }]) + '\n');
}
async function startFlutter() {
  status({ flutter: '正在启动 App…', renderer: options.renderer });
  const vmUrl = await launchApplication(options, adbRun, preparation.signal);
  if (stopping) return;
  if (!options.hotReload) { started = true; status({ flutter: 'App 已就绪 · Android 预览模式' }); return; }
  // attach on Android expects the device URL and creates its own ADB forward.
  // Direct Dart executable avoids shell quoting on all supported platforms.
  const command = flutterCommand(options, environment, vmUrl);
  flutter = spawn(command.executable, command.args, { cwd: app, env: environment, windowsHide: true });
  status({ flutter: '正在连接热重载…' });
  let buffer = '';
  flutter.stdout.on('data', data => {
    buffer += data.toString(); let end;
    while ((end = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, end).trim(); buffer = buffer.slice(end + 1);
      if (!line.startsWith('[{')) { if (line) console.log(line); continue; }
      try { for (const event of JSON.parse(line)) {
        if (event.event === 'app.start') appId = event.params.appId;
        if (event.event === 'app.started') { started = true; status({ flutter: '热重载已就绪 · 保存 Dart 自动更新' }); }
        if (event.event === 'app.stop') { started = false; status({ flutter: '调试已停止，请重启预览' }); }
        if (event.id === requestId && reloading) {
          reloading = false;
          const ok = !event.error && event.result?.code === 0;
          status({ flutter: ok ? '热重载成功 · 保存 Dart 自动更新' : '热重载失败，请查看终端编译信息', reloads: state.reloads + (ok ? 1 : 0) });
          if (!ok) console.error(JSON.stringify(event));
          if (dirty) { dirty = false; requestReload(); }
        }
      } } catch (e) { console.error('Flutter event:', e.message); }
    }
  });
  flutter.stderr.on('data', data => console.error(data.toString()));
  flutter.on('error', e => status({ flutter: e.message }));
  flutter.on('exit', code => { started = false; if (!stopping) status({ flutter: `调试进程已退出 (${code})` }); });
  if (!watchers.length) for (const directory of options.watchDirectories) {
    watchers.push(watch(directory, { recursive: true }, (_, filename) => {
      if (!filename?.endsWith('.dart')) return;
      clearTimeout(reloadTimer); reloadTimer = setTimeout(requestReload, 650);
    }));
  }
}
async function stopFlutter() {
  const child = flutter;
  if (!child || child.exitCode !== null) return;
  await new Promise(resolve => {
    const timer = setTimeout(async () => {
      // Only terminate this server's own Flutter process tree on Windows.
      if (process.platform === 'win32') await exec('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }).catch(() => {});
      else child.kill('SIGTERM');
      resolve();
    }, 2500);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
    if (child.stdin.writable) child.stdin.write(JSON.stringify([{ id: 99999, method: 'daemon.shutdown' }]) + '\n');
  });
}
async function restartApp() {
  if (starting || stopping) return;
  starting = true;
  clearTimeout(reloadTimer); reloading = false; dirty = false; started = false;
  for (const watcher of watchers.splice(0)) watcher.close();
  status({ flutter: '正在重启 App…' });
  try {
    preparation = new AbortController();
    environment = { ...process.env, ...await options.prepare?.(preparation.signal) };
    if (stopping) return;
    await stopFlutter(); appId = undefined;
    await checkApplication(options, environment);
    if (stopping) return;
    if (!video || video.destroyed || !control || control.destroyed) {
      video?.destroy(); control?.destroy(); remote?.kill();
      if (forwarded) await adbRun('forward', '--remove', `tcp:${forwarded}`).catch(() => {});
      config = undefined; meta = undefined; await mirror();
    }
    if (stopping) return;
    await startFlutter();
  }
  catch (e) { status({ flutter: e.message }); }
  finally { starting = false; }
}
async function shutdown() {
  if (stopping) return; stopping = true;
  preparation?.abort();
  clearTimeout(reloadTimer); for (const w of watchers) w.close();
  for (const c of clients) c.destroy(); video?.destroy(); control?.destroy(); remote?.kill();
  await stopFlutter();
  if (forwarded) await adbRun('forward', '--remove', `tcp:${forwarded}`).catch(() => {});
  await new Promise(resolve => server.close(resolve));
}
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
return { url: origin, status: () => ({ ...state }), stop: shutdown };
}
