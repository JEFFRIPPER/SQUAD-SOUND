// Ключи приложения Telegram (my.telegram.org) из переменных TG_API_ID / TG_API_HASH → www/js/tg-config.js
const fs = require('fs');
const path = require('path');

const id = Number(process.env.TG_API_ID || 0);
const hash = String(process.env.TG_API_HASH || '').trim();
if (!id || !/^[0-9a-f]{32}$/i.test(hash)) {
  console.log('::error::Нет секретов TG_API_ID / TG_API_HASH (или api_hash не из 32 hex-символов) — вкладка Telegram будет без входа');
  process.exit(1);
}
fs.writeFileSync(path.join(__dirname, '..', 'www', 'js', 'tg-config.js'),
  '// Перезаписывается при сборке (scripts/set-tg-config.js) из секретов TG_API_ID / TG_API_HASH\n' +
  'window.SQUAD_TG = { apiId: ' + id + ", apiHash: '" + hash + "' };\n");
console.log('Ключи Telegram записаны, api_id', id);
