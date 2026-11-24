const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { extractRoute, keyPart, ruleFor } = require('./lib/mock');
const { generate, readConfig, saveConfig } = require('./lib/model');

const publicFiles = new Map([
  ['/', ['settings.html', 'text/html']], ['/public/settings.js', ['settings.js', 'text/javascript']],
  ['/public/menu.js', ['menu.js', 'text/javascript']], ['/public/rule-file.js', ['rule-file.js', 'text/javascript']], ['/public/style.css', ['style.css', 'text/css']]
]);

async function readJson(req) {
  if (!/^application\/json\b/i.test(req.headers['content-type'] || '') || req.headers['x-ai-mock'] !== '1') {
    throw new Error('请从 Whistle 插件界面发起操作。');
  }
  const chunks = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > 192 * 1024) throw new Error('接口定义过大，请只粘贴当前接口。');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

exports.uiServer = function uiServer(server, options) {
  const drafts = new Map();
  const ruleWriters = new Map();
  const listValues = () => new Promise((resolve, reject) => options.getValues(true, rows => {
    if (Array.isArray(rows)) resolve(rows);
    else reject(new Error('Whistle Values 读取失败。'));
  }));
  const routes = () => options.storage.getProperty('mockRoutes') || [];

  server.on('request', async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const send = (code, data, type = 'application/json') => {
      res.writeHead(code, { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(type === 'application/json' ? JSON.stringify(data) : data);
    };
    try {
      if (req.method === 'GET') {
        const file = publicFiles.get(url.pathname);
        if (file) return send(200, fs.readFileSync(path.join(__dirname, 'public', file[0])), file[1]);
        if (url.pathname === '/api/settings') {
          const { baseUrl, model, apiKey } = readConfig();
          return send(200, { baseUrl, model, hasKey: !!apiKey });
        }
        if (url.pathname === '/api/rules') {
          return send(200, routes().map(entry => ruleFor(entry.route, entry.name)).join('\n'), 'text/plain');
        }
      }
      if (req.method !== 'POST') return send(404, { error: '接口不存在' });
      const body = await readJson(req);
      if (url.pathname === '/api/settings') {
        saveConfig(body);
        return send(200, { ok: true });
      }
      if (url.pathname === '/api/generate') {
        const { input, group } = body;
        if (typeof input !== 'string' || !input.trim() || input.length > 48000) throw new Error('请输入需求或单个接口定义（最多 48000 字）。');
        if (typeof group !== 'string' || !group.startsWith('\r') || !group.slice(1).trim()) throw new Error('请选择一个 Values 分组。');
        const { stem, json } = await generate(input.trim());
        const entries = await listValues();
        const names = new Set(entries.map(entry => entry.name));
        if (!names.has(group)) throw new Error('目标分组已被删除或重命名，请重新选择。');
        const now = Date.now();
        for (const [id, draft] of drafts) {
          if (now >= draft.expires) drafts.delete(id);
          else names.add(draft.name);
        }
        const base = keyPart(group.slice(1), 'group') + '.' + stem;
        let number = 1;
        let name = base + '.json';
        while (names.has(name)) name = base + '-' + (++number) + '.json';
        const id = randomUUID();
        const draft = { name, group, json, route: extractRoute(input), expires: now + 600000 };
        drafts.set(id, draft);
        return send(200, { id, name, json });
      }
      if (url.pathname === '/api/complete') {
        const draft = drafts.get(body.id);
        if (!draft || Date.now() >= draft.expires) throw Object.assign(new Error('创建会话已过期，请重新生成。'), { code: 'STALE' });
        if (draft.result) return send(200, draft.result);
        const rows = await listValues();
        if (draft.result) return send(200, draft.result);
        let group;
        for (const row of rows) {
          if (row.name.startsWith('\r')) group = row.name;
          if (row.name !== draft.name) continue;
          if (group !== draft.group || row.value !== draft.json) throw Object.assign(new Error('同名 Value 已被其他操作占用，请重新生成。'), { code: 'STALE' });
          draft.result = { name: draft.name, file: group.slice(1), rule: draft.route && ruleFor(draft.route, draft.name) };
          delete draft.json;
          return send(200, draft.result);
        }
        throw new Error('Whistle 尚未保存该 Value，请重试。');
      }
      // Whistle saves an entire Rules file per POST. Serialize plugin writers across tabs.
      if (url.pathname === '/api/rule-lock') {
        if (typeof body.file !== 'string' || !body.file.trim()) throw new Error('缺少 Rules 文件名。');
        const current = ruleWriters.get(body.file);
        if (current && Date.now() < current.expires) return send(200, { busy: true });
        const token = randomUUID();
        ruleWriters.set(body.file, { token, expires: Date.now() + 30000 });
        return send(200, { token });
      }
      if (url.pathname === '/api/rule-release') {
        const writer = ruleWriters.get(body.file);
        if (!writer || writer.token !== body.token) throw new Error('Rules 写入会话已过期，请重试。');
        ruleWriters.delete(body.file);
        if (body.saved && typeof body.rule === 'string') {
          // Migrate any matching v0.1 dynamic binding after its native replacement is saved.
          const legacy = routes();
          const keep = legacy.filter(entry => ruleFor(entry.route, body.name) !== body.rule);
          if (keep.length !== legacy.length) {
            options.storage.setProperty('mockRoutes', keep);
            options.updateRules();
          }
        }
        return send(200, { ok: true });
      }
      send(404, { error: '接口不存在' });
    } catch (err) { send(400, { error: err.message || '操作失败，请重试。', code: err.code === 'STALE' ? 'STALE' : undefined }); }
  });
};
