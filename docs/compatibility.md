# Configuration, compatibility and migration / 配置与迁移

Version 0.2.0 replaces the fixed Windows/Starcompanion adapter with configurable Android/Flutter startup. Installing does not discover or execute project scripts. / 0.2.0 不再固定 Windows、工程目录、包名或 PowerShell 启动器。

## Settings

| Setting | Contract |
| --- | --- |
| `projectRoot` | Required native absolute project path. |
| `appDirectory` | Default `.`; resolves within project root. |
| `apkPath` | Default `build/app/outputs/flutter-apk/app-debug.apk`, relative to app directory or absolute. Must already exist. |
| `applicationId` | Required real APK package identifier; no brand-specific default. |
| `activity` | Default `.MainActivity`; may be fully qualified. |
| `adbPath`, `scrcpyServer` | Required absolute paths; external official scrcpy **3.3.3** server. |
| `serial` | Default `emulator-5556`; only explicit `emulator-NNNN[N]` targets. |
| `flutterRoot` | Absolute SDK path, or empty to use `FLUTTER_ROOT`; required only for hot reload. |
| `hotReload` | Default `true`; set `false` for non-Flutter APKs. |
| `watchDirectories` | Default `[lib]`, relative to app directory; may reference monorepo siblings within project root. Max 32 directories. |
| `renderer` | `auto` (default, no extra flags), `gpu` or `software` (explicit Skia launch flags). |
| `prepareExecutable`, `prepareArgs` | Empty by default. Optional trusted program's absolute path and string argument array (max 64). |
| `port` | Default `18772`, range 1024–65535, binds only `127.0.0.1`. |
| `frameAncestors` | Default `[dsh-app://app]`; optionally exact `http://127.0.0.1:PORT`, max 8, no external origins/wildcards. |

Paths resolve using the host OS. The plugin calls executables with argument arrays rather than shell commands. macOS/Linux use SDK `bin/cache/dart-sdk/bin/dart`; Windows uses `dart.exe`. SDK tools must already be runnable. The APK must support the selected emulator ABI/API; a matching Flutter debug APK and sources are needed for hot reload. Audio and physical devices are out of scope. Rotation handling is unverified.

## Optional preparation protocol / 可选准备命令

Run only when the phone tab starts/restarts, with cwd=`projectRoot`, a 150-second timeout, 1 MiB output cap, cancellation and no shell. Stdout must contain only a JSON object of string environment values; send diagnostics to stderr. Accepted toolchain keys: PATH, TEMP, TMP, TMPDIR, APPDATA, LOCALAPPDATA, USERPROFILE, HOME, JAVA_HOME, ANDROID_HOME, ANDROID_SDK_ROOT, ANDROID_AVD_HOME, ANDROID_USER_HOME, GRADLE_USER_HOME, PUB_CACHE, FLUTTER_ROOT, CARGO_HOME, RUSTUP_HOME and the legacy OPERIT_PREVIEW_RENDERER. Unknown keys are omitted. `renderer` is selected by plugin config, not the legacy environment variable.

The hook is trusted local code and can do anything the current user can. The child environment merges accepted hook values into the inherited host environment; the allowlist is not isolation of host secrets. Use an absolute executable (Node, Bash, pwsh, or Windows PowerShell) and separate arguments. No hook is necessary for a prebuilt APK and configured SDK paths.

## Upgrade from 0.1.x / 旧版升级

0.1.x fixed the app layout and Android package. In 0.2.0 those values must be explicit. Existing Starcompanion/Operit2 users can retain their app with:

```yaml
appDirectory: apps/flutter/app
applicationId: com.skymoni.starcompanion.operit.debug
activity: app.operit.MainActivity
watchDirectories:
  - lib
  - ../packages/operit_ui/lib
renderer: gpu
```

Keep your actual `projectRoot`, APK, ADB, scrcpy and Flutter SDK paths. For projects that still require the old preparation helpers, the packaged `scripts/prepare-environment.ps1` remains an **opt-in Windows adapter**. Configure `prepareExecutable` to the absolute `powershell.exe` path and `prepareArgs` to `[-NoProfile, -File, <absolute installed adapter path>, -ProjectRoot, <projectRoot>]`. The adapter expects `scripts/rolelife/environment.ps1` and `start-debug-preview.ps1` in that project. Do not add it for unrelated apps.

## Verification scope

- Protocol, command-vector, path, hook, cancellation and idle lifecycle tests are runnable without Android/Flutter installed.
- CI matrix exercises Node 22.19.0 and 24 on Windows, macOS and Linux; check the actual workflow results rather than interpreting the matrix as a completed test report.
- Real emulator verification and install receipts for this release are recorded in the release notes. macOS/Linux emulator sessions have not been tested locally; portable implementation and CI do not establish driver/codec compatibility on every machine.
- DSH minimum host is 0.2.1-rc.2. Later host versions must retain the public APIs; not every preview version is verified.
