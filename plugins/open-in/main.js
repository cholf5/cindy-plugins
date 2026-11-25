// Open In — 插件后台。
// 只处理菜单页面发来的「列出应用 / 用某应用打开目录」两个工具调用；
// 真正的已安装应用检测与 detached 启动都在随包 Node 工作进程里完成。
//
// 弹层页面每次打开都是新的隔离 origin，页面自己的 localStorage 靠不住；
// worker 也可能被回收。所以把应用列表在宿主 /kv 里留一份快照：重复打开直接
// 命中，过期后先返回旧结果、后台再刷新。检测本身（尤其 Windows 上）可能被
// 杀毒软件拖到秒级，不再让它挡在打开菜单的路上。

const MAX_PATH = 4096;
const APP_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;

const CACHE_KEY = 'appsCacheV1';
const APPS_REFRESH_MS = 5 * 60 * 1000; // 超过后在后台刷新
const FEATURES_MAX_AGE_MS = 10 * 60 * 1000; // C#/Git 判定按目录缓存
const FEATURES_MAX_ENTRIES = 24;

let cache = null;
let cacheLoading = null;
let appsRefreshing = null;

async function callWorker(method, params) {
  const response = await cindy.node.request({ method, params, timeoutMs: 20000 });
  if (!response || !response.ok) {
    const error = new Error((response && (response.message || response.errorCode)) || 'NODE_UNAVAILABLE');
    error.code = (response && response.errorCode) || 'NODE_UNAVAILABLE';
    throw error;
  }
  return response.result;
}

function send(callId, result) {
  return cindy.send({ type: 'tool-result', callId, ok: true, result });
}

function ok(callId, data) {
  return send(callId, {
    content: [{ type: 'text', text: JSON.stringify(data) }],
    structuredContent: data,
  });
}

function fail(callId, code) {
  return send(callId, {
    isError: true,
    content: [{ type: 'text', text: code }],
    structuredContent: { ok: false, code },
  });
}

function normalizeFeatures(data) {
  const source = data && data.features && typeof data.features === 'object' ? data.features : {};
  return {
    csharp: source.csharp === true || (data && data.csharp === true),
    git: source.git === true,
  };
}

function cleanApps(apps) {
  return (Array.isArray(apps) ? apps : [])
    .filter((item) => item && typeof item.id === 'string' && typeof item.label === 'string' && typeof item.group === 'string')
    .slice(0, 200)
    .map((item) => (item.requires ? { id: item.id, label: item.label, group: item.group, requires: item.requires } : { id: item.id, label: item.label, group: item.group }));
}

function resultPayload(apps, platform, features) {
  const normalized = features || { csharp: false, git: false };
  return {
    ok: true,
    apps,
    platform,
    csharp: normalized.csharp === true,
    features: { csharp: normalized.csharp === true, git: normalized.git === true },
  };
}

function kvTimeout(ms) {
  try {
    return AbortSignal.timeout(ms);
  } catch {
    return undefined;
  }
}

async function loadCache() {
  if (cache) return cache;
  if (!cacheLoading) {
    cacheLoading = (async () => {
      let stored = null;
      try {
        const response = await fetch('/kv', { signal: kvTimeout(1500) });
        if (response.ok) {
          const value = await response.json();
          stored = value && typeof value === 'object' ? value[CACHE_KEY] : null;
        }
      } catch {
        // 取不到就当作没有缓存，下次再试。
      }
      const apps = stored && stored.apps && Array.isArray(stored.apps.apps) && Number.isFinite(stored.apps.at)
        ? { at: stored.apps.at, platform: typeof stored.apps.platform === 'string' ? stored.apps.platform : '', apps: cleanApps(stored.apps.apps) }
        : null;
      const features = stored && stored.features && typeof stored.features === 'object' ? stored.features : {};
      cache = { apps, features };
      return cache;
    })();
  }
  return cacheLoading;
}

async function persistCache() {
  try {
    const response = await fetch('/kv', { signal: kvTimeout(1500) });
    const current = response.ok ? await response.json() : {};
    const next = current && typeof current === 'object' ? current : {};
    next[CACHE_KEY] = cache;
    await fetch('/kv', { method: 'PUT', body: JSON.stringify(next), signal: kvTimeout(2500) });
  } catch {
    // 缓存写不进去只影响下次打开的速度，不影响功能。
  }
}

function rememberApps(apps, platform) {
  cache.apps = {
    at: Date.now(),
    platform: typeof platform === 'string' ? platform : '',
    apps: cleanApps(apps),
  };
}

