# DeepSeek Harness 手机预览插件

在 DeepSeek Harness 聊天右侧打开**真实 Android App**，支持点击、滑动、返回与
Flutter 界面热重载。当前适配星伴 / Operit2 工程，使用已构建的调试 APK，不在每次保存时
重新打包。插件通过 Harness 的原生右侧页签 API 接入，不改宿主安装包。

## 环境

- Windows；Node.js **22.19.0+**；DeepSeek Harness **0.2.1-rc.2+**，仍需保留同一公开右侧页签/connection API。
- 已配置的星伴 / Operit2 工程，包含 `scripts/rolelife/environment.ps1`、
  `scripts/rolelife/start-debug-preview.ps1` 和当前源码生成的 Android 调试 APK。
- 已安装 Android SDK、模拟器、固定版本 Flutter SDK、官方 **scrcpy 3.3.3**。
- 当前版本只连接配置中指定的模拟器，默认 `emulator-5556`；不枚举或控制其他手机。

不会自动下载 SDK，不分发宿主、APK、scrcpy 或用户配置。所有开发环境路径由本机项目脚本
决定；建议将项目、SDK、缓存和模拟器数据放在空间充足的非系统盘。

## 安装与配置

GitHub 源码地址：<https://github.com/skyjjgw/dsh-plugin-android-preview>。
包已包含可直接加载的客户端和宿主产物，安装后无需构建前端。

通过 Harness 的插件安装入口填写 `github:skyjjgw/dsh-plugin-android-preview#v0.1.2`，
或对 CLI 的 Web profile 执行：

```powershell
dsh plugin --profile web add github:skyjjgw/dsh-plugin-android-preview#v0.1.2
```

CLI 的 `web` profile 与桌面应用管理的 profile 分开，桌面用户应使用当前应用内的插件安装入口。
本包已声明 `dsh.bundle.patch`，正常安装会自动选入 bundle，无需再插入第二份插件行。
未发布到 npm，请使用 GitHub 源码或 GitHub Release 安装包。
在对应插件配置中填写本机路径，例如：

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

该行是用户 overlay 的独立安装示例；已由 bundle 创建同名行时，编辑已有行的配置，
不要再次插入同一 id。不要覆盖整个用户 profile、已有 bundle 或其他插件配置。

## 使用

1. 打开一个聊天会话，点击聊天顶部“手机预览”，或从右侧新建页签的引导页选“手机预览”。
2. 页签打开后自动连接手机，复用模拟器、安装已有调试 APK，并连接 Flutter 调试器。
3. 连接完成后，画面占满面板，只保留一排底部工具按钮。保存 `apps/flutter/app/lib` 或
   `apps/flutter/packages/operit_ui/lib` 下的 Dart 文件，即可自动更新画面。
4. 用鼠标点击、拖动、滚轮操作手机；点中手机输入框后直接用键盘输入或粘贴。
5. 调试 App 中断时点击底部左侧的运行图标重启 App。禁用插件会关闭其本机监听、连接、文件监听器与
   自己创建的 Flutter 进程；模拟器保留供其他开发工具复用。

同一模拟器同时只运行一个 Flutter 调试会话。切换到此插件前，停止 VS Code/Codex 中
同一设备的 Flutter 调试连接。原生/Rust/插件宿主/权限变化仍需重建调试 APK。

当前 ARM64 调试包通过 x86 模拟器翻译运行，默认使用 Skia GPU 渲染。
配套项目启动器使用宿主 GPU 和 4 GB 内存；本机 RTX 4060 已验证。
CPU 翻译和视频编码仍有开销，不代表整个预览链路都在 GPU 上运行。
驱动不兼容时，在启动 Harness 前设置 `OPERIT_PREVIEW_RENDERER=software`，
重新启动模拟器后可回退；项目环境脚本会传递该选项。性能和玻璃材质效果以真机为准。
模拟器 WebView 曾出现原生崩溃，插件的“重启 App”可恢复调试。
本版按竖屏验证，旋转后的控制尚未验证。

## 连接和权限

安装插件只启动空闲的 `127.0.0.1` 网页服务；打开手机页签后才运行项目的预览准备脚本、
ADB、scrcpy 和 Flutter。网页管理操作需要同源随机会话令牌，WebSocket 同时校验 Host
和 Origin。Harness 内发现地址的 `/api/android-preview/info` 路由由其 connection 层验证
owner Peer。仅允许明确的 `dsh-app://app` 父页面嵌入；Web Harness 用户可额外配置准确的
`http://127.0.0.1:端口`，不支持通配符或外网来源。

没有模型工具、自动 prompt、麦克风/音频、系统剪贴板读取、任意 shell 或任意文件接口。
键盘输入/用户主动粘贴会把对应文字写到安卓剪贴板并粘贴，自动剪贴板同步关闭。不会保存屏幕录像。
本机调试地址、路径和日志不应粘贴到公开 issue；不要上传 profile、账号密钥或聊天记录。

## 开发与验证

```powershell
npm run check
npm test
npm pack --dry-run
```

`lib/client.js` 直接注册到宿主模块加载器；React 由宿主提供，不打包第二份 React。
Host 的 `@deepseek-ai/schemastery` 由 DSH 运行时提供，声明为可选 peer，避免包管理器另装一份 SDK。
`lib/preview/` 保留完整可读源码。许可与来源见 [NOTICE.md](NOTICE.md) 和 [LICENSE](LICENSE)。
