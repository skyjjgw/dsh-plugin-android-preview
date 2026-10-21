# 工程与兼容条件 / Project compatibility contract

本文件说明当前实现的固定条件，便于安装者和目录维护者核验。它不是通用 Flutter 工程适配器。
This documents the current implementation's fixed requirements for users and
catalog reviewers. It does not add a generic Flutter project adapter.

## 固定工程结构 / Fixed project layout

All paths below are relative to the configured `projectRoot`:

| Path | Role |
| --- | --- |
| `scripts/rolelife/environment.ps1` | Dot-sourced by the packaged preparation helper to configure the local toolchain. |
| `scripts/rolelife/start-debug-preview.ps1` | Invoked with `-PrepareOnly`; must finish preparing the configured emulator/toolchain without starting a competing Flutter debug attachment. |
| `apps/flutter/app` | Working directory for Flutter attach. |
| `apps/flutter/app/build/app/outputs/flutter-apk/app-debug.apk` | Existing debug APK installed with `adb install -r` when starting preview. |
| `apps/flutter/app/lib` | Watched recursively for Dart saves. |
| `apps/flutter/packages/operit_ui/lib` | Second watched Dart source directory. |

The project's environment script must set `FLUTTER_ROOT` to the installed Flutter
SDK containing `bin/cache/dart-sdk/bin/dart.exe` and
`bin/cache/flutter_tools.snapshot`. Other required Android/toolchain variables
must already be configured. The plugin's preparation helper returns an explicit
allowlist of development-toolchain environment variables as JSON; it does not
return unrelated API keys. The child process also inherits the host environment,
so this allowlist does not isolate processes from the host's existing privileges
or environment.

## 固定 Android 目标 / Fixed Android target

| Setting | Current value |
| --- | --- |
| Application ID | `com.skymoni.starcompanion.operit.debug` |
| Launch component | `com.skymoni.starcompanion.operit.debug/app.operit.MainActivity` |
| Accepted device serials | Explicit `emulator-` serials only; default `emulator-5556`. |
| scrcpy server protocol | Official scrcpy 3.3.3. |
| Host platform | Windows; the helper uses `powershell.exe` and Flutter's Windows Dart executable. |

These application identifiers and directory paths are currently fixed in
`lib/preview/server.mjs`. They are not exposed as plugin settings. A project with
a different application ID, activity, layout or startup contract requires an
implementation change and a fresh runtime check before claiming support.

## 声明与验证 / Declared and verified scope

The package declares Node.js `>=22.19.0` and DSH `>=0.2.1-rc.2`. Its client uses
the public renderer/right-sidebar services and its host injects `connection`.
The previously verified Windows workflow uses the configured Starcompanion /
Operit2 debug APK, portrait control and Dart hot reload. Later DSH previews,
arbitrary Android apps, physical devices, rotated control and other host
platforms are not covered by that runtime evidence.

Version 0.1.3 updates documentation and the package documentation allowlist.
Runtime files under `lib/`, project preparation code under `scripts/`, and
`cordis.patch.yml` are unchanged from v0.1.2.
