const { test } = require('node:test');
const assert = require('node:assert/strict');
const { extractRoute, keyPart, parseAnswer, ruleFor } = require('../lib/mock');

test('需求可以仅生成 Value，只有明确的单一接口生成规则', () => {
  assert.equal(extractRoute('给 getClueDetail 生成一条线索'), null);
  assert.deepEqual(extractRoute('生成线索。GET https://example.test/api/clue?type=mine'), {
    method: 'GET', target: 'https://example.test/api/clue?type=mine'
  });
  for (const input of ['GET /list\nPOST /list', 'GET /users/{id}', 'GET /users/:id', 'GET /api/*', 'POST /api/gateway', 'POST /graphql', '共享网关 POST https://example.test/dispatch']) {
    assert.equal(extractRoute(input), null);
  }
});

test('读取单接口 OpenAPI YAML、JSON 和 method/path 定义', () => {
  const doc = { openapi: '3.0.0', servers: [{ url: 'https://example.test/api' }], paths: {
    '/clue': { get: { operationId: 'getClueDetail' } }
  } };
  assert.deepEqual(extractRoute(JSON.stringify(doc)), { method: 'GET', target: 'https://example.test/api/clue' });
  const yaml = 'openapi: 3.0.0\npaths:\n  /clue:\n    post:\n      operationId: getClueDetail';
  assert.deepEqual(extractRoute(yaml), { method: 'POST', target: '/clue' });
  assert.deepEqual(extractRoute('method: PUT\npath: /clue'), { method: 'PUT', target: '/clue' });
});

test('路径规则支持 query，方法和路径明确限定', () => {
  const result = ruleFor({ method: 'POST', target: '/api/clue.json' }, '销售.clue.json');
  const [pattern, file, filter] = result.split(' ');
  assert.ok(!pattern.includes('#'), 'Whistle treats # as a rule comment');
  const re = new RegExp(pattern.slice(1, -1));
  assert.match('https://example.test/api/clue.json?page=1', re);
  assert.doesNotMatch('https://example.test/api/clueXjson', re);
  assert.doesNotMatch('https://example.test/api/clue.json/other', re);
  assert.equal(file, 'file://{销售.clue.json}');
  assert.equal(filter, 'includeFilter://m:POST');
});

test('解析并格式化模型响应，同时支持数组和 null', () => {
  assert.deepEqual(parseAnswer('{"name":"clue.json","body":null}'), { stem: 'clue', json: 'null' });
  assert.equal(parseAnswer('{"name":"clue","body":[1]}').json, '[\n  1\n]');
  assert.throws(() => parseAnswer('{"name":"clue"}'));
  assert.throws(() => parseAnswer('{"example":1}'));
  assert.throws(() => parseAnswer('这不是 JSON'));
  assert.equal(keyPart('销售 线索/列表', 'mock'), '销售-线索-列表');
});

test('显式 URL 可省略方法，响应中的示例链接不绑定', () => {
  const url = 'https://api.example.test/orders';
  for (const input of [url, '接口地址：' + url, '给 ' + url + ' 生成两条订单']) {
    assert.deepEqual(extractRoute(input), { method: '', target: url });
  }
  assert.deepEqual(extractRoute('接口地址: ' + url + '\n请求方式: POST'), { method: 'POST', target: url });
  assert.equal(ruleFor({ method: '', target: url }, 'orders.json'), '$' + url + ' file://{orders.json}');
  assert.equal(extractRoute('{"data":{"avatar":"' + url + '"}}'), null);
  assert.equal(extractRoute(url + '\n' + url + '/other'), null);
});

const { mergeRule, saveRule } = require('../public/rule-file');
test('同一接口重试和换 Value 保留现有手写规则', () => {
  const original = '# 我的规则\r\nexample.test file://{old.json}\r\n';
  const rule = ruleFor({ method: 'POST', target: '/list' }, 'g.list.json');
  const once = mergeRule(original, rule);
  assert.equal(mergeRule(once, rule), once);
  const updated = rule.replace('g.list.json', 'g.list-2.json');
  assert.equal(mergeRule(once, updated), mergeRule(original, updated));
  assert.ok(once.startsWith(original));
});

test('单选模式下写入可见规则并保留其他项目的启用状态', async () => {
  let content;
  const cgi = async (path, body) => {
    if (path === 'rules/status') return { list: [{ name: 'other', selected: true }], multiSelect: false };
    if (path.startsWith('rules/value?')) return { value: content };
    assert.equal(path, 'rules/add');
    assert.equal(body.selected, undefined);
    content = { value: body.value, selected: false };
  };
  assert.equal(await saveRule(cgi, 'g', '$https://a.test/list file://{g.list.json}'), false);
  assert.match(content.value, /file:\/\/\{g.list.json\}/);
});
