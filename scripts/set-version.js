// Ставит версию в package.json и www/js/version.js: node scripts/set-version.js 1.0.42
const fs = require('fs');
const path = require('path');

const v = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(v || '')) { console.error('Нужна версия вида 1.2.3'); process.exit(1); }
const root = path.join(__dirname, '..');
const pkgPath = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.version = v;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
fs.writeFileSync(path.join(root, 'www', 'js', 'version.js'),
  "// Перезаписывается при сборке (scripts/set-version.js)\nwindow.SQUAD_VERSION = '" + v + "';\n");
console.log('version', v);
