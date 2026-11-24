const YAML = require('yaml');

const METHODS = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/i;

function literalTarget(value) {
  if (typeof value !== 'string' || !/^(https?:\/\/|\/(?!\/))/.test(value)) return;
  if (/[\\\s#<>{}\x00-\x1f\x7f*"'`]/u.test(value) || /\/:[\w-]+(?:[/?]|$)/.test(value)) return;
  try {
    const url = new URL(value, 'http://placeholder.invalid');
    if (/(?:^|\/)(?:gateway|graphql|rpc)(?:\/v\d+)?\/?$/i.test(url.pathname) || url.pathname === '/') return;
    if (!url.username && !url.password) {
      return value.startsWith('/') ? url.pathname + url.search : url.href;
    }
  } catch {}
}

// Match only a single concrete operation supplied by the user. Generated prose never supplies rules.
function extractRoute(input) {
  if (/(?:共享|统一)网关|根据请求体区分|shared gateway/i.test(input)) return null;
  let doc;
  try { doc = YAML.parse(input, { maxAliasCount: 10 }); } catch {}
  if (doc?.paths && typeof doc.paths === 'object') {
    const operations = [];
    for (const [path, item] of Object.entries(doc.paths)) {
      for (const [method, spec] of Object.entries(item || {})) {
        if (!METHODS.test(method)) continue;
        const servers = spec?.servers || item.servers || doc.servers;
        let base = servers?.[0]?.url ?? '';
        if (!servers && doc.host) base = (doc.schemes?.[0] || 'https') + '://' + doc.host + (doc.basePath || '');
        const target = typeof base === 'string' && path.startsWith('/') && literalTarget(base.replace(/\/$/, '') + path);
        operations.push(target && { method: method.toUpperCase(), target });
      }
    }
    return operations.length === 1 ? operations[0] : null;
  }
  if (doc && typeof doc === 'object') {
    const target = literalTarget(doc.url ?? doc.URL ?? doc.path ?? doc.endpoint ?? doc['接口地址'] ?? doc['请求地址'] ?? doc['接口路径']);
    const method = doc.method ?? doc['请求方法'] ?? doc['请求方式'];
    if (method != null && !METHODS.test(method)) return null;
    if (target) return { method: method?.toUpperCase() || '', target };
    // Free text with an HTTP request line and YAML-like examples can parse as a map.
    if (!/^(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)[ \t]+(?:https?:\/\/|\/)/im.test(input)) return null;
  }
  const matches = [...input.matchAll(/\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)[ \t]+((?:https?:\/\/|\/)[^\s，。；<>"'）)]+)/gi)];
  if (matches.length > 1) return null;
  if (matches.length) {
    const target = literalTarget(matches[0][2]);
    return target ? { method: matches[0][1].toUpperCase(), target } : null;
  }
  // Accept a URL on its own line, or an explicitly labelled endpoint. Ignore URLs in response examples.
  const targets = [];
  for (const line of input.split(/\r?\n/)) {
    const match = line.trim().match(/^(?:(?:接口(?:地址|路径|URL)?|请求(?:地址|路径|URL)|URL|path|endpoint)\s*[:：=]\s*)?((?:https?:\/\/|\/(?!\/))[^\s，。；<>"']+)(?=$|[\s，。；])/i);
    const inline = !match && line.match(/(?:给|为|请求地址(?:是|为)?|接口地址(?:是|为)?|接口(?:是|为))\s*[:：]?\s*(https?:\/\/[^\s，。；<>"'）)]+)/i);
    if (match || inline) targets.push(literalTarget((match || inline)[1]));
  }
  const methods = [...input.matchAll(/(?:请求方法|请求方式|method)\s*[:：=]\s*(\w+)/gi)];
  if (methods.length > 1 || (methods.length && !METHODS.test(methods[0][1]))) return null;
  return targets.length === 1 && targets[0] ? { method: methods[0]?.[1].toUpperCase() || '', target: targets[0] } : null;
}

function keyPart(value, fallback) {
  return String(value || '').normalize('NFKC').replace(/\.json$/i, '')
    .replace(/[^\p{L}\p{N}_.-]+/gu, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 55) || fallback;
}

function ruleFor(route, name) {
  const { method, target } = route;
  let pattern = '$' + target;
  if (target.startsWith('/')) {
    const escaped = target.replace(/[.*+?^$()|[\]{}\\/]/g, '\\$&');
    pattern = '/^https?:\\/\\/[^/]+' + escaped + (target.includes('?') ? '$/' : '(?:\\?.*)?$/');
  }
  return pattern + ' file://{' + name + '}' + (method ? ' includeFilter://m:' + method : '');
}

function parseAnswer(text) {
  const source = String(text || '').trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, '$1');
  let result;
  try { result = JSON.parse(source); } catch {}
  if (!result || typeof result.name !== 'string' || !Object.hasOwn(result, 'body')) {
    throw new Error('模型返回格式有误，请重新生成。');
  }
  const json = JSON.stringify(result.body, null, 2);
  if (Buffer.byteLength(json) > 480 * 1024) throw new Error('生成结果过大，请减少样例条数。');
  return { stem: keyPart(result.name, 'mock'), json };
}

module.exports = { extractRoute, keyPart, parseAnswer, ruleFor };
