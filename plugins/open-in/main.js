// Open In — 插件后台。
// 只处理菜单页面发来的「列出应用 / 用某应用打开目录」两个工具调用；
// 真正的已安装应用检测与 detached 启动都在随包 Node 工作进程里完成。

const MAX_PATH = 4096;
const APP_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;

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

async function handleToolCall(msg) {
  if (msg.tool === 'list_apps') {
    const args = msg.args || {};
    const dir = typeof args.path === 'string' && args.path.length > 0 && args.path.length <= MAX_PATH ? args.path : null;
    try {
      const data = await callWorker('apps/list', dir ? { path: dir } : {});
      if (data && data.ok && Array.isArray(data.apps)) {
        await ok(msg.callId, {
          ok: true,
          apps: data.apps,
          platform: data.platform,
          csharp: data.csharp === true,
          features: data.features && typeof data.features === 'object' ? data.features : { csharp: data.csharp === true, git: false },
        });
      } else {
        await fail(msg.callId, (data && data.code) || 'LIST_FAILED');
      }
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
      if (data && data.ok) await ok(msg.callId, { ok: true, app });
      else await fail(msg.callId, (data && data.code) || 'OPEN_FAILED');
    } catch (error) {
      await fail(msg.callId, (error && error.code) || 'NODE_UNAVAILABLE');
    }
  }
}

cindy.onHostMessage((msg) => {
  if (msg.type !== 'tool-call') return;
  handleToolCall(msg).catch(() => {});
});
