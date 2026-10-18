import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import http from 'node:http';
import { createAndroidPreview } from '../lib/preview/server.mjs';

async function freePort() {
  const probe = net.createServer(); await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port; await new Promise(resolve => probe.close(resolve)); return port;
}
function request(port, pathname, headers = {}) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: pathname, headers }, response => {
      let body = ''; response.on('data', data => body += data); response.on('end', () => resolve({ code: response.statusCode, body, headers: response.headers }));
    }).on('error', reject);
  });
}
test('plugin activation serves an idle preview without launching Android; disposal releases the port', async () => {
  const port = await freePort(); let prepared = 0;
  const bridge = await createAndroidPreview({ projectRoot: process.cwd(), adbPath: 'missing-adb.exe', scrcpyServer: 'missing-server', port, frameAncestors: ['dsh-app://app'], prepare: async () => { prepared++; return {}; } });
  try {
    const health = await request(port, '/health'); assert.equal(health.code, 200); assert.equal(prepared, 0);
    assert.equal(JSON.parse(health.body).service, 'dsh-android-preview');
    assert.match(JSON.parse(health.body).flutter, /尚未启动/);
    const page = await request(port, '/'); assert.equal(page.code, 200); assert.match(page.headers['content-security-policy'], /frame-ancestors dsh-app:\/\/app;/);
    assert.equal((await request(port, '/session')).code, 403);
    assert.equal((await request(port, '/health', { Host: 'evil.example' })).code, 403);
    assert.equal((await request(port, '/index.js')).code, 404);
  } finally { await bridge.stop(); }
  await assert.rejects(request(port, '/health'));
  assert.equal(prepared, 0);
});
