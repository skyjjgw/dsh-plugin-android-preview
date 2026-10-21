# Android App Preview for DeepSeek Harness

[简体中文](README.md) · [Configuration and migration](docs/compatibility.md)

Operate a real Android emulator in a native DSH right sidebar: touch, scroll, type and navigate. Flutter debug APKs additionally support hot reload when Dart source changes. Configure your own APK, application ID, launch activity and source directories; standalone apps and monorepos work without Starcompanion / Operit2 or mandatory PowerShell scripts.

## Requirements and installation

- Node.js 22.19.0+, DSH 0.2.1-rc.2+ retaining the public sidebar, renderer and connection APIs.
- Windows, macOS or Linux with Android SDK, a **running emulator** and an external official **scrcpy 3.3.3 server**.
- An existing compatible APK. Flutter hot reload needs a debug APK matching the current source and Flutter SDK.
- No SDK downloads, emulator startup or APK builds are performed by default. Physical phones are not supported; rotated-screen control is not verified.

Desktop users can enter this source in their application's plugin installer:

```text
github:skyjjgw/dsh-plugin-android-preview#v0.2.0
```

For a separate CLI Web profile:

```sh
dsh plugin --profile web add github:skyjjgw/dsh-plugin-android-preview#v0.2.0
```

The package includes readable JavaScript and a `dsh.bundle.patch`, with no build or install lifecycle script. It is not published on npm. Desktop and CLI profiles are separate; configure the existing `android-preview` row rather than inserting a duplicate or replacing your profile.

## Flutter configuration

The following is the row's **config object**, not a full profile. Replace every path, ID and emulator serial with your actual values:

```yaml
projectRoot: /home/me/projects/my-counter
appDirectory: .
apkPath: build/app/outputs/flutter-apk/app-debug.apk
applicationId: com.example.my_counter
activity: .MainActivity
flutterRoot: /opt/flutter
adbPath: /home/me/Android/Sdk/platform-tools/adb
scrcpyServer: /home/me/tools/scrcpy-server
serial: emulator-5556
hotReload: true
watchDirectories:
  - lib
port: 18772
frameAncestors:
  - dsh-app://app
```

On Windows use native absolute paths such as `E:/projects/my-counter`, `E:/SDK/flutter` and `E:/Android/Sdk/platform-tools/adb.exe`. On macOS use paths such as `/Users/me/projects/my-counter`. The Dart executable is selected for the host OS. An empty `flutterRoot` uses `FLUTTER_ROOT`.

For monorepos, set `appDirectory: apps/mobile` and `watchDirectories: [lib, ../../packages/widgets/lib]`. Source directories must stay inside `projectRoot`. `apkPath` can also be absolute.

## Other Android apps

Set `hotReload: false` for an existing Kotlin, Java, React Native or other Android APK, and configure its actual `apkPath`, `applicationId` and `activity`. A Gradle debug APK might be at `app/build/outputs/apk/debug/app-debug.apk`. This mode installs, launches and mirrors the APK without a Flutter SDK or Dart watcher; it does not implement JavaScript/native hot reload. Rebuild changed APKs yourself, then use restart-app.

## Use and lifecycle

Start the configured emulator first, then open a chat and the phone-preview sidebar tab. Opening the tab installs and launches your APK; Flutter mode attaches its debugger afterward. Use mouse/touch, wheel, keyboard or explicit paste to operate the phone. Saving watched `.dart` files requests hot reload. The toolbar supports reload, video refresh and app restart; reload is disabled in plain Android mode.

Disabling the plugin closes its listener, sockets, watchers and owned Flutter process, retaining the emulator. Keep only one Flutter attachment per emulator. Native code, permissions and dependency changes require a new debug APK. `renderer: auto` preserves the app's renderer; `gpu` or `software` explicitly selects a Flutter fallback.

## Execution boundaries

No project scripts execute by default. Optional `prepareExecutable` (absolute path) and `prepareArgs` launch a trusted owner-configured program directly, without a shell. Its stdout must be a JSON environment object; see the [hook contract and migration guide](docs/compatibility.md).

Enabling a configured plugin starts an idle HTTP service on `127.0.0.1`. Opening the tab runs ADB/scrcpy, optional preparation and optional Flutter. WebSockets require local Host, exact Origin and a random same-origin session token. The discovery route uses the host connection layer's owner-Peer check. Frames allow `dsh-app://app` and explicitly configured loopback HTTP origins, never wildcards or external origins.

There are no model tools, microphone/audio, video recording, system clipboard reading or arbitrary shell/file HTTP APIs. Explicit typing/paste writes the Android clipboard; automatic clipboard synchronization is disabled. Child processes inherit the host environment. These checks are not an OS sandbox.

## Development

```sh
npm run check
npm test
npm pack --dry-run
```

Tests cover Windows/macOS/Linux path and launch selection, generic APK/Flutter startup, optional preparation, cancellation, loopback controls, protocol handling and disposal. CI runs on all three platforms. See the [verification scope](docs/compatibility.md) for actual emulator testing. React and the optional SDK peer come from the host. Licensing and origins: [NOTICE.md](NOTICE.md), [LICENSE](LICENSE).
