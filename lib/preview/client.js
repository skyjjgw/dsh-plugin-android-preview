const $ = id => document.getElementById(id);
const canvas = $('phone'), ctx = canvas.getContext('2d', { alpha: false });
const keyboard = $('keyboard');
let socket, decoder, config, codec, waitingKey = true, retry, active = false, lastPoint = { x: 0, y: 0 };
let videoWidth = 486, videoHeight = 1080;
let recoveryTimer;
let autoStarted = false;
const send = message => { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message)); };
function error(message) { $('mirror').textContent = message; $('connection').textContent = message; $('indicator').classList.remove('live'); }
function disposeDecoder() {
  const previous = decoder; decoder = null;
  if (previous && previous.state !== 'closed') previous.close();
}
function recoverDecoder(message) {
  error(message); waitingKey = true; disposeDecoder();
  clearTimeout(recoveryTimer); recoveryTimer = setTimeout(() => send({ type: 'refresh' }), 1000);
}
function findCodec(bytes) {
  for (let i = 0; i + 7 < bytes.length; i++) {
    let n = -1;
    if (bytes[i] === 0 && bytes[i + 1] === 0 && bytes[i + 2] === 1) n = i + 3;
    else if (bytes[i] === 0 && bytes[i + 1] === 0 && bytes[i + 2] === 0 && bytes[i + 3] === 1) n = i + 4;
    if (n >= 0 && (bytes[n] & 31) === 7) return 'avc1.' + [...bytes.slice(n + 1, n + 4)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  throw Error('视频配置中没有 H.264 SPS');
}
function configure(bytes) {
  config = bytes;
  const nextCodec = findCodec(bytes);
  if (decoder?.state === 'configured' && codec === nextCodec) return;
  disposeDecoder(); codec = nextCodec; waitingKey = true;
  decoder = new VideoDecoder({
    output(frame) {
      if (canvas.width !== frame.displayWidth || canvas.height !== frame.displayHeight) {
        canvas.width = frame.displayWidth; canvas.height = frame.displayHeight;
      }
      ctx.drawImage(frame, 0, 0, canvas.width, canvas.height); frame.close();
      $('placeholder').classList.add('hidden'); $('indicator').classList.add('live');
    },
    error(e) { recoverDecoder(`正在恢复视频：${e.message}`); }
  });
  // Annex B: omit description (which would request AVCC instead).
  decoder.configure({ codec, optimizeForLatency: true });
}
async function connect() {
  clearTimeout(retry);
  try {
    if (!globalThis.VideoDecoder) throw Error('当前浏览器不支持 WebCodecs，请更新浏览器或 DSH 客户端');
    const { token } = await (await fetch('/session')).json();
    socket = new WebSocket(`ws://${location.host}/stream?token=${token}`); socket.binaryType = 'arraybuffer';
    socket.onopen = () => { waitingKey = true; };
    socket.onmessage = ({ data }) => {
      try {
        if (typeof data === 'string') {
          const message = JSON.parse(data);
          if (message.type === 'status') {
            if (!autoStarted) { autoStarted = true; if (!/已就绪|热重载成功|正在/.test(message.flutter)) send({ type: 'start' }); }
            $('mirror').textContent = message.mirror; $('flutter').textContent = message.flutter;
            const ready = /已就绪|热重载成功/.test(message.flutter);
            $('connection').textContent = ready ? '' : /正在热重载/.test(message.flutter) ? '更新中…' : message.flutter;
            $('connection').title = message.flutter;
            $('reload').title = message.flutter + ' · 点击热重载';
            $('reload').disabled = message.hotReload === false;
            $('reload-count').textContent = message.hotReload === false ? 'Android 预览模式 · 热重载已关闭' : message.reloads ? `已完成 ${message.reloads} 次热重载` : '保存 Dart 界面代码后自动更新';
          }
          if (message.type === 'meta') { videoWidth = message.width; videoHeight = message.height; canvas.width = message.width; canvas.height = message.height; $('device').textContent = message.name; }
          return;
        }
        const view = new DataView(data), flags = view.getBigUint64(0), payload = new Uint8Array(data, 12);
        if (flags & (1n << 63n)) { configure(payload); return; }
        const key = !!(flags & (1n << 62n));
        if (!decoder || decoder.state !== 'configured' || (waitingKey && !key)) return;
        if (decoder.decodeQueueSize > 12) { decoder.reset(); decoder.configure({ codec, optimizeForLatency: true }); waitingKey = true; send({ type: 'refresh' }); return; }
        let bytes = payload;
        if (key && config) { bytes = new Uint8Array(config.length + payload.length); bytes.set(config); bytes.set(payload, config.length); }
        decoder.decode(new EncodedVideoChunk({ type: key ? 'key' : 'delta', timestamp: Number(flags & ((1n << 62n) - 1n)), data: bytes }));
        waitingKey = false;
      } catch (e) { recoverDecoder(e.message); }
    };
    socket.onclose = () => { active = false; clearTimeout(recoveryTimer); disposeDecoder(); error('连接已断开，正在重连…'); retry = setTimeout(connect, 2000); };
    socket.onerror = () => error('无法连接本地预览服务');
  } catch (e) { error(e.message); retry = setTimeout(connect, 2500); }
}
function point(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: Math.max(0, Math.min(videoWidth - 1, (event.clientX - rect.left) * videoWidth / rect.width)), y: Math.max(0, Math.min(videoHeight - 1, (event.clientY - rect.top) * videoHeight / rect.height)) };
}
canvas.addEventListener('pointerdown', e => { if (e.button !== 0) return; e.preventDefault(); keyboard.focus({ preventScroll: true }); canvas.setPointerCapture(e.pointerId); active = true; lastPoint = point(e); send({ type: 'touch', action: 0, ...lastPoint }); });
canvas.addEventListener('pointermove', e => { if (active) { lastPoint = point(e); send({ type: 'touch', action: 2, ...lastPoint }); } });
function release(e) { if (active) { active = false; lastPoint = point(e); send({ type: 'touch', action: 1, ...lastPoint }); } }
canvas.addEventListener('pointerup', release); canvas.addEventListener('pointercancel', release);
canvas.addEventListener('lostpointercapture', () => { if (active) { active = false; send({ type: 'touch', action: 1, ...lastPoint }); } });
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('wheel', e => { e.preventDefault(); send({ type: 'scroll', ...point(e), dx: -e.deltaX / 120, dy: -e.deltaY / 120 }); }, { passive: false });
keyboard.addEventListener('keydown', e => { const key = { Escape: 4, Enter: 66, Backspace: 67 }[e.key]; if (key && !e.isComposing) { e.preventDefault(); send({ type: 'key', key }); } });
document.querySelectorAll('[data-key]').forEach(button => button.onclick = () => send({ type: 'key', key: Number(button.dataset.key) }));
$('reload').onclick = () => send({ type: 'reload' });
$('restart').onclick = () => send({ type: 'restart' });
$('refresh').onclick = () => { if (socket?.readyState === WebSocket.OPEN) send({ type: 'refresh' }); else connect(); };
function commitText() { if (keyboard.value) { send({ type: 'text', text: keyboard.value.slice(0, 1000) }); keyboard.value = ''; } }
keyboard.addEventListener('input', e => { if (!e.isComposing) commitText(); });
keyboard.addEventListener('compositionend', () => queueMicrotask(commitText));
addEventListener('pagehide', () => { clearTimeout(retry); clearTimeout(recoveryTimer); socket?.close(); });
connect();
