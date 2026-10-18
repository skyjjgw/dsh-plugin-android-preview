import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import z from '@deepseek-ai/schemastery';
import { validateSettings } from './settings.mjs';
import { createAndroidPreview } from './preview/server.mjs';

export const name = 'android-preview';
export const inject = ['connection'];
export const Config = z.object({
  projectRoot: z.string().default('').description('星伴/Operit2 项目根目录，需已有调试 APK 和 rolelife 预览脚本'),
  adbPath: z.string().default('').description('Android SDK platform-tools/adb.exe 的绝对路径'),
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
  const execute = promisify(execFile);
  const script = fileURLToPath(new URL('../scripts/prepare-environment.ps1', import.meta.url));
  let disposed = false;
  const ready = createAndroidPreview({
    ...settings,
    prepare: async signal => {
      const { stdout } = await execute('powershell.exe', ['-NoProfile', '-File', script, '-ProjectRoot', settings.projectRoot], { windowsHide: true, timeout: 150000, maxBuffer: 1024 * 1024, signal });
      return JSON.parse(stdout.trim());
    },
  });
  ctx.effect(() => () => { disposed = true; return ready.then(bridge => bridge.stop()).catch(() => {}); }, 'android-preview: owned loopback service');
  const bridge = await ready;
  if (disposed) return;
  ctx.connection.fetch.register({
    path: '/api/android-preview/info', methods: ['GET'], requestBody: 'buffered',
    fetch: async () => Response.json({ url: bridge.url, ...bridge.status() }),
  });
}
