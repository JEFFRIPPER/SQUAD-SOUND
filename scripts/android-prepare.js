// Готовит Android-проект Capacitor: создаёт его (если нет), иконки, синхронизирует www.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const run = (cmd) => execSync(cmd, { stdio: 'inherit', cwd: root });

if (!fs.existsSync(path.join(root, 'android'))) run('npx cap add android');

run('npx capacitor-assets generate --android --assetPath assets' +
  ' --iconBackgroundColor "#13131b" --iconBackgroundColorDark "#13131b"' +
  ' --splashBackgroundColor "#0b0b10" --splashBackgroundColorDark "#0b0b10"');

// Версия приложения = версия из package.json
const pkg = require(path.join(root, 'package.json'));
const gradle = path.join(root, 'android', 'app', 'build.gradle');
let g = fs.readFileSync(gradle, 'utf8');
const [maj, min, pat] = pkg.version.split('.').map(Number);
const code = maj * 10000 + min * 100 + pat;
g = g.replace(/versionCode \d+/, 'versionCode ' + (process.env.VERSION_CODE || code))
     .replace(/versionName "[^"]*"/, 'versionName "' + pkg.version + '"');
fs.writeFileSync(gradle, g);

run('npx cap sync android');
