# Cindy Plugins

[English](README.md) | [简体中文](README.zh-CN.md)

A small collection of plugins for [Cindy](https://github.com/makecindy/cindy), the open-source AI assistant.

Each plugin is self-contained, follows Cindy's light/dark themes and host locale, and is packaged and approved by Cindy before it can run.

## Plugins

| Plugin | What it does |
| --- | --- |
| **Open In** (`open-in`) | Adds an **Open in** menu in the status bar under the composer. Opens the current project folder in an installed editor, IDE, terminal, Git client or file manager, or copies its path. Local projects only; remote tasks are hidden by Cindy. |

See each plugin's own README for behavior, permissions and limitations:

- [`plugins/open-in/README.md`](plugins/open-in/README.md)

## Install

Every folder under `plugins/` is a complete plugin source package: `ghost.json` plus its entry script, optional Node worker, UI and locales. There is no build step.

- **From source** — ask Cindy to package the plugin folder with the Plugin Creator (`ghost_forge_pack`), then import the generated `.cindy` in Cindy.
- **From a release** — when a release is published, download the `open-in-<version>.cindy` asset and import it in Cindy.

Cindy shows the declared permissions before installing. Review the source first, especially for a plugin that declares a Node worker — that worker runs with your user account and can start local processes.

## Repository layout

```
plugins/
  <plugin-id>/          # folder name equals the plugin id
    ghost.json          # manifest: identity, version, tools, permissions
    main.js             # background script (browser sandbox)
    node/               # optional bundled Node worker
    ui/                 # optional MCP Apps pages
    locales/            # optional manifest translations
    README.md           # user-facing docs, shown in the plugin detail page
tools/                  # shared packaging or verification scripts (optional)
```

Rules of the road:

- One folder per plugin, named exactly like its `ghost.json` id.
- Each plugin keeps its own version, permissions and release notes. Update one without touching the others.
- Plugins do not import each other at runtime. Shared code is copied or extracted into an internal package, never linked across plugin folders.
- Built `*.cindy` packages stay out of git.

## Development notes

- Host APIs are verified against the Cindy release that runs the plugin, not against `main`. Cindy's Plugin Creator skill ships the authoring references.
- Field notes on plugin development methodology: [cholf5/dsh-plugin-dev-notes](https://github.com/cholf5/dsh-plugin-dev-notes).

## License

[MIT](LICENSE)
