# Open In

Adds an **Open in** menu next to the task title. It opens the current task's project folder in an application installed on the computer that runs Cindy.

## What the menu lists

Only apps that are actually detected on this computer:

- **Editors & IDEs** — Visual Studio Code, Cursor, Windsurf, Zed, Sublime Text, Nova, Xcode, and JetBrains Toolbox IDEs on macOS; VS Code, Cursor, Windsurf, Sublime Text, and JetBrains Toolbox IDEs on Windows; common CLI-launched editors on Linux.
- **Terminals** — Terminal and iTerm on macOS; Windows Terminal, PowerShell and Command Prompt on Windows; common Linux terminal emulators.
- **File manager** — Finder, File Explorer or the system file manager.

## Behavior

- The folder comes from the current task. It is only opened locally; nothing is uploaded.
- Remote tasks and device-link tasks are not supported. Cindy hides the entry for them, and the plugin also refuses a folder that does not exist locally.
- If the app was removed between listing and clicking, the menu reports it as unavailable instead of running anything else.
- For an instant menu, the plugin stays resident while enabled and prewarms one app detection at startup. The menu also remembers the last detection result and shows it before refreshing in the background.

## Permissions

The plugin ships a resident Node worker. It is required to detect installed applications and to launch them detached from Cindy. It runs with your user account and can start local processes. It prewarms one app detection when the plugin starts and stays resident alongside it.

## Notes

- App detection is intentionally conservative. Applications installed in unusual locations may not appear.
- Opening an app only passes the folder path; the plugin never runs arbitrary commands from the page.
