import path from 'node:path';

export function validateSettings(input = {}) {
  const value = {
    projectRoot: input.projectRoot ?? '',
    adbPath: input.adbPath ?? '',
    scrcpyServer: input.scrcpyServer ?? '',
    port: input.port ?? 18772,
    serial: input.serial ?? 'emulator-5556',
    frameAncestors: input.frameAncestors ?? ['dsh-app://app'],
  };
  for (const key of ['projectRoot', 'adbPath', 'scrcpyServer']) {
    if (typeof value[key] !== 'string' || !path.isAbsolute(value[key]) || /[\r\n\0]/.test(value[key])) throw Error(`请配置 ${key} 为本机绝对路径`);
  }
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
