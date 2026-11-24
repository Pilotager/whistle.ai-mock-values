const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { parseAnswer } = require('./mock');

const filename = process.env.WHISTLE_AI_MOCK_CONFIG ||
  path.join(os.homedir(), '.config', 'whistle.ai-mock-values', 'model.json');

function readConfig() {
  try { return JSON.parse(fs.readFileSync(filename, 'utf8')); }
  catch (err) { if (err.code !== 'ENOENT') throw new Error('模型配置读取失败。'); }
  return {
    baseUrl: process.env.AI_MOCK_BASE_URL || 'https://api.openai.com/v1',
    model: process.env.AI_MOCK_MODEL || '',
    apiKey: process.env.AI_MOCK_API_KEY || ''
  };
}

function saveConfig(input) {
  const current = readConfig();
  const url = new URL(input.baseUrl);
  if (url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
    throw new Error('模型地址需要 HTTPS，本机服务也可以使用 HTTP。');
  }
  if (url.username || url.password || url.search || url.hash) throw new Error('请输入模型服务的基础 URL。');
  const baseUrl = url.href.replace(/\/+$/, '');
  const model = String(input.model || '').trim();
  if (!model || model.length > 160) throw new Error('请输入模型名称。');
  const apiKey = String(input.apiKey || '').trim() || (baseUrl === current.baseUrl ? current.apiKey : '');
  fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  const tmp = filename + '.' + randomUUID();
  try {
    fs.writeFileSync(tmp, JSON.stringify({ baseUrl, model, apiKey }), { mode: 0o600, flag: 'wx' });
    fs.renameSync(tmp, filename);
  } finally { fs.rmSync(tmp, { force: true }); }
}

async function generate(input) {
  const config = readConfig();
  if (!config.model) throw new Error('请先在 Plugins → ai-mock-values → Option 配置模型。');
  const headers = { 'Content-Type': 'application/json' };
  if (config.apiKey) headers.Authorization = 'Bearer ' + config.apiKey;
  const system = '你生成用于接口测试的合成数据。仅返回 JSON 对象，格式 {"name":"接口简名","body":实际响应JSON}。'
    + 'name 优先使用用户给出的接口名或 operationId，否则取简短的英文 camelCase 名。'
    + 'body 严格遵循用户输入中的字段、类型、样例、条数和业务场景，可为数组、对象或标量。只使用虚构样例。';
  let response;
  try {
    response = await fetch(config.baseUrl.replace(/\/+$/, '') + '/chat/completions', {
      method: 'POST', headers, redirect: 'error', signal: AbortSignal.timeout(90000),
      body: JSON.stringify({ model: config.model, messages: [
        { role: 'system', content: system }, { role: 'user', content: input }
      ] })
    });
  } catch { throw new Error('模型服务连接失败或超时，请检查模型地址再试。'); }
  if (!response.ok) throw new Error('模型服务返回 HTTP ' + response.status + '，请检查模型名称、密钥或额度。');
  const data = await response.json();
  return parseAnswer(data.choices?.[0]?.message?.content);
}

module.exports = { generate, readConfig, saveConfig };
