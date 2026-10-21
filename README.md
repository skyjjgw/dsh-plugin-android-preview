# DeepSeek Harness Android 预览插件

[English](README.en.md) · [配置与迁移说明](docs/compatibility.md)

在 DSH 原生右侧页签中操作真实 Android 模拟器：点击、滑动、输入和返回；Flutter 调试 APK 还可在保存 Dart 源码时热重载。包名、启动 Activity、APK 和源码目录均可配置，支持独立工程和 monorepo，不要求星伴 / Operit2 或配套 PowerShell 脚本。

## 环境与安装

- Node.js **22.19.0+**，DSH **0.2.1-rc.2+**（使用相同公开 sidebar / renderer / connection API）。
- Windows、macOS 或 Linux 上已安装的 Android SDK、**正在运行的模拟器**、官方 **scrcpy 3.3.3 server**。
- 已构建、能在该模拟器运行的 APK；Flutter 热重载另需匹配源码和 Flutter SDK 的 **debug APK**。
- 插件不下载 SDK、不启动模拟器、不构建 APK；不控制实体手机。屏幕控制按竖屏实现，旋转控制尚未验证。

在桌面应用插件安装入口填写：

```text
github:skyjjgw/dsh-plugin-android-preview#v0.2.0
```

CLI Web profile 可使用：

```sh
dsh plugin --profile web add github:skyjjgw/dsh-plugin-android-preview#v0.2.0
```

桌面与 CLI profile 分开。包自带可读 JavaScript 和 `dsh.bundle.patch`，无需安装脚本或前端构建；未发布 npm。安装后编辑已有 `android-preview` 行的 config，保留其他插件配置，不要重复插入同名行。

## Flutter 示例

下面是普通 Flutter 工程的 **config 内容**。将路径、包名、Activity 和模拟器编号换成实际值：

```yaml
projectRoot: E:/projects/my-counter
appDirectory: .
apkPath: build/app/outputs/flutter-apk/app-debug.apk
applicationId: com.example.my_counter
activity: .MainActivity
flutterRoot: E:/SDK/flutter
adbPath: E:/Android/Sdk/platform-tools/adb.exe
scrcpyServer: E:/tools/scrcpy-server
serial: emulator-5556
hotReload: true
watchDirectories:
  - lib
port: 18772
frameAncestors:
  - dsh-app://app
```

macOS / Linux 使用本机绝对路径（如 `/Users/me/projects/my-counter` 或 `/home/me/projects/my-counter`），ADB 为 `platform-tools/adb`；Dart 启动器自动选择系统版本。`flutterRoot` 留空时使用 `FLUTTER_ROOT`。

monorepo 可设置 `appDirectory: apps/mobile`，`watchDirectories: [lib, ../../packages/widgets/lib]`。源码目录必须在 `projectRoot` 内，APK 也可指定绝对路径。

## 普通 Android APK

Kotlin / Java / React Native 等已有 Android APK 可配置 `hotReload: false`、实际 `apkPath`、`applicationId` 和 `activity`。例如 Gradle debug APK 路径 `app/build/outputs/apk/debug/app-debug.apk`。此模式仅安装、启动与投屏，无需 Flutter SDK，也不会监听 Dart、启动 Flutter 或承诺 JS / 原生热重载。APK、原生依赖或权限变化需自行重新构建，然后点击重启 App。

## 使用

1. 启动配置的模拟器，确认 `adb devices` 中对应编号在线。
2. 打开聊天，点击“手机预览”或右侧新建页签中的手机预览入口。
3. 插件安装已有 APK，启动配置的 Activity，显示可操作的真实画面；Flutter 模式随后连接调试器。
4. 鼠标点击 / 拖动 / 滚轮操作手机，键盘输入或主动粘贴文字。保存监听目录内的 `.dart` 文件会请求 Flutter 热重载。
5. 底部按钮可热重载、刷新视频、重启 App；普通 Android 模式禁用热重载。禁用插件会释放监听端口、连接、源码监听器及其创建的 Flutter 进程，保留模拟器。

同一模拟器只保留一个 Flutter 调试连接。已有 APK 必须对应当前源码；原生代码、插件依赖与权限变化需重建。默认 `renderer: auto` 保留 App 渲染方式，必要时显式设置 `gpu` 或 `software`。性能取决于模拟器、CPU 架构和驱动。

## 可选准备命令与权限

默认不运行任何工程脚本。需要构建前置步骤或配置环境时，可显式配置 `prepareExecutable` 的绝对路径和 `prepareArgs` 字符串数组。直接启动程序、不开 shell；程序 stdout 必须仅输出 JSON 环境变量对象。详细协议和旧版本迁移见[配置说明](docs/compatibility.md)。这会执行用户选择的本机程序，请仅配置可信脚本。

启用插件先启动空闲 `127.0.0.1` 服务；打开页签后才运行准备命令、ADB / scrcpy 和可选 Flutter。WebSocket 校验本机 Host、准确 Origin 和随机同源令牌；发现路由由宿主 connection 层验证 owner Peer。嵌入仅允许 `dsh-app://app` 或显式配置的本机 HTTP origin，不允许通配符和外网来源。

无模型工具、麦克风、音频、录像、系统剪贴板读取或任意 shell / 文件 HTTP API。主动输入 / 粘贴会写安卓剪贴板，自动剪贴板同步关闭。子进程继承宿主环境，这些检查不是系统沙箱。

## 验证与开发

```sh
npm run check
npm test
npm pack --dry-run
```

测试覆盖三种系统的路径与启动参数、通用 APK / Flutter 启动、可选准备命令、取消、回环访问限制、协议和资源释放；CI 在 Windows / macOS / Linux 上运行。真实模拟器验证范围与发布记录见[配置说明](docs/compatibility.md)。React 和 SDK 由宿主提供，不打包第二份。许可与来源见 [NOTICE.md](NOTICE.md) 和 [LICENSE](LICENSE)。
