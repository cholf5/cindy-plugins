# Open In

Adds an **Open in** menu in the status bar under the composer, next to the working directory. It opens the current task's project folder in an application installed on the computer that runs Cindy.

## What the menu lists

Only apps that are actually detected on this computer:

- **Editors & IDEs** — Visual Studio Code, Cursor, Windsurf, Zed, Sublime Text, Nova, Xcode, VSCodium, Trae, Kiro, Qoder, Fleet and the JetBrains Toolbox IDEs (IntelliJ IDEA, WebStorm, PyCharm, GoLand, CLion, PhpStorm, RubyMine, DataGrip, DataSpell, Aqua, RustRover, Android Studio) on macOS; VS Code, VS Code Insiders, Cursor, Windsurf, Zed, Sublime Text, VSCodium, Trae, Kiro, Qoder and JetBrains IDEs on Windows; common CLI-launched editors on Linux.
- **C# IDEs** — Visual Studio 2022/2019 on Windows, plus JetBrains Rider and Passenger on every platform. Rider and Visual Studio open the solution file directly. They appear only when the project folder, or its `src/` folder, contains a `.sln` or `.slnx` solution file.
- **Git** — Fork, shown only inside a Git repository.
- **Terminals** — Terminal, iTerm, Ghostty, WezTerm, kitty and Alacritty on macOS; Windows Terminal, PowerShell, Command Prompt and Ghostty on Windows; common Linux terminal emulators.
- **File manager** — Finder, ComfortFiles, File Explorer or the system file manager.

## Behavior

- The folder comes from the current task. It is only opened locally; nothing is uploaded.
- **Copy path** at the bottom of the menu copies the project folder path to the clipboard.
- Remote tasks and device-link tasks are not supported. Cindy hides the entry for them, and the plugin also refuses a folder that does not exist locally.
- If the app was removed between listing and clicking, the menu reports it as unavailable instead of running anything else.
- The plugin stays resident while enabled and prewarms one app detection at startup, so opening the menu does not rescan every time. Each popover is a fresh sandbox page, so the menu reserves its final height with a skeleton and fills in the list as soon as it connects.

## Permissions

The plugin ships a resident Node worker. It is required to detect installed applications and to launch them detached from Cindy. It runs with your user account and can start local processes. It prewarms one app detection when the plugin starts and stays resident alongside it.

## Notes

- App detection is intentionally conservative. Applications installed in unusual locations may not appear.
- Opening an app only passes the folder path; the plugin never runs arbitrary commands from the page.
