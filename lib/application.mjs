import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, stat } from 'node:fs/promises';
import path from 'node:path';

const execute = promisify(execFile);
const allowedEnvironment = /^(PATH|TEMP|TMP|TMPDIR|APPDATA|LOCALAPPDATA|USERPROFILE|HOME|JAVA_HOME|ANDROID_HOME|ANDROID_SDK_ROOT|ANDROID_AVD_HOME|ANDROID_USER_HOME|GRADLE_USER_HOME|PUB_CACHE|FLUTTER_ROOT|CARGO_HOME|RUSTUP_HOME|OPERIT_PREVIEW_RENDERER)$/i;

// Optional trusted, owner-configured hook. Never discover or execute project scripts.
export async function prepareEnvironment(settings, signal) {
  if (!settings.prepareExecutable) return {};
  const { stdout } = await execute(settings.prepareExecutable, settings.prepareArgs, {
    cwd: settings.projectRoot, windowsHide: true, shell: false,
    timeout: 150000, maxBuffer: 1024 * 1024, signal,
  });
  const result = JSON.parse(stdout.trim());
  if (!result || Array.isArray(result) || typeof result !== 'object') throw Error('准备命令须输出 JSON 环境变量对象');
  return Object.fromEntries(Object.entries(result).filter(([key, value]) => allowedEnvironment.test(key) && typeof value === 'string' && !value.includes('\0')));
}

export function flutterCommand(settings, environment, vmUrl, platform = process.platform) {
  const paths = platform === 'win32' ? path.win32 : path.posix;
  const sdk = settings.flutterRoot || environment.FLUTTER_ROOT;
  if (!sdk || !paths.isAbsolute(sdk)) throw Error('请配置 flutterRoot 或 FLUTTER_ROOT 为 Flutter SDK 绝对路径');
  return {
    executable: paths.join(sdk, 'bin/cache/dart-sdk/bin', platform === 'win32' ? 'dart.exe' : 'dart'),
    args: [paths.join(sdk, 'bin/cache/flutter_tools.snapshot'), 'attach', '--machine', '--debug', '-d', settings.serial, `--app-id=${settings.applicationId}`, `--debug-url=${vmUrl}`],
    cwd: settings.appRoot,
  };
}

export async function checkApplication(settings, environment) {
  if (!(await stat(settings.apkPath)).isFile()) throw Error('apkPath 须指向已构建 APK 文件');
  if (!settings.hotReload) return;
  const command = flutterCommand(settings, environment, 'http://127.0.0.1:1/');
  await access(command.executable);
  await access(command.args[0]);
  for (const directory of settings.watchDirectories) if (!(await stat(directory)).isDirectory()) throw Error(`监听路径不是目录：${directory}`);
}

// adbRun is an argument-vector runner bound to the explicitly selected emulator.
// This shared path is used by both plain Android APK and Flutter previews.
export async function launchApplication(settings, adbRun, signal, delay = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  const run = async (...args) => { signal?.throwIfAborted(); return adbRun(...args); };
  await run('install', '-r', settings.apkPath);
  await run('shell', 'am', 'force-stop', settings.applicationId);
  const extras = settings.hotReload && settings.renderer !== 'auto'
    ? ['--ez', 'enable-impeller', 'false', '--ez', 'enable-software-rendering', String(settings.renderer === 'software')]
    : [];
  const launched = await run('shell', 'am', 'start', '-W', '-n', `${settings.applicationId}/${settings.activity}`, ...extras);
  if (/(?:^|\n)(?:Error:|Error type |.*Exception)/.test(`${launched.stdout}\n${launched.stderr ?? ''}`)) throw Error('Android Activity 启动失败，请核对 applicationId 和 activity');
  if (!settings.hotReload) return null;
  let pid;
  for (let i = 0; i < 30; i++) {
    pid = await run('shell', 'pidof', settings.applicationId).then(result => result.stdout.trim()).catch(error => { signal?.throwIfAborted(); return ''; });
    if (/^\d+$/.test(pid)) break;
    await delay(300);
  }
  if (!/^\d+$/.test(pid)) throw Error('Debug App did not start');
  for (let i = 0; i < 60; i++) {
    const logs = (await run('logcat', '-d', '--pid', pid, '-t', '500', '-v', 'brief')).stdout;
    const matches = [...logs.matchAll(/Dart VM service is listening on (http:\/\/127\.0\.0\.1:\d+\/[A-Za-z0-9_=-]+\/)/g)];
    if (matches.length) return matches.at(-1)[1];
    await delay(500);
  }
  throw Error('Debug VM startup timed out; check Android logs');
}
