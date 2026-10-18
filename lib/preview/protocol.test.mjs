import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authorizeUpgrade, controlPacket, VideoParser, wsFrame, ClientFrames } from './protocol.mjs';

test('touch coordinates are clamped and finger pressure ends on release', () => {
  const packet = controlPacket({ type: 'touch', action: 0, x: -4, y: 2500 }, 486, 1080);
  assert.equal(packet.length, 32); assert.equal(packet[0], 2); assert.equal(packet.readBigInt64BE(2), -2n);
  assert.equal(packet.readInt32BE(10), 0); assert.equal(packet.readInt32BE(14), 1079);
  assert.equal(packet.readUInt16BE(18), 486); assert.equal(packet.readUInt16BE(20), 1080); assert.equal(packet.readUInt16BE(22), 65535);
  assert.equal(controlPacket({ type: 'touch', action: 1, x: 1, y: 1 }, 486, 1080).readUInt16BE(22), 0);
});
test('buttons and scrolling encode Android events with correct fixed point scale', () => {
  const key = controlPacket({ type: 'key', key: 4 }, 486, 1080);
  assert.equal(key.length, 28); assert.equal(key.readUInt32BE(2), 4); assert.equal(key[15], 1); assert.equal(key.readUInt32BE(16), 4);
  const scroll = controlPacket({ type: 'scroll', x: 10, y: 20, dx: 1, dy: -99 }, 486, 1080);
  assert.equal(scroll.length, 21); assert.equal(scroll.readInt16BE(13), 2048); assert.equal(scroll.readInt16BE(15), -32768);
});
test('Chinese explicit text uses UTF-8 byte length, unknown controls never execute', () => {
  const packet = controlPacket({ type: 'text', text: '星伴' }, 486, 1080);
  assert.equal(packet[0], 9); assert.equal(packet[9], 1); assert.equal(packet.readUInt32BE(10), 6); assert.equal(packet.subarray(14).toString(), '星伴');
  for (const m of [{ type: 'shell', command: 'whoami' }, { type: 'key', key: 26 }, { type: 'touch', action: 9, x: 0, y: 0 }, { type: 'touch', action: 0, x: NaN, y: 0 }, { type: 'text', text: 'x'.repeat(4097) }]) assert.throws(() => controlPacket(m, 486, 1080));
});
test('scrcpy stream accepts arbitrary TCP splits without losing flags or frame boundaries', () => {
  const header = Buffer.alloc(77); header.write('phone', 1); header.write('h264', 65); header.writeUInt32BE(486, 69); header.writeUInt32BE(1080, 73);
  const frame = Buffer.alloc(15); frame.writeBigUInt64BE((1n << 62n) | 42n); frame.writeUInt32BE(3, 8); frame.set([1, 2, 3], 12);
  let meta, frames = [];
  const parser = new VideoParser(m => { meta = m; }, p => frames.push(Buffer.from(p)));
  for (const byte of Buffer.concat([header, frame, frame])) parser.push(Buffer.from([byte]));
  assert.deepEqual(meta, { width: 486, height: 1080, name: 'phone' }); assert.equal(frames.length, 2); assert.deepEqual(frames[0], frame);
  const oversized = Buffer.alloc(12); oversized.writeUInt32BE(17 * 1024 * 1024, 8); assert.throws(() => parser.push(oversized));
});
test('websocket parses masked TCP splits and rejects unmasked/oversized controls', () => {
  const payload = Buffer.from('{"type":"reload"}'), mask = Buffer.from([1, 2, 3, 4]);
  const frame = Buffer.concat([Buffer.from([0x81, 0x80 | payload.length]), mask, payload.map((b, i) => b ^ mask[i % 4])]);
  let messages = []; const parser = new ClientFrames((op, d) => messages.push([op, d.toString()]));
  parser.push(frame.subarray(0, 3)); parser.push(frame.subarray(3));
  assert.deepEqual(messages, [[1, payload.toString()]]);
  assert.throws(() => new ClientFrames(() => {}).push(wsFrame(payload, 1)));
  assert.throws(() => new ClientFrames(() => {}).push(Buffer.from([0x81, 0xff])));
  assert.throws(() => new ClientFrames(() => {}).push(Buffer.from([0x09, 0x80])));
  for (const size of [5, 200, 70000]) { const encoded = wsFrame(Buffer.alloc(size)); assert.equal(encoded.length, size + (size < 126 ? 2 : size <= 65535 ? 4 : 10)); }
});
test('device control requires local Host, exact Origin, token and valid upgrade', () => {
  const req = { url: '/stream?token=secret', headers: { host: '127.0.0.1:18771', origin: 'http://127.0.0.1:18771', 'sec-websocket-version': '13', 'sec-websocket-key': 'a'.repeat(22) + '==' } };
  assert.equal(authorizeUpgrade(req, 'secret', 18771), true);
  for (const [key, value] of [['origin', 'https://evil.example'], ['origin', undefined], ['host', 'evil.example:18771'], ['sec-websocket-key', 'invalid']]) assert.equal(authorizeUpgrade({ ...req, headers: { ...req.headers, [key]: value } }, 'secret', 18771), false);
  assert.equal(authorizeUpgrade(req, 'wrong', 18771), false);
  assert.equal(authorizeUpgrade({ ...req, url: 'http://[' }, 'secret', 18771), false);
});
