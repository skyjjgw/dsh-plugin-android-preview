# Android App Preview for DeepSeek Harness

[简体中文](README.md) · [Project compatibility contract](docs/compatibility.md)

Operate a real Android emulator in a native DeepSeek Harness right sidebar tab,
and hot-reload Dart changes while editing a configured Starcompanion / Operit2
Flutter project. The plugin uses an existing debug APK and public DSH APIs.

## Requirements

- Windows, Node.js 22.19.0+, and DSH 0.2.1-rc.2+ retaining the same public
  sidebar, renderer and connection APIs. The minimum host version is declared
  in `engines.dsh`; this is not a claim that every later preview was tested.
- An existing Starcompanion / Operit2-derived project with the layout, helper
  scripts and debug Android package specified in the [compatibility contract](docs/compatibility.md).
- An installed Android SDK/emulator, the project's Flutter SDK and an external
  official scrcpy 3.3.3 server. The plugin does not download these tools.
- One explicitly configured emulator serial, such as `emulator-5556`.

The current implementation fixes the Android package/activity and project layout.
Changing only `projectRoot` does not make an arbitrary Flutter app compatible.
Physical phones, macOS/Linux hosts, audio and rotated-screen control are outside
the currently verified scope.

## Install

Use the desktop application's plugin installer with this pinned Git source:

```text
github:skyjjgw/dsh-plugin-android-preview#v0.1.3
```

For a separate CLI Web profile:

```powershell
dsh plugin --profile web add github:skyjjgw/dsh-plugin-android-preview#v0.1.3
```

Desktop and CLI Web profiles are separate. Use the installer belonging to the
host you intend to run. The package contains prebuilt readable JavaScript and a
`dsh.bundle.patch`; installation selects the bundle without a separate build or
install lifecycle script. This package is not published to npm.

Configure the existing `android-preview` plugin row with local absolute paths:

```yaml
- insert:
    - id: android-preview
      name: dsh-plugin-android-preview
      config:
        projectRoot: E:/projects/starcompanion-operit2
        adbPath: E:/Android/Sdk/platform-tools/adb.exe
        scrcpyServer: E:/tools/scrcpy-win64-v3.3.3/scrcpy-server
        port: 18772
        serial: emulator-5556
        frameAncestors:
          - dsh-app://app
```

This is a standalone overlay example. When the bundle already created the row,
edit that row instead of inserting a duplicate or replacing the entire profile.

## Use

1. Open a chat and select the phone-preview button or the phone-preview tab from
   the right sidebar's new-tab screen.
2. Opening the tab runs the configured project's preparation helpers, installs
   its existing debug APK and attaches the Flutter debugger to that emulator.
3. Use the mouse, wheel and keyboard to operate the phone. Explicit paste sends
   the pasted text to the Android clipboard; clipboard autosynchronization is off.
4. Save Dart files under `apps/flutter/app/lib` or
   `apps/flutter/packages/operit_ui/lib` to request a Flutter hot reload.
5. If the debug app stops, use the restart-app control. Disabling the plugin
   closes its listener, sockets, file watchers and owned Flutter process while
   retaining the emulator for other development tools.

Keep only one Flutter debug attachment per emulator. Native/Rust changes,
Android permissions and plugin-host changes still require rebuilding the debug
APK. ARM64-to-x86 translation and video encoding can limit responsiveness even
when the emulator uses the host GPU. A project helper can propagate
`OPERIT_PREVIEW_RENDERER=software` before restarting the emulator as a fallback.
An emulator WebView crash may require restarting the app.

## Execution and access boundaries

Enabling a configured plugin starts an idle HTTP service on `127.0.0.1`; opening
the phone tab starts the project helpers, ADB/scrcpy and Flutter. Treat the
configured project's PowerShell helpers as trusted local executable code.

Local management requests use a random same-origin session token. WebSockets
validate Host and Origin. The DSH `/api/android-preview/info` discovery route
uses the host's connection-layer owner-Peer validation. Embedded frames permit
`dsh-app://app` and explicitly configured `http://127.0.0.1:PORT` origins; no
wildcards or external origins are supported. These checks are not an operating
system sandbox.

The plugin registers no model tools and does not read the system clipboard,
record video, use a microphone, or expose an arbitrary shell/file API. Debug
paths and logs can contain local information; do not post user profiles,
credentials, chat history or debug endpoints to public issues.

## Development

```powershell
npm run check
npm test
npm pack --dry-run
```

The host supplies React and the optional peer
`@deepseek-ai/schemastery`; a second SDK/runtime is not bundled. See [NOTICE.md](NOTICE.md)
for third-party origins and [LICENSE](LICENSE) for AGPL-3.0-only licensing.
