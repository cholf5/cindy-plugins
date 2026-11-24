# Cindy Plugins

[English](README.md) | [简体中文](README.zh-CN.md)

给 [Cindy](https://github.com/makecindy/cindy) 做的插件集合。Cindy 是开源的 AI 助手。

每个插件都自成一体，适配 Cindy 的浅色/深色主题与宿主语言，并由 Cindy 在安装前校验和确认权限。

## 插件

| 插件 | 作用 |
| --- | --- |
| **Open In**（`open-in`） | 在任务标题栏增加 **Open in** 菜单，用本机已安装的编辑器、IDE、终端或文件管理器打开当前项目目录。只支持本机项目；远程任务由 Cindy 直接隐藏入口。 |

各插件的行为、权限和限制见插件自己的说明：

- [`plugins/open-in/README.zh-CN.md`](plugins/open-in/README.zh-CN.md)

## 安装

`plugins/` 下每个目录都是一份完整的插件源码包：`ghost.json` 加上入口脚本、可选的 Node 工作进程、界面和本地化文件。没有构建步骤。

- **从源码** — 让 Cindy 用插件创作工具（`ghost_forge_pack`）打包该插件目录，再在 Cindy 中导入生成的 `.cindy`。
- **从发布** — 有 Release 时，下载 `open-in-<version>.cindy` 并在 Cindy 中导入。

Cindy 会在安装前展示插件声明的全部权限。建议先读源码，尤其是声明了 Node 工作进程的插件——该进程以你的系统账号运行，可以启动本机进程。

## 仓库结构

```
plugins/
  <插件 id>/            # 目录名与插件 id 一致
    ghost.json          # 身份、版本、工具与权限声明
    main.js             # 后台脚本（浏览器沙箱）
    node/               # 可选的随包 Node 工作进程
    ui/                 # 可选的 MCP Apps 交互页面
    locales/            # 可选的清单本地化
    README.md           # 给用户看的说明，显示在插件详情页
tools/                  # 共用的打包/校验脚本（可选）
```

约定：

- 一个插件一个目录，目录名与 `ghost.json` 的 id 完全一致。
- 每个插件有自己的版本、权限和更新说明，升级一个不影响其他插件。
- 插件之间不在运行时互相 import。共享代码要么复制，要么抽成内部包，不跨插件目录引用。
- 打包产物 `*.cindy` 不进入 git。

## 开发说明

- 宿主接口按插件实际运行的那个 Cindy 版本核对，不按 `main` 猜测。Cindy 的插件创作 Skill 自带作者文档。
- 插件开发方法论笔记：[cholf5/dsh-plugin-dev-notes](https://github.com/cholf5/dsh-plugin-dev-notes)。

## 许可证

[MIT](LICENSE)
