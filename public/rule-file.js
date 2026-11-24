// Loaded by the menu iframe and by the native Rules integration tests.
(function (root) {
  'use strict';

  const marker = ' # AI Mock';
  function mergeRule(text, rule) {
    const operation = / file:\/\/\{[^{}\r\n]+\}/;
    const signature = rule.replace(operation, ' file://{}');
    const newline = text.includes('\r\n') ? '\r\n' : '\n';
    const lines = text.split(/\r?\n/);
    if (lines.some(line => line.trim() === rule)) return text;
    const index = lines.findIndex(line => line.endsWith(marker) &&
      line.slice(0, -marker.length).replace(operation, ' file://{}') === signature);
    if (index >= 0) {
      if (lines[index] === rule + marker) return text;
      lines[index] = rule + marker;
      return lines.join(newline);
    }
    const sep = text && !text.endsWith('\n') ? newline : '';
    return text + sep + rule + marker + newline;
  }

  async function saveRule(cgi, file, rule) {
    const source = () => cgi('rules/value?name=' + encodeURIComponent(file)).then(data => data.value);
    // Re-read after checking selection; preserve edits made while the generation dialog was open.
    const state = await cgi('rules/status');
    const previous = await source();
    const next = mergeRule(previous?.value || '', rule);
    const otherSelected = state.list.some(item => item.selected && item.name !== 'Default' && item.name !== file);
    // Selecting a new file in single-select mode would deactivate an unrelated project.
    const canSelect = !previous?.selected && (file === 'Default' || state.multiSelect || !otherSelected);
    if (previous?.value !== next || canSelect) {
      const payload = { name: file, value: next };
      if (canSelect) payload.selected = true;
      await cgi('rules/add', payload);
    }
    const after = await source();
    if (!after || mergeRule(after.value, rule) !== after.value) throw new Error('Rules 内容在保存期间发生变化，请重试关联。');
    return !!after.selected && !state.disabled;
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { mergeRule, saveRule };
  else root.aiMockRules = { saveRule };
})(globalThis);
