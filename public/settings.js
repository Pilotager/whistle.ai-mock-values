const form = document.querySelector('form');
const base = document.querySelector('#base');
const model = document.querySelector('#model');
const key = document.querySelector('#key');
const status = document.querySelector('output');

async function load() {
  const res = await fetch('./api/settings');
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  base.value = data.baseUrl;
  model.value = data.model;
  key.value = '';
  key.placeholder = data.hasKey ? '已配置；同一服务地址留空保留现有密钥' : '本机免鉴权服务可留空';
}
load().catch(error => { status.textContent = error.message; });
form.onsubmit = async event => {
  event.preventDefault();
  form.querySelector('button').disabled = true;
  try {
    const response = await fetch('./api/settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-AI-Mock': '1' },
      body: JSON.stringify({ baseUrl: base.value.trim(), model: model.value.trim(), apiKey: key.value })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    await load();
    status.textContent = '设置已保存。';
  } catch (error) { status.textContent = error.message; }
  finally { form.querySelector('button').disabled = false; }
};
