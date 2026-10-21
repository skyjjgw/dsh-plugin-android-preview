import path from 'node:path';

export function validateSettings(input = {}, platform = process.platform) {
  const paths = platform === 'win32' ? path.win32 : path.posix;
  const value = {
    projectRoot: input.projectRoot ?? '',
    adbPath: input.adbPath ?? '',
    scrcpyServer: input.scrcpyServer ?? '',
    port: input.port ?? 18772,
    serial: input.serial ?? 'emulator-5556',
    frameAncestors: input.frameAncestors ?? ['dsh-app://app'],
    appDirectory: input.appDirectory ?? '.',
    apkPath: input.apkPath ?? 'build/app/outputs/flutter-apk/app-debug.apk',
    applicationId: input.applicationId ?? '',
    activity: input.activity ?? '.MainActivity',
    flutterRoot: input.flutterRoot ?? '',
    hotReload: input.hotReload ?? true,
    watchDirectories: input.watchDirectories ?? ['lib'],
    renderer: input.renderer ?? 'auto',
    prepareExecutable: input.prepareExecutable ?? '',
    prepareArgs: input.prepareArgs ?? [],
  };
  for (const key of ['projectRoot', 'adbPath', 'scrcpyServer']) {
    if (typeof value[key] !== 'string' || !paths.isAbsolute(value[key]) || /[\r\n\0]/.test(value[key])) throw Error(`请配置 ${key} 为本机绝对路径`);
  }
  for (const key of ['flutterRoot', 'prepareExecutable']) {
    if (typeof value[key] !== 'string' || (value[key] && (!paths.isAbsolute(value[key]) || /[\r\n\0]/.test(value[key])))) throw Error(`${key} 须为空或本机绝对路径`);
  }
  const inside = (base, item) => {
    if (typeof item !== 'string' || !item || /[\r\n\0]/.test(item)) throw Error('无效工程路径');
    const resolved = paths.resolve(base, item), relative = paths.relative(value.projectRoot, resolved);
    if (relative === '..' || relative.startsWith(`..${paths.sep}`) || paths.isAbsolute(relative)) throw Error('源码目录须在 projectRoot 内');
    return resolved;
  };
  value.appRoot = inside(value.projectRoot, value.appDirectory);
  if (typeof value.apkPath !== 'string' || !value.apkPath || /[\r\n\0]/.test(value.apkPath)) throw Error('请配置 apkPath');
  value.apkPath = paths.resolve(value.appRoot, value.apkPath);
  if (typeof value.applicationId !== 'string' || !/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/.test(value.applicationId)) throw Error('请配置实际 APK 的 applicationId');
  if (typeof value.activity !== 'string' || !/^\.?[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/.test(value.activity)) throw Error('请配置实际启动 activity（如 .MainActivity）');
  if (typeof value.hotReload !== 'boolean') throw Error('hotReload 须为布尔值');
  if (!['auto', 'gpu', 'software'].includes(value.renderer)) throw Error('renderer 须为 auto、gpu 或 software');
  if (!Array.isArray(value.watchDirectories) || value.watchDirectories.length > 32) throw Error('watchDirectories 须为目录数组（最多 32 项）');
  value.watchDirectories = value.watchDirectories.map(item => inside(value.appRoot, item));
  if (!Array.isArray(value.prepareArgs) || value.prepareArgs.length > 64 || value.prepareArgs.some(item => typeof item !== 'string' || /\0/.test(item))) throw Error('prepareArgs 须为字符串数组（最多 64 项）');
  if (!Number.isInteger(value.port) || value.port < 1024 || value.port > 65535) throw Error('预览端口须为 1024–65535');
  // This release deliberately targets emulators, never another authorized phone.
  if (typeof value.serial !== 'string' || !/^emulator-\d{4,5}$/.test(value.serial)) throw Error('仅支持明确指定的 Android 模拟器');
  if (!Array.isArray(value.frameAncestors) || value.frameAncestors.length > 8) throw Error('Invalid frame ancestor list');
  for (const item of value.frameAncestors) {
    if (item === 'dsh-app://app') continue;
    if (typeof item !== 'string' || !/^http:\/\/127\.0\.0\.1:\d{1,5}$/.test(item)) throw Error('嵌入来源仅支持 dsh-app://app 或明确的本机 HTTP origin');
    const parsed = new URL(item);
    if (parsed.origin !== item) throw Error('Invalid frame ancestor origin');
  }
  return value;
}
