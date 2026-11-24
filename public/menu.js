(() => {
  'use strict';
  const bridge = window.whistleBridge;
  const host = window.parent.document;
  const pluginRoot = new URL('../', location.href);
  const html = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  async function post(url, data, plugin = true) {
    const headers = { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
    if (plugin) headers['X-AI-Mock'] = '1';
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(data) });
    const result = await res.json().catch(() => { throw new Error('Whistle 响应异常（HTTP ' + res.status + '）。'); });
    if (!res.ok || result.error || result.ec) throw Object.assign(new Error(result.error || result.em || 'Whistle 保存失败。'), { code: result.code });
    return result;
  }

  async function writeAssociation(result) {
    const cgi = async (path, data) => {
      const url = new URL('whistle/cgi-bin/' + path, pluginRoot);
      if (data) return post(url, data, false);
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error('读取 Rules 失败（HTTP ' + response.status + '）。');
      const json = await response.json();
      if (json.ec) throw new Error(json.em || '读取 Rules 失败。');
      return json;
    };
    const file = result.file;
    const dirty = [...host.querySelectorAll('.w-list-data:not(.w-values-list) a.w-changed')].some(row => row.title === file);
    if (dirty) throw new Error('Rules → ' + file + ' 有未保存的编辑，请保存后重试关联。');
    const lockUrl = new URL('api/rule-lock', pluginRoot);
    let lock = await post(lockUrl, { file });
    const deadline = Date.now() + 12000;
    while (lock.busy && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 200));
      lock = await post(lockUrl, { file });
    }
    if (!lock.token) throw new Error('另一个窗口正在写入这个 Rules 文件，请重试。');
    let saved = false;
    try {
      const enabled = await window.aiMockRules.saveRule(cgi, file, result.rule);
      saved = true;
      return '已关联到 Rules → ' + file + (enabled ? '' : '（规则当前未启用）');
    } finally {
      await post(new URL('api/rule-release', pluginRoot), { ...result, token: lock.token, saved });
    }
  }

  // The WebUI reloads server-side changes through its own polling, preserving dirty editors.
  function openCreated(name, group) {
    const list = host.querySelector('.w-values-list');
    if (!list) return;
    const select = () => {
      const rows = [...list.querySelectorAll('a[data-name]')];
      const rowName = row => row.getAttribute('data-name').replace(/^\d+_/, '');
      const file = rows.find(row => rowName(row) === name);
      if (!file) return false;
      if (file.classList.contains('w-hide')) rows.find(row => rowName(row) === group)?.click();
      file.click();
      file.scrollIntoView({ block: 'nearest' });
      return true;
    };
    if (select()) return;
    const observer = new MutationObserver(() => { if (select()) observer.disconnect(); });
    observer.observe(list, { subtree: true, childList: true, attributes: true });
    setTimeout(() => observer.disconnect(), 20000);
  }

  bridge.on('values', context => {
    const group = context.activeItem?.name;
    if (!group?.startsWith('\r')) return bridge.toast.warn('请在 Values 的分组标题上右键。');
    const formId = 'ai-mock-' + Math.random().toString(36).slice(2);
    let draft;
    let saved = false;
    let dismissed = false;
    let busy = false;
    const close = bridge.showModal({
      title: 'AI 创建 Mock', width: 540, onClose() { dismissed = true; },
      body: '<form id="' + formId + '"><p>目标分组　<strong>' + html(group.slice(1)) + '</strong></p>' +
        '<label for="' + formId + '-input">需求或接口定义</label>' +
        '<textarea id="' + formId + '-input" class="form-control" rows="7" maxlength="48000" required placeholder="例如：POST https://api.example.test/clue/detail"></textarea>' +
        '<p role="status" aria-live="polite" style="margin:10px 0 0;color:#576779"></p>' +
        '<div style="text-align:right;margin-top:14px"><button type="submit" class="btn btn-primary">创建</button></div></form>',
      footer: false
    });
    const form = host.getElementById(formId);
    const input = form.querySelector('textarea');
    const button = form.querySelector('button');
    const status = form.querySelector('[role=status]');
    setTimeout(() => input.focus(), 100);
    input.oninput = () => { draft = null; };
    form.onsubmit = async event => {
      event.preventDefault();
      if (busy || !input.value.trim()) return;
      busy = button.disabled = input.readOnly = true;
      try {
        if (!draft) {
          status.textContent = '正在生成 Mock…';
          draft = await post(new URL('api/generate', pluginRoot), { group, input: input.value });
        }
        if (dismissed && !saved) return;
        if (!saved) {
          status.textContent = '正在保存到分组…';
          await post(new URL('whistle/cgi-bin/values/add', pluginRoot), {
            name: draft.name, value: draft.json, groupName: group, graceful: true
          }, false);
          saved = true;
        }
        const result = await post(new URL('api/complete', pluginRoot), { id: draft.id });
        const message = result.rule ? await writeAssociation(result) : '已创建 Value，输入中未识别到单一接口地址';
        if (dismissed) return;
        openCreated(result.name, group);
        bridge.toast.success(result.name + '　' + message);
        close();
      } catch (error) {
        status.textContent = (saved ? '已提交 Value。' : '') + error.message;
        if (error.code === 'STALE') {
          saved = false;
          draft = null;
          button.textContent = '重新生成';
        } else button.textContent = '重试';
      } finally {
        busy = button.disabled = false;
        input.readOnly = saved;
      }
    };
  });
})();
