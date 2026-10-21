import z from '@deepseek-ai/schemastery';
import { validateSettings } from './settings.mjs';
import { prepareEnvironment } from './application.mjs';
import { createAndroidPreview } from './preview/server.mjs';

export const name = 'android-preview';
export const inject = ['connection'];
export const Config = z.object({
  projectRoot: z.string().default('').description('Android/Flutter 工程根目录的绝对路径'),
  appDirectory: z.string().default('.').description('App 目录，相对 projectRoot'),
  apkPath: z.string().default('build/app/outputs/flutter-apk/app-debug.apk').description('已构建 APK，相对 App 目录或绝对路径'),
  applicationId: z.string().default('').description('实际 APK 包名，必填'),
  activity: z.string().default('.MainActivity').description('启动 Activity，可填写完整类名'),
  flutterRoot: z.string().default('').description('Flutter SDK 绝对路径，留空使用 FLUTTER_ROOT'),
  hotReload: z.boolean().default(true).description('普通 Android APK 请关闭；Flutter 调试 APK 可开启'),
  watchDirectories: z.array(z.string()).default(['lib']).description('Dart 源码目录，相对 App 目录且在工程根目录内'),
  renderer: z.string().default('auto').description('auto 保留 App 默认；gpu/software 显式指定 Flutter 渲染'),
  prepareExecutable: z.string().default('').description('可选：可信准备命令的绝对路径，默认不执行工程脚本'),
  prepareArgs: z.array(z.string()).default([]).description('准备命令参数，stdout 须为 JSON 环境变量对象'),
  adbPath: z.string().default('').description('Android SDK platform-tools/adb 的绝对路径（Windows 为 adb.exe）'),
  scrcpyServer: z.string().default('').description('官方 scrcpy 3.3.3 scrcpy-server 文件的绝对路径'),
  port: z.natural().min(1024).max(65535).default(18772),
  serial: z.string().default('emulator-5556'),
  frameAncestors: z.array(z.string()).default(['dsh-app://app']).description('允许嵌入预览的本机 Harness 来源，禁止通配符'),
});

export async function apply(ctx, input) {
  let settings;
  try { settings = validateSettings(input); }
  catch (error) {
    ctx.connection.fetch.register({ path: '/api/android-preview/info', methods: ['GET'], requestBody: 'buffered', fetch: async () => Response.json({ error: error.message }) });
    return;
  }
  let disposed = false;
  const ready = createAndroidPreview({
    ...settings,
    prepare: signal => prepareEnvironment(settings, signal),
  });
  ctx.effect(() => () => { disposed = true; return ready.then(bridge => bridge.stop()).catch(() => {}); }, 'android-preview: owned loopback service');
  const bridge = await ready;
  if (disposed) return;
  ctx.connection.fetch.register({
    path: '/api/android-preview/info', methods: ['GET'], requestBody: 'buffered',
    fetch: async () => Response.json({ url: bridge.url, ...bridge.status() }),
  });
}
