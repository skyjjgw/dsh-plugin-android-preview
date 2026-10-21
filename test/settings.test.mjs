import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { validateSettings } from '../lib/settings.mjs';

for (const platform of ['win32', 'linux', 'darwin']) {
  const p = platform === 'win32' ? path.win32 : path.posix;
  const root = platform === 'win32' ? 'E:/projects/example' : '/projects/example';
  const valid = { projectRoot: root, adbPath: p.join(root, 'tools/adb'), scrcpyServer: p.join(root, 'tools/server'), applicationId: 'org.example.counter' };
  test(`${platform}: generic app configuration resolves monorepo paths and rejects unsafe settings`, () => {
    const settings = validateSettings({ ...valid, appDirectory: 'apps/counter', watchDirectories: ['lib', '../../packages/widgets/lib'] }, platform);
    assert.equal(settings.appRoot, p.resolve(root, 'apps/counter'));
    assert.equal(settings.apkPath, p.resolve(root, 'apps/counter/build/app/outputs/flutter-apk/app-debug.apk'));
    assert.deepEqual(settings.watchDirectories, [p.resolve(root, 'apps/counter/lib'), p.resolve(root, 'packages/widgets/lib')]);
    assert.equal(settings.port, 18772);
    assert.deepEqual(settings.frameAncestors, ['dsh-app://app']);
    for (const bad of [{ projectRoot: '../app' }, { serial: 'real-phone-123' }, { port: 80 }, { applicationId: '' }, { applicationId: 'org.example;id' }, { activity: '.Main;id' }, { appDirectory: '..' }, { watchDirectories: ['../outside'] }, { hotReload: 'false' }, { renderer: 'unknown' }, { prepareExecutable: 'sh' }, { prepareArgs: [5] }, { frameAncestors: ['*'] }, { frameAncestors: ['http://evil.example'] }, { frameAncestors: ['http://127.0.0.1:3080; frame-ancestors *'] }]) assert.throws(() => validateSettings({ ...valid, ...bad }, platform));
  });
}
