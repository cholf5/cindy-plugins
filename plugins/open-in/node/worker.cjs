'use strict';
// Open In — 随包 Node 工作进程。
// 职责：检测本机已安装的编辑器/IDE/终端/文件管理器，并以 detached 方式启动选中应用。
// 协议：逐行 JSON-RPC 2.0；stdout 只写协议消息。应用 id → 固定启动模板，页面不能传任意命令。

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const readline = require('node:readline');
const { spawn } = require('node:child_process');

const PLATFORM = process.platform;
const IS_WIN = PLATFORM === 'win32';
const IS_MAC = PLATFORM === 'darwin';

function isFile(candidate) {
  try {
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}

function isDir(candidate) {
  try {
    return fs.statSync(candidate).isDirectory();
  } catch {
    return false;
  }
}

function isExecutable(candidate) {
  try {
    fs.accessSync(candidate, fs.constants.X_OK);
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}

const PATH_DIRS = String(process.env.PATH || '').split(path.delimiter).filter(Boolean);

function whichExecutable(names) {
  const suffixes = IS_WIN ? ['.exe'] : [''];
  for (const dir of PATH_DIRS) {
    for (const name of names) {
      for (const suffix of suffixes) {
        const candidate = path.join(dir, name + suffix);
        if (isExecutable(candidate)) return candidate;
      }
    }
  }
  return null;
}

// ── macOS ────────────────────────────────────────────────────────────────────
function macAppBundle(names) {
  const roots = [
    '/Applications',
    path.join(os.homedir(), 'Applications'),
    '/Applications/Utilities',
    '/System/Applications',
    '/System/Applications/Utilities',
  ];
  for (const name of names) {
    for (const root of roots) {
      const candidate = path.join(root, `${name}.app`);
      if (isDir(candidate)) return candidate;
    }
  }
  return null;
}

function macApps() {
  const editors = [];
  const terminals = [];
  const files = [];
  const addBundle = (bucket, id, label, names) => {
    const bundle = macAppBundle(names);
    if (bundle) bucket.push({ id, label, group: 'editor', run: (dir) => ({ command: '/usr/bin/open', args: ['-a', bundle, dir] }) });
  };
  addBundle(editors, 'vscode', 'Visual Studio Code', ['Visual Studio Code', 'Visual Studio Code - Insiders']);
  addBundle(editors, 'cursor', 'Cursor', ['Cursor']);
  addBundle(editors, 'windsurf', 'Windsurf', ['Windsurf']);
  addBundle(editors, 'zed', 'Zed', ['Zed']);
  addBundle(editors, 'sublime', 'Sublime Text', ['Sublime Text']);
  addBundle(editors, 'nova', 'Nova', ['Nova']);
  addBundle(editors, 'idea', 'IntelliJ IDEA', ['IntelliJ IDEA', 'IntelliJ IDEA Ultimate', 'IntelliJ IDEA CE', 'IntelliJ IDEA Community Edition']);
  addBundle(editors, 'webstorm', 'WebStorm', ['WebStorm']);
  addBundle(editors, 'pycharm', 'PyCharm', ['PyCharm', 'PyCharm Professional Edition', 'PyCharm CE', 'PyCharm Community Edition']);
  addBundle(editors, 'goland', 'GoLand', ['GoLand']);
  addBundle(editors, 'xcode', 'Xcode', ['Xcode']);

  const addTerminal = (id, label, names) => {
    const bundle = macAppBundle(names);
    if (bundle) terminals.push({ id, label, group: 'terminal', run: (dir) => ({ command: '/usr/bin/open', args: ['-a', bundle, dir] }) });
  };
  addTerminal('terminal', 'Terminal', ['Terminal']);
  addTerminal('iterm', 'iTerm', ['iTerm', 'iTerm2']);

  if (isFile('/usr/bin/open')) {
    files.push({ id: 'finder', label: 'Finder', group: 'files', run: (dir) => ({ command: '/usr/bin/open', args: [dir] }) });
  }
  return editors.concat(terminals, files);
}

// ── Windows ─────────────────────────────────────────────────────────────────
const WIN_ROOT = process.env.SystemRoot || process.env.SYSTEMROOT || 'C:\\Windows';
const LOCAL_APPDATA = process.env.LOCALAPPDATA || '';
const PROGRAM_FILES = process.env.ProgramFiles || process.env.PROGRAMFILES || 'C:\\Program Files';
const PROGRAM_FILES_X86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

function firstFile(candidates) {
  for (const candidate of candidates) {
    if (candidate && isFile(candidate)) return candidate;
  }
  return null;
}

function jetbrainsToolboxApps() {
  const found = [];
  const base = LOCAL_APPDATA ? path.join(LOCAL_APPDATA, 'JetBrains', 'Toolbox', 'apps') : '';
  if (!base) return found;
  let folders = [];
  try {
    folders = fs.readdirSync(base);
  } catch {
    return found;
  }
  for (const folder of folders) {
    const label = folder.replace(/\s+\d{4}\.\d+(\.\d+)?$/, '').trim();
    if (!label) continue;
    let channels = [];
    try {
      channels = fs.readdirSync(path.join(base, folder));
    } catch {
      continue;
    }
    let resolved = null;
    for (const channel of channels) {
      let builds = [];
      try {
        builds = fs.readdirSync(path.join(base, folder, channel));
      } catch {
        continue;
      }
      for (const build of builds) {
        const binDir = path.join(base, folder, channel, build, 'bin');
        let entries = [];
        try {
          entries = fs.readdirSync(binDir);
        } catch {
          continue;
        }
        const exe = entries.find((name) => /^(idea|webstorm|pycharm|goland|rider|clion|phpstorm|rubymine|datagrip|dataspell|aqua|rustrover)(64)?\.exe$/i.test(name));
        if (exe) {
          resolved = path.join(binDir, exe);
          break;
        }
      }
      if (resolved) break;
    }
    if (!resolved) continue;
    const id = 'jetbrains-' + folder.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
    if (!id || found.some((item) => item.id === id)) continue;
    found.push({ id, label, group: 'editor', run: (dir) => ({ command: resolved, args: [dir] }) });
  }
  return found;
}

function winApps() {
  const editors = [];
  const terminals = [];
  const files = [];

  const vscode = firstFile([
    LOCAL_APPDATA && path.join(LOCAL_APPDATA, 'Programs', 'Microsoft VS Code', 'Code.exe'),
    path.join(PROGRAM_FILES, 'Microsoft VS Code', 'Code.exe'),
    path.join(PROGRAM_FILES_X86, 'Microsoft VS Code', 'Code.exe'),
  ]);
  if (vscode) editors.push({ id: 'vscode', label: 'Visual Studio Code', group: 'editor', run: (dir) => ({ command: vscode, args: [dir] }) });

  const cursor = firstFile([
    LOCAL_APPDATA && path.join(LOCAL_APPDATA, 'Programs', 'cursor', 'Cursor.exe'),
    LOCAL_APPDATA && path.join(LOCAL_APPDATA, 'Programs', 'Cursor', 'Cursor.exe'),
    path.join(PROGRAM_FILES, 'Cursor', 'Cursor.exe'),
  ]);
  if (cursor) editors.push({ id: 'cursor', label: 'Cursor', group: 'editor', run: (dir) => ({ command: cursor, args: [dir] }) });

  const windsurf = firstFile([
    LOCAL_APPDATA && path.join(LOCAL_APPDATA, 'Programs', 'Windsurf', 'Windsurf.exe'),
    path.join(PROGRAM_FILES, 'Windsurf', 'Windsurf.exe'),
  ]);
  if (windsurf) editors.push({ id: 'windsurf', label: 'Windsurf', group: 'editor', run: (dir) => ({ command: windsurf, args: [dir] }) });

  const sublime = firstFile([
    path.join(PROGRAM_FILES, 'Sublime Text', 'sublime_text.exe'),
    path.join(PROGRAM_FILES, 'Sublime Text 3', 'sublime_text.exe'),
  ]);
  if (sublime) editors.push({ id: 'sublime', label: 'Sublime Text', group: 'editor', run: (dir) => ({ command: sublime, args: [dir] }) });

  editors.push(...jetbrainsToolboxApps());

  const wt = whichExecutable(['wt']);
  if (wt) terminals.push({ id: 'windows-terminal', label: 'Windows Terminal', group: 'terminal', run: (dir) => ({ command: wt, args: ['-d', dir] }) });

  const pwsh = whichExecutable(['pwsh']);
  const powershell = pwsh || firstFile([path.join(WIN_ROOT, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')]);
  if (powershell) {
    terminals.push({
      id: 'powershell',
      label: pwsh ? 'PowerShell 7' : 'Windows PowerShell',
      group: 'terminal',
      run: (dir) => ({
        command: powershell,
        args: ['-NoExit', '-Command', `Set-Location -LiteralPath '${dir.replace(/'/g, "''")}'`],
      }),
    });
  }

  const comspec = process.env.ComSpec && isFile(process.env.ComSpec) ? process.env.ComSpec : null;
  const cmd = comspec || firstFile([path.join(WIN_ROOT, 'System32', 'cmd.exe')]);
  if (cmd) terminals.push({ id: 'command-prompt', label: 'Command Prompt', group: 'terminal', run: (dir) => ({ command: cmd, args: ['/K', 'cd', '/d', dir] }) });

  const explorer = firstFile([path.join(WIN_ROOT, 'explorer.exe')]);
  if (explorer) files.push({ id: 'explorer', label: 'File Explorer', group: 'files', run: (dir) => ({ command: explorer, args: [dir] }) });

  return editors.concat(terminals, files);
}

// ── Linux ───────────────────────────────────────────────────────────────────
function linuxApps() {
  const editors = [];
  const terminals = [];
  const files = [];

  const editorCandidates = [
    ['vscode', 'Visual Studio Code', ['code', 'code-insiders']],
    ['cursor', 'Cursor', ['cursor']],
    ['windsurf', 'Windsurf', ['windsurf']],
    ['zed', 'Zed', ['zed']],
    ['sublime', 'Sublime Text', ['subl', 'sublime_text']],
    ['idea', 'IntelliJ IDEA', ['idea']],
    ['webstorm', 'WebStorm', ['webstorm']],
    ['pycharm', 'PyCharm', ['pycharm']],
    ['goland', 'GoLand', ['goland']],
  ];
  for (const [id, label, names] of editorCandidates) {
    const exe = whichExecutable(names);
    if (exe) editors.push({ id, label, group: 'editor', run: (dir) => ({ command: exe, args: [dir] }) });
  }

  const terminalCandidates = [
    ['gnome-terminal', 'GNOME Terminal', ['gnome-terminal'], (dir) => ['--working-directory', dir]],
    ['konsole', 'Konsole', ['konsole'], (dir) => ['--workdir', dir]],
    ['xfce4-terminal', 'Xfce Terminal', ['xfce4-terminal'], (dir) => ['--working-directory', dir]],
    ['kitty', 'kitty', ['kitty'], (dir) => ['--directory', dir]],
    ['alacritty', 'Alacritty', ['alacritty'], (dir) => ['--working-directory', dir]],
    ['wezterm', 'WezTerm', ['wezterm'], (dir) => ['start', '--cwd', dir]],
    ['foot', 'foot', ['foot'], (dir) => ['--working-directory', dir]],
  ];
  for (const [id, label, names, argsFor] of terminalCandidates) {
    const exe = whichExecutable(names);
    if (exe) terminals.push({ id, label, group: 'terminal', run: (dir) => ({ command: exe, args: argsFor(dir) }) });
  }

  const xdg = whichExecutable(['xdg-open']);
  if (xdg) files.push({ id: 'files', label: 'Files', group: 'files', run: (dir) => ({ command: xdg, args: [dir] }) });

  return editors.concat(terminals, files);
}

function detectApps() {
  if (IS_MAC) return macApps();
  if (IS_WIN) return winApps();
  return linuxApps();
}

// ── Launch ──────────────────────────────────────────────────────────────────
function launchDetached(command, args) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (error) => {
      if (settled) return;
      settled = true;
      if (error) {
        reject(error);
        return;
      }
      resolve();
    };
    let child;
    try {
      child = spawn(command, args, { detached: true, stdio: 'ignore' });
    } catch (error) {
      settle(error);
      return;
    }
    child.once('error', (error) => settle(error));
    child.once('spawn', () => {
      try {
        child.unref();
      } catch {
        // 已经退出也没关系，启动本身成功了。
      }
      settle();
    });
    const timer = setTimeout(() => settle(), 5000);
    if (typeof timer.unref === 'function') timer.unref();
  });
}

function validatedDirectory(input) {
  if (typeof input !== 'string' || !input || input.length > 4096 || input.includes('\0')) return null;
  if (!path.isAbsolute(input)) return null;
  const resolved = path.resolve(input);
  return isDir(resolved) ? resolved : null;
}

async function handle(method, params) {
  const args = params && typeof params === 'object' ? params : {};

  if (method === 'apps/list') {
    return {
      ok: true,
      platform: PLATFORM,
      apps: detectApps().map(({ id, label, group }) => ({ id, label, group })),
    };
  }

  if (method === 'apps/open') {
    if (typeof args.app !== 'string' || !args.app) return { ok: false, code: 'INVALID_ARGS' };
    const dir = validatedDirectory(args.path);
    if (!dir) return { ok: false, code: 'DIR_UNAVAILABLE' };
    const app = detectApps().find((item) => item.id === args.app);
    if (!app) return { ok: false, code: 'APP_NOT_AVAILABLE' };
    try {
      const { command, args: spawnArgs } = app.run(dir);
      await launchDetached(command, spawnArgs);
      return { ok: true };
    } catch {
      return { ok: false, code: 'OPEN_FAILED' };
    }
  }

  return { ok: false, code: 'METHOD_NOT_FOUND' };
}

function write(message) {
  process.stdout.write(JSON.stringify(message) + '\n');
}

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  if (!line.trim()) return;
  let request;
  try {
    request = JSON.parse(line);
  } catch {
    return;
  }
  if (!request || typeof request !== 'object' || request.id === undefined) return;
  void handle(request.method, request.params)
    .then((result) => write({ jsonrpc: '2.0', id: request.id, result }))
    .catch(() => write({ jsonrpc: '2.0', id: request.id, error: { code: -32603, message: 'INTERNAL' } }));
});
