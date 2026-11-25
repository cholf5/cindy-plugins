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

// 项目判定：C# 解决方案、Git 仓库。只做一次目录探测，供列表和启动共用。
function solutionFiles(folder) {
  let entries = [];
  try {
    entries = fs.readdirSync(folder);
  } catch {
    return [];
  }
  return entries
    .filter((name) => /\.slnx?$/i.test(name) && isFile(path.join(folder, name)))
    .sort();
}

// 根目录优先，其次 src/；与目录同名的解决方案优先，否则取第一个 .sln，再退 .slnx。
function findSolutionFile(dir) {
  const found = [];
  for (const folder of [dir, path.join(dir, 'src')]) {
    for (const name of solutionFiles(folder)) found.push({ name, file: path.join(folder, name) });
  }
  if (!found.length) return null;
  const base = path.basename(dir).toLowerCase();
  const named = found.find((item) => item.name.replace(/\.slnx?$/i, '').toLowerCase() === base);
  if (named) return named.file;
  const sln = found.find((item) => /\.sln$/i.test(item.name));
  return (sln || found[0]).file;
}

function hasSolutionFile(dir) {
  return findSolutionFile(dir) !== null;
}

// .git 在 git worktree / submodule 里也可能是文件而不是目录。
function hasGitRepo(dir) {
  try {
    const dotGit = fs.statSync(path.join(dir, '.git'));
    return dotGit.isDirectory() || dotGit.isFile();
  } catch {
    return false;
  }
}

function projectFeatures(dir) {
  if (!dir) return { csharp: false, git: false };
  return { csharp: hasSolutionFile(dir), git: hasGitRepo(dir) };
}

function meetsRequirement(dir, requirement) {
  if (requirement === 'csharp') return hasSolutionFile(dir);
  if (requirement === 'git') return hasGitRepo(dir);
  return false;
}

function macApps() {
  const editors = [];
  const terminals = [];
  const gitClients = [];
  const files = [];
  const addBundle = (bucket, id, label, names, extra) => {
    const bundle = macAppBundle(names);
    if (bundle) bucket.push({ id, label, group: 'editor', ...extra, run: (dir) => ({ command: '/usr/bin/open', args: ['-a', bundle, dir] }) });
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
  addBundle(editors, 'clion', 'CLion', ['CLion']);
  addBundle(editors, 'phpstorm', 'PhpStorm', ['PhpStorm']);
  addBundle(editors, 'rubymine', 'RubyMine', ['RubyMine']);
  addBundle(editors, 'datagrip', 'DataGrip', ['DataGrip']);
  addBundle(editors, 'dataspell', 'DataSpell', ['DataSpell']);
  addBundle(editors, 'aqua', 'Aqua', ['Aqua']);
  addBundle(editors, 'rustrover', 'RustRover', ['RustRover']);
  addBundle(editors, 'fleet', 'Fleet', ['Fleet']);
  addBundle(editors, 'android-studio', 'Android Studio', ['Android Studio']);
  addBundle(editors, 'vscodium', 'VSCodium', ['VSCodium']);
  addBundle(editors, 'trae', 'Trae', ['Trae']);
  addBundle(editors, 'kiro', 'Kiro', ['Kiro']);
  addBundle(editors, 'qoder', 'Qoder', ['Qoder']);
  addBundle(editors, 'passenger', 'Passenger', ['Passenger'], { group: 'dotnet', requires: 'csharp' });

  // Rider 直接打开解决方案文件；找不到时退回目录（正常情况下不会发生）。
  const riderBundle = macAppBundle(['Rider', 'JetBrains Rider']);
  if (riderBundle) {
    editors.push({
      id: 'rider',
      label: 'Rider',
      group: 'dotnet',
      requires: 'csharp',
      run: (dir) => ({ command: '/usr/bin/open', args: ['-a', riderBundle, findSolutionFile(dir) || dir] }),
    });
  }

  const forkBundle = macAppBundle(['Fork']);
  if (forkBundle) {
    gitClients.push({ id: 'fork', label: 'Fork', group: 'git', requires: 'git', run: (dir) => ({ command: '/usr/bin/open', args: ['-a', forkBundle, dir] }) });
  }

  const addTerminal = (id, label, names) => {
    const bundle = macAppBundle(names);
    if (bundle) terminals.push({ id, label, group: 'terminal', run: (dir) => ({ command: '/usr/bin/open', args: ['-a', bundle, dir] }) });
  };
  addTerminal('terminal', 'Terminal', ['Terminal']);
  addTerminal('iterm', 'iTerm', ['iTerm', 'iTerm2']);
  addTerminal('ghostty', 'Ghostty', ['Ghostty']);

  // 这些终端自带 CLI，直接跑包内可执行文件才能可靠指定工作目录。
  const addTerminalCli = (id, label, bundleName, binary, argsFor) => {
    const bundle = macAppBundle([bundleName]);
    if (!bundle) return;
    const exe = path.join(bundle, 'Contents', 'MacOS', binary);
    if (!isExecutable(exe)) return;
    terminals.push({ id, label, group: 'terminal', run: (dir) => ({ command: exe, args: argsFor(dir) }) });
  };
  addTerminalCli('wezterm', 'WezTerm', 'WezTerm', 'wezterm', (dir) => ['start', '--cwd', dir]);
  addTerminalCli('kitty', 'kitty', 'kitty', 'kitty', (dir) => ['--directory', dir]);
  addTerminalCli('alacritty', 'Alacritty', 'Alacritty', 'alacritty', (dir) => ['--working-directory', dir]);

  const comfortFiles = macAppBundle(['ComfortFiles']);
  if (comfortFiles) files.push({ id: 'comfortfiles', label: 'ComfortFiles', group: 'files', run: (dir) => ({ command: '/usr/bin/open', args: ['-a', comfortFiles, dir] }) });

  if (isFile('/usr/bin/open')) {
    files.push({ id: 'finder', label: 'Finder', group: 'files', run: (dir) => ({ command: '/usr/bin/open', args: [dir] }) });
  }
  return editors.concat(gitClients, terminals, files);
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
        const exe = entries.find((name) => /^(idea|webstorm|pycharm|goland|rider|clion|phpstorm|rubymine|datagrip|dataspell|aqua|rustrover|studio)(64)?\.exe$/i.test(name));
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
    const csharpOnly = /^rider\b/i.test(label);
    found.push({
      id,
      label,
      group: csharpOnly ? 'dotnet' : 'editor',
      ...(csharpOnly ? { requires: 'csharp' } : {}),
      run: (dir) => ({ command: resolved, args: [csharpOnly ? (findSolutionFile(dir) || dir) : dir] }),
    });
  }
  return found;
}

