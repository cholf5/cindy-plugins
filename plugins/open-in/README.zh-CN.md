# Open In

在任务标题旁增加一个 **Open in** 菜单，用运行 Cindy 的这台电脑上已安装的应用打开当前任务的项目目录。

## 菜单里有什么

只列出本机实际检测到的应用：

- **编辑器与 IDE** — macOS 上的 Visual Studio Code、Cursor、Windsurf、Zed、Sublime Text、Nova、Xcode 和 JetBrains Toolbox 系列；Windows 上的 VS Code、Cursor、Windsurf、Sublime Text 和 JetBrains Toolbox 系列；Linux 上常见的命令行启动编辑器。
- **终端** — macOS 的 Terminal、iTerm；Windows 的 Windows Terminal、PowerShell、命令提示符；Linux 常见终端。
- **文件管理器** — Finder、资源管理器或系统文件管理器。

## 行为

- 目录来自当前任务，只在本机打开，不上传任何内容。
- 不支持远程任务和设备链接任务：Cindy 会直接隐藏入口，插件也会拒绝本机不存在的目录。
- 如果应用在列出之后被卸载，菜单会提示不可用，不会改跑其他命令。
- 为了点开即用，插件启用后常驻在后台，并会先做一次应用检测预热；菜单也会记住上次的检测结果，重复打开时先显示列表再后台刷新。

## 权限

插件包含一个常驻的 Node 工作进程，用于检测已安装应用并以脱离 Cindy 的方式启动它们。它以你的系统账号运行，可以启动本机进程。插件启用后会先做一次应用检测预热，之后随插件常驻在后台。

## 说明

- 应用检测刻意保守，装在非常规位置的应用可能不会出现。
- 打开应用时只传入目录路径；页面无法让插件执行任意命令。
