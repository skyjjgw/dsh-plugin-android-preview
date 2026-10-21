import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { checkApplication, flutterCommand, launchApplication, prepareEnvironment } from '../lib/application.mjs';
import { validateSettings } from '../lib/settings.mjs';

const app = { applicationId: 'dev.example.otherapp', activity: 'dev.example.Launcher', apkPath: '/build/My App.apk', serial: 'emulator-5558', hotReload: true, renderer: 'auto', appRoot: '/work/app' };

test('Flutter startup uses configured APK/package/activity, waits for VM and keeps default renderer', async () => {
  const calls = []; let logs = 0;
  const result = await launchApplication(app, async (...args) => {
    calls.push(args);
    return { stdout: args[0] === 'logcat' ? (++logs === 1 ? 'Waiting...' : 'Dart VM service is listening on http://127.0.0.1:4321/token=/') : args.includes('pidof') ? '1234\n' : '' };
  }, undefined, async () => {});
  assert.equal(result, 'http://127.0.0.1:4321/token=/');
  assert.deepEqual(calls.slice(0, 3), [['install', '-r', '/build/My App.apk'], ['shell', 'am', 'force-stop', 'dev.example.otherapp'], ['shell', 'am', 'start', '-W', '-n', 'dev.example.otherapp/dev.example.Launcher']]);
  assert.equal(logs, 2);
  assert.ok(calls.some(args => args.includes('dev.example.otherapp') && args.includes('pidof')));
});

test('plain Android preview never polls for a Dart VM and does not add Flutter launch extras', async () => {
  const calls = [];
  assert.equal(await launchApplication({ ...app, hotReload: false, renderer: 'software' }, async (...args) => { calls.push(args); return { stdout: '' }; }), null);
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[2], ['shell', 'am', 'start', '-W', '-n', 'dev.example.otherapp/dev.example.Launcher']);
});

test('ADB Activity errors do not report a plain Android app as ready', async () => {
  await assert.rejects(launchApplication({ ...app, hotReload: false }, async (...args) => ({ stdout: args.includes('start') ? 'Error type 3\nError: Activity class does not exist.' : '' })), /Activity/);
});

test('explicit renderer and cancellation propagate without launching another app', async () => {
  const calls = [], controller = new AbortController();
  await assert.rejects(launchApplication({ ...app, renderer: 'software' }, async (...args) => { calls.push(args); if (calls.length === 3) controller.abort(); return { stdout: '' }; }, controller.signal), { name: 'AbortError' });
  assert.deepEqual(calls[2].slice(-6), ['--ez', 'enable-impeller', 'false', '--ez', 'enable-software-rendering', 'true']);
  assert.equal(calls.length, 3);
});

for (const platform of ['win32', 'linux', 'darwin']) test(`${platform}: attach uses the platform Dart executable, selected emulator and configured app`, () => {
  const p = platform === 'win32' ? path.win32 : path.posix, sdk = platform === 'win32' ? 'E:/Flutter SDK' : '/opt/Flutter SDK';
  const command = flutterCommand({ ...app, flutterRoot: sdk }, {}, 'http://127.0.0.1:4321/token=/', platform);
  assert.equal(command.executable, p.join(sdk, 'bin/cache/dart-sdk/bin', platform === 'win32' ? 'dart.exe' : 'dart'));
  assert.ok(command.args.includes('--app-id=dev.example.otherapp'));
  assert.deepEqual(command.args.slice(4, 6), ['-d', 'emulator-5558']);
  assert.equal(command.cwd, '/work/app');
});

test('Android-only preflight and optional environment hook work without any Flutter or PowerShell', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'dsh-preview-'));
  try {
    const settings = validateSettings({ projectRoot: directory, applicationId: 'org.example.nativeapp', adbPath: process.execPath, scrcpyServer: process.execPath, apkPath: 'native.apk', hotReload: false });
    await writeFile(settings.apkPath, 'test-fixture');
    await checkApplication(settings, {});
    assert.deepEqual(await prepareEnvironment(settings), {});
    const hook = path.join(directory, 'prepare.mjs');
    await writeFile(hook, 'process.stdout.write(JSON.stringify({FLUTTER_ROOT:process.cwd(),UNRELATED_SECRET:"omit",PATH:"test"}))');
    const prepared = await prepareEnvironment({ ...settings, prepareExecutable: process.execPath, prepareArgs: [hook] });
    assert.equal(await realpath(prepared.FLUTTER_ROOT), await realpath(directory));
    assert.deepEqual(Object.keys(prepared).sort(), ['FLUTTER_ROOT', 'PATH']);
    await assert.rejects(checkApplication({ ...settings, hotReload: true }, {}), /flutterRoot/);
    await mkdir(path.join(directory, 'missing.apk'));
    await assert.rejects(checkApplication({ ...settings, apkPath: path.join(directory, 'missing.apk') }, {}), /APK/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
