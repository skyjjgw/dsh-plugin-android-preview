// scrcpy 3.3.3 wire protocol. See README.md for upstream sources/licences.
export function authorizeUpgrade(req, token, port) {
  try {
    const origin = `http://127.0.0.1:${port}`, url = new URL(req.url, origin);
    return req.headers.host === `127.0.0.1:${port}` && req.headers.origin === origin && url.pathname === '/stream' && url.searchParams.get('token') === token && req.headers['sec-websocket-version'] === '13' && typeof req.headers['sec-websocket-key'] === 'string' && /^[A-Za-z0-9+/]{22}==$/.test(req.headers['sec-websocket-key']);
  } catch { return false; }
}

export function controlPacket(message, width, height) {
  const { type } = message;
  if (!Number.isInteger(width) || width < 1 || width > 65535 || !Number.isInteger(height) || height < 1 || height > 65535) throw Error('Invalid screen size');
  const point = () => {
    if (![message.x, message.y].every(Number.isFinite)) throw Error('Invalid coordinates');
    return [Math.max(0, Math.min(width - 1, Math.round(message.x))), Math.max(0, Math.min(height - 1, Math.round(message.y)))];
  };
  if (type === 'touch') {
    if (![0, 1, 2].includes(message.action)) throw Error('Invalid touch action');
    const [x, y] = point(), b = Buffer.alloc(32);
    b[0] = 2; b[1] = message.action; b.writeBigInt64BE(-2n, 2);
    b.writeInt32BE(x, 10); b.writeInt32BE(y, 14);
    b.writeUInt16BE(width, 18); b.writeUInt16BE(height, 20);
    b.writeUInt16BE(message.action === 1 ? 0 : 65535, 22); return b;
  }
  if (type === 'key') {
    if (![3, 4, 187, 66, 67].includes(message.key)) throw Error('Key not allowed');
    const b = Buffer.alloc(28);
    for (const [offset, action] of [[0, 0], [14, 1]]) {
      b[offset] = 0; b[offset + 1] = action; b.writeUInt32BE(message.key, offset + 2);
    }
    return b;
  }
  if (type === 'scroll') {
    if (![message.dx, message.dy].every(Number.isFinite)) throw Error('Invalid scroll');
    const [x, y] = point(), b = Buffer.alloc(21);
    b[0] = 3; b.writeInt32BE(x, 1); b.writeInt32BE(y, 5);
    b.writeUInt16BE(width, 9); b.writeUInt16BE(height, 11);
    const fixed = v => Math.max(-32768, Math.min(32767, Math.trunc(v * 2048)));
    b.writeInt16BE(fixed(message.dx), 13); b.writeInt16BE(fixed(message.dy), 15); return b;
  }
  // Only explicitly typed text is sent. Never read either system clipboard.
  if (type === 'text' && typeof message.text === 'string') {
    const text = Buffer.from(message.text);
    if (!text.length || text.length > 4096) throw Error('Text must be 1–4096 UTF-8 bytes');
    const b = Buffer.alloc(14 + text.length);
    b[0] = 9; b[9] = 1; b.writeUInt32BE(text.length, 10); text.copy(b, 14); return b;
  }
  throw Error('Control not allowed');
}

export class VideoParser {
  buffer = Buffer.alloc(0); ready = false;
  constructor(onMeta, onFrame) { this.onMeta = onMeta; this.onFrame = onFrame; }
  push(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    if (!this.ready && this.buffer.length >= 77) {
      const b = this.buffer;
      if (b[0] !== 0 || b.toString('ascii', 65, 69) !== 'h264') throw Error('Unexpected scrcpy handshake');
      const width = b.readUInt32BE(69), height = b.readUInt32BE(73);
      if (!width || !height || width > 65535 || height > 65535) throw Error('Invalid video dimensions');
      this.onMeta({ width, height, name: b.subarray(1, 65).toString('utf8').replace(/\0.*$/, '') });
      this.buffer = b.subarray(77); this.ready = true;
    }
    while (this.ready && this.buffer.length >= 12) {
      const size = this.buffer.readUInt32BE(8);
      if (size > 16 * 1024 * 1024) throw Error('Video packet too large');
      if (this.buffer.length < 12 + size) break;
      const packet = this.buffer.subarray(0, 12 + size);
      this.buffer = this.buffer.subarray(12 + size); this.onFrame(packet);
    }
  }
}

export function wsFrame(payload, opcode = 2) {
  payload = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const header = Buffer.alloc(payload.length < 126 ? 2 : payload.length <= 65535 ? 4 : 10);
  header[0] = 0x80 | opcode;
  if (header.length === 2) header[1] = payload.length;
  else if (header.length === 4) { header[1] = 126; header.writeUInt16BE(payload.length, 2); }
  else { header[1] = 127; header.writeBigUInt64BE(BigInt(payload.length), 2); }
  return Buffer.concat([header, payload]);
}

// Browser controls are small, unfragmented masked text frames; reject everything else.
export class ClientFrames {
  buffer = Buffer.alloc(0);
  constructor(onFrame) { this.onFrame = onFrame; }
  push(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 2) {
      const b = this.buffer, opcode = b[0] & 15;
      if ((b[0] & 0xf0) !== 0x80 || !(b[1] & 0x80) || ![1, 8, 9, 10].includes(opcode)) throw Error('Invalid WebSocket frame');
      let length = b[1] & 127, offset = 2;
      if (length === 127) throw Error('Client frame too large');
      if (length === 126) { if (b.length < 4) return; length = b.readUInt16BE(2); offset = 4; }
      if (length > 8192 || (opcode >= 8 && length > 125)) throw Error('Client frame too large');
      if (b.length < offset + 4 + length) return;
      const mask = b.subarray(offset, offset + 4), data = Buffer.from(b.subarray(offset + 4, offset + 4 + length));
      for (let i = 0; i < length; i++) data[i] ^= mask[i % 4];
      this.buffer = b.subarray(offset + 4 + length); this.onFrame(opcode, data);
    }
  }
}