function rememberFeatures(dir, features) {
  cache.features[dir] = { at: Date.now(), csharp: features.csharp === true, git: features.git === true };
  const newest = Object.entries(cache.features)
    .filter(([, entry]) => entry && Number.isFinite(entry.at))
    .sort((left, right) => right[1].at - left[1].at)
    .slice(0, FEATURES_MAX_ENTRIES);
  cache.features = Object.fromEntries(newest);
}

function cachedFeatures(dir, now, allowStale = false) {
  const entry = cache.features[dir];
  if (!entry || !Number.isFinite(entry.at)) return null;
  if (!allowStale && now - entry.at > FEATURES_MAX_AGE_MS) return null;
  return { csharp: entry.csharp === true, git: entry.git === true };
}

// 旧快照先交给页面，再在后台补齐；失败不影响本次结果。
function refreshApps(dir) {
  if (appsRefreshing) return appsRefreshing;
  appsRefreshing = (async () => {
    const data = await callWorker('apps/list', dir ? { path: dir } : {});
    if (data && data.ok && Array.isArray(data.apps)) {
      rememberApps(data.apps, data.platform);
      if (dir) rememberFeatures(dir, normalizeFeatures(data));
      await persistCache();
    }
  })().catch(() => {}).finally(() => { appsRefreshing = null; });
  return appsRefreshing;
}

async function listApps(msg, dir) {
  await loadCache();
  const now = Date.now();
  const appsEntry = cache.apps;

  if (!appsEntry) {
    const data = await callWorker('apps/list', dir ? { path: dir } : {});
    if (!data || !data.ok || !Array.isArray(data.apps)) {
      await fail(msg.callId, (data && data.code) || 'LIST_FAILED');
      return;
    }
    const features = normalizeFeatures(data);
    rememberApps(data.apps, data.platform);
    if (dir) rememberFeatures(dir, features);
    void persistCache();
    await ok(msg.callId, resultPayload(cleanApps(data.apps), data.platform, features));
    return;
  }

  // 有快照就先显示；超过刷新间隔再在后台重扫，打开菜单不等检测。
  if (now - appsEntry.at > APPS_REFRESH_MS) void refreshApps(dir);

  let features = dir ? cachedFeatures(dir, now) : null;
  if (dir && !features) {
    try {
      const data = await callWorker('apps/features', { path: dir });
      if (data && data.ok) {
        features = normalizeFeatures(data);
        rememberFeatures(dir, features);
        void persistCache();
      }
    } catch {
      // worker 暂时不可用时，用过期但真实的判定兜底，别把 C#/Git 应用误藏起来。
      features = cachedFeatures(dir, now, true);
    }
  }
  await ok(msg.callId, resultPayload(appsEntry.apps, appsEntry.platform, features));
}

async function handleToolCall(msg) {
  if (msg.tool === 'list_apps') {
    const args = msg.args || {};
    const dir = typeof args.path === 'string' && args.path.length > 0 && args.path.length <= MAX_PATH ? args.path : null;
    try {
      await listApps(msg, dir);
    } catch (error) {
      await fail(msg.callId, (error && error.code) || 'NODE_UNAVAILABLE');
    }
    return;
  }

  if (msg.tool === 'open_in') {
    const args = msg.args || {};
    const app = typeof args.app === 'string' && APP_ID.test(args.app) ? args.app : null;
    const dir = typeof args.path === 'string' && args.path.length > 0 && args.path.length <= MAX_PATH ? args.path : null;
    if (!app || !dir) {
      await fail(msg.callId, 'INVALID_ARGS');
      return;
    }
    try {
      const data = await callWorker('apps/open', { app, path: dir });
      if (data && data.ok) {
        await ok(msg.callId, { ok: true, app });
      } else {
        // 应用已被卸载：从持久缓存里删掉，下次打开不再出现。
        if (data && data.code === 'APP_NOT_AVAILABLE' && cache && cache.apps) {
          cache.apps = { ...cache.apps, apps: cache.apps.apps.filter((item) => item.id !== app) };
          void persistCache();
        }
        await fail(msg.callId, (data && data.code) || 'OPEN_FAILED');
      }
    } catch (error) {
      await fail(msg.callId, (error && error.code) || 'NODE_UNAVAILABLE');
    }
  }
}

// 插件启动后顺手把检测结果写进 /kv，用户第一次打开菜单时通常已经就绪；
// 失败不影响按需检测。
async function warmCache() {
  try {
    await loadCache();
    if (cache.apps && Date.now() - cache.apps.at < APPS_REFRESH_MS) return;
    await refreshApps(null);
  } catch {
    // 启动预热只是加速，失败后由 list_apps 现场检测。
  }
}

cindy.onHostMessage((msg) => {
  if (msg.type !== 'tool-call') return;
  handleToolCall(msg).catch(() => {});
});

setTimeout(() => { void warmCache(); }, 2000);
