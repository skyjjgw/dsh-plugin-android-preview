import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSettings } from '../lib/settings.mjs';

const valid = { projectRoot: 'E:/projects/app', adbPath: 'E:/tools/adb.exe', scrcpyServer: 'E:/tools/scrcpy-server' };
test('configuration limits embedding and control to explicit local resources', () => {
  assert.equal(validateSettings(valid).port, 18772);
  assert.deepEqual(validateSettings(valid).frameAncestors, ['dsh-app://app']);
  for (const bad of [{ projectRoot: '../app' }, { serial: 'real-phone-123' }, { port: 80 }, { frameAncestors: ['*'] }, { frameAncestors: ['http://evil.example'] }, { frameAncestors: ['http://127.0.0.1:3080; frame-ancestors *'] }]) assert.throws(() => validateSettings({ ...valid, ...bad }));
});