// 独立安装的 JetBrains 应用：<root>/JetBrains/<应用 版本>/bin/<exe>。
function jetbrainsStandaloneExe(appName, exeNames) {
  for (const root of [PROGRAM_FILES, PROGRAM_FILES_X86]) {
    const base = path.join(root, 'JetBrains');
    let folders = [];
    try {
      folders = fs.readdirSync(base);
    } catch {
      continue;
    }
    for (const folder of folders) {
      if (!folder.toLowerCase().includes(appName)) continue;
      for (const exe of exeNames) {
        const candidate = path.join(base, folder, 'bin', exe);
        if (isFile(candidate)) return candidate;
      }
    }
  }
  return null;
}

// 独立安装的 Visual Studio：<root>/Microsoft Visual Studio/<版本>/<版本类型>/Common7/IDE/devenv.exe。
function visualStudioExe() {
  for (const version of ['2022', '2019']) {
    for (const edition of ['Enterprise', 'Professional', 'Community']) {
      const candidate = path.join(PROGRAM_FILES, 'Microsoft Visual Studio', version, edition, 'Common7', 'IDE', 'devenv.exe');
      if (isFile(candidate)) return { exe: candidate, label: `Visual Studio ${version}` };
    }
  }
  return null;
}

function winApps() {
  const editors = [];
  const terminals = [];
  const gitClients = [];
  const files = [];

  const vscode = firstFile([
    LOCAL_APPDATA && path.join(LOCAL_APPDATA, 'Programs', 'Microsoft VS Code', 'Code.exe'),
    path.join(PROGRAM_FILES, 'Microsoft VS Code', 'Code.exe'),
    path.join(PROGRAM_FILES_X86, 'Microsoft VS Code', 'Code.exe'),
  ]);
  if (vscode) editors.push({ id: 'vscode', label: 'Visual Studio Code', group: 'editor', run: (dir) => ({ command: vscode, args: [dir] }) });

  const vscodeInsiders = firstFile([
    LOCAL_APPDATA && path.join(LOCAL_APPDATA, 'Programs', 'Microsoft VS Code Insiders', 'Code - Insiders.exe'),
    path.join(PROGRAM_FILES, 'Microsoft VS Code Insiders', 'Code - Insiders.exe'),
  ]);
  if (vscodeInsiders) editors.push({ id: 'vscode-insiders', label: 'VS Code Insiders', group: 'editor', run: (dir) => ({ command: vscodeInsiders, args: [dir] }) });

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

  const zed = firstFile([
    LOCAL_APPDATA && path.join(LOCAL_APPDATA, 'Programs', 'Zed', 'Zed.exe'),
    path.join(PROGRAM_FILES, 'Zed', 'Zed.exe'),
  ]) || whichExecutable(['zed']);
  if (zed) editors.push({ id: 'zed', label: 'Zed', group: 'editor', run: (dir) => ({ command: zed, args: [dir] }) });

  // VS Code 系编辑器：安装目录优先，其次 PATH 里的 CLI。
  const addCodeEditor = (id, label, paths, names) => {
    const exe = firstFile(paths) || whichExecutable(names);
    if (exe) editors.push({ id, label, group: 'editor', run: (dir) => ({ command: exe, args: [dir] }) });
  };
  addCodeEditor('vscodium', 'VSCodium', [
    LOCAL_APPDATA && path.join(LOCAL_APPDATA, 'Programs', 'VSCodium', 'VSCodium.exe'),
    path.join(PROGRAM_FILES, 'VSCodium', 'VSCodium.exe'),
  ], ['codium']);
  addCodeEditor('trae', 'Trae', [
    LOCAL_APPDATA && path.join(LOCAL_APPDATA, 'Programs', 'Trae', 'Trae.exe'),
    path.join(PROGRAM_FILES, 'Trae', 'Trae.exe'),
  ], ['trae']);
  addCodeEditor('kiro', 'Kiro', [
    LOCAL_APPDATA && path.join(LOCAL_APPDATA, 'Programs', 'Kiro', 'Kiro.exe'),
    path.join(PROGRAM_FILES, 'Kiro', 'Kiro.exe'),
  ], ['kiro']);
  addCodeEditor('qoder', 'Qoder', [
    LOCAL_APPDATA && path.join(LOCAL_APPDATA, 'Programs', 'Qoder', 'Qoder.exe'),
    path.join(PROGRAM_FILES, 'Qoder', 'Qoder.exe'),
  ], ['qoder']);

  // Visual Studio 只能用解决方案文件启动，不能传目录。
  const visualStudio = visualStudioExe();
  if (visualStudio) {
    editors.push({
      id: 'visual-studio',
      label: visualStudio.label,
      group: 'dotnet',
      requires: 'csharp',
      run: (dir) => ({ command: visualStudio.exe, args: [findSolutionFile(dir) || dir] }),
    });
  }

  const toolboxApps = jetbrainsToolboxApps();
  editors.push(...toolboxApps);

  if (!toolboxApps.some((item) => item.id === 'rider' || /^rider\b/i.test(item.label))) {
    const rider = jetbrainsStandaloneExe('rider', ['rider64.exe', 'rider.exe']);
    if (rider) editors.push({ id: 'rider', label: 'Rider', group: 'dotnet', requires: 'csharp', run: (dir) => ({ command: rider, args: [findSolutionFile(dir) || dir] }) });
  }

  const passenger = firstFile([
    LOCAL_APPDATA && path.join(LOCAL_APPDATA, 'Programs', 'Passenger', 'Passenger.exe'),
    path.join(PROGRAM_FILES, 'Passenger', 'Passenger.exe'),
  ]) || whichExecutable(['passenger']);
  if (passenger) editors.push({ id: 'passenger', label: 'Passenger', group: 'dotnet', requires: 'csharp', run: (dir) => ({ command: passenger, args: [dir] }) });

  const wt = whichExecutable(['wt']);
  if (wt) terminals.push({ id: 'windows-terminal', label: 'Windows Terminal', group: 'terminal', run: (dir) => ({ command: wt, args: ['-d', dir] }) });

  const ghostty = whichExecutable(['ghostty']) || firstFile([
    LOCAL_APPDATA && path.join(LOCAL_APPDATA, 'Programs', 'Ghostty', 'ghostty.exe'),
    path.join(PROGRAM_FILES, 'Ghostty', 'ghostty.exe'),
  ]);
  if (ghostty) terminals.push({ id: 'ghostty', label: 'Ghostty', group: 'terminal', run: (dir) => ({ command: ghostty, args: [`--working-directory=${dir}`] }) });

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

  const fork = firstFile([
    LOCAL_APPDATA && path.join(LOCAL_APPDATA, 'Fork', 'Fork.exe'),
    path.join(PROGRAM_FILES, 'Fork', 'Fork.exe'),
  ]);
  if (fork) gitClients.push({ id: 'fork', label: 'Fork', group: 'git', requires: 'git', run: (dir) => ({ command: fork, args: [dir] }) });

  return editors.concat(gitClients, terminals, files);
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
    ['clion', 'CLion', ['clion']],
    ['phpstorm', 'PhpStorm', ['phpstorm']],
    ['rubymine', 'RubyMine', ['rubymine']],
    ['datagrip', 'DataGrip', ['datagrip']],
    ['dataspell', 'DataSpell', ['dataspell']],
    ['aqua', 'Aqua', ['aqua']],
    ['rustrover', 'RustRover', ['rustrover']],
    ['fleet', 'Fleet', ['fleet']],
    ['android-studio', 'Android Studio', ['studio']],
    ['vscodium', 'VSCodium', ['codium']],
    ['trae', 'Trae', ['trae']],
    ['kiro', 'Kiro', ['kiro']],
    ['qoder', 'Qoder', ['qoder']],
    ['rider', 'Rider', ['rider'], { group: 'dotnet', requires: 'csharp', openSolution: true }],
    ['passenger', 'Passenger', ['passenger'], { group: 'dotnet', requires: 'csharp' }],
  ];
  for (const [id, label, names, extra] of editorCandidates) {
    const exe = whichExecutable(names);
    if (!exe) continue;
    const { openSolution, ...rest } = extra || {};
    editors.push({ id, label, group: 'editor', ...rest, run: (dir) => ({ command: exe, args: [openSolution ? (findSolutionFile(dir) || dir) : dir] }) });
  }

  const terminalCandidates = [
    ['gnome-terminal', 'GNOME Terminal', ['gnome-terminal'], (dir) => ['--working-directory', dir]],
    ['konsole', 'Konsole', ['konsole'], (dir) => ['--workdir', dir]],
    ['xfce4-terminal', 'Xfce Terminal', ['xfce4-terminal'], (dir) => ['--working-directory', dir]],
    ['kitty', 'kitty', ['kitty'], (dir) => ['--directory', dir]],
    ['alacritty', 'Alacritty', ['alacritty'], (dir) => ['--working-directory', dir]],
    ['wezterm', 'WezTerm', ['wezterm'], (dir) => ['start', '--cwd', dir]],
    ['ghostty', 'Ghostty', ['ghostty'], (dir) => [`--working-directory=${dir}`]],
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

// 菜单每次打开都会请求一次列表；检测本身要逐个探测路径，重复执行没有意义。
// 进程内缓存一小段时间，并把 open_in 也接到同一份结果上（找不到应用时才强制重扫）。
const DETECT_TTL_MS = 60 * 1000;
let detectCache = null;

function detectAppsCached(force) {
  const now = Date.now();
  if (!force && detectCache && now - detectCache.at < DETECT_TTL_MS) return detectCache.apps;
  const apps = detectApps();
  detectCache = { at: now, apps };
  if (Date.now() - now >= 20) {
    process.stderr.write(`[open-in] detect apps: ${apps.length} found in ${Date.now() - now}ms (${PLATFORM})\n`);
  }
  return apps;
}

// 常驻启动时先预热一次检测，第一个菜单请求直接命中缓存。
try {
  detectAppsCached(false);
} catch {
  // 预热失败不影响后续按需检测。
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
    const target = validatedDirectory(args.path);
    const features = projectFeatures(target);
    return {
      ok: true,
      platform: PLATFORM,
      features,
      csharp: features.csharp,
      apps: detectAppsCached(false).map(({ id, label, group, requires }) => (
        requires ? { id, label, group, requires } : { id, label, group }
      )),
    };
  }

  if (method === 'apps/open') {
    if (typeof args.app !== 'string' || !args.app) return { ok: false, code: 'INVALID_ARGS' };
    const dir = validatedDirectory(args.path);
    if (!dir) return { ok: false, code: 'DIR_UNAVAILABLE' };
    // 正常情况下直接复用列表结果，避免再次扫描；只有应用不在缓存里才重扫一次。
    let app = detectAppsCached(false).find((item) => item.id === args.app);
    if (!app) app = detectAppsCached(true).find((item) => item.id === args.app);
    if (!app) return { ok: false, code: 'APP_NOT_AVAILABLE' };
    // 按项目类型限定应用（C# IDE、Git 客户端）；菜单可能来自旧缓存，这里再核一次。
    if (app.requires && !meetsRequirement(dir, app.requires)) return { ok: false, code: 'REQUIREMENT_UNMET' };
    try {
      const { command, args: spawnArgs } = app.run(dir);
      await launchDetached(command, spawnArgs);
      return { ok: true };
    } catch (error) {
      // 应用刚被卸载/移动时启动会报 ENOENT，丢掉旧缓存让下次列表重新检测。
      if (error && error.code === 'ENOENT') detectCache = null;
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
