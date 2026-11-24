const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const project = path.resolve(__dirname, '..');
const data = process.env.WHISTLE_PATH || path.join(os.homedir(), '.WhistleAppData');
const modules = path.join(data, '.whistle_client_plugins', 'node_modules');
const target = path.join(modules, 'whistle.ai-mock-values');
fs.mkdirSync(modules, { recursive: true });
try {
  fs.symlinkSync(project, target, 'dir');
} catch (err) {
  if (err.code !== 'EEXIST' || fs.realpathSync(target) !== project) throw err;
}
console.log('Whistle Desktop 插件目录已关联到 ' + project);
