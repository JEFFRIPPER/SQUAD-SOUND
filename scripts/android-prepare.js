// Готовит Android-проект Capacitor: создаёт его (если нет), иконки, синхронизирует www.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const run = (cmd) => execSync(cmd, { stdio: 'inherit', cwd: root });

if (!fs.existsSync(path.join(root, 'android'))) run('npx cap add android');

run('npx capacitor-assets generate --android --assetPath assets' +
  ' --iconBackgroundColor "#070203" --iconBackgroundColorDark "#070203"' +
  ' --splashBackgroundColor "#070203" --splashBackgroundColorDark "#070203"');

// Версия приложения = версия из package.json
const pkg = require(path.join(root, 'package.json'));
const gradle = path.join(root, 'android', 'app', 'build.gradle');
let g = fs.readFileSync(gradle, 'utf8');
const [maj, min, pat] = pkg.version.split('.').map(Number);
const code = maj * 10000 + min * 100 + pat;
g = g.replace(/versionCode \d+/, 'versionCode ' + (process.env.VERSION_CODE || code))
     .replace(/versionName "[^"]*"/, 'versionName "' + pkg.version + '"');
fs.writeFileSync(gradle, g);

// Нативные плагины (поиск музыки, обновление APK), MainActivity и разрешения
const javaDir = path.join(root, 'android', 'app', 'src', 'main', 'java', 'com', 'squad', 'sound');
fs.mkdirSync(javaDir, { recursive: true });
for (const f of ['MusicScannerPlugin.java', 'SquadUpdaterPlugin.java', 'SquadMediaPlugin.java', 'SquadMediaService.java', 'SquadWidget.java', 'MainActivity.java']) {
  fs.copyFileSync(path.join(root, 'android-src', f), path.join(javaDir, f));
}
// Ресурсы виджета (android-src/res → app/src/main/res)
fs.cpSync(path.join(root, 'android-src', 'res'), path.join(root, 'android', 'app', 'src', 'main', 'res'), { recursive: true });
const manifest = path.join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
let m = fs.readFileSync(manifest, 'utf8');
const perms = [
  '<uses-permission android:name="android.permission.READ_MEDIA_AUDIO" />',
  '<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />',
  // удаление треков на Android 9 и ниже (с 10-го — через системный запрос)
  '<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="28" />',
  // обновление APK изнутри приложения
  '<uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />',
  // фоновое воспроизведение: служба с уведомлением, экран блокировки, наушники
  '<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />',
  '<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK" />',
  '<uses-permission android:name="android.permission.WAKE_LOCK" />',
  '<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />',
  // «Что играет?» — запись 10 секунд с микрофона (запрос показывает Capacitor при первом нажатии)
  '<uses-permission android:name="android.permission.RECORD_AUDIO" />',
  '<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />',
];
for (const p of perms) {
  const name = p.match(/name="([^"]+)"/)[1];
  if (!m.includes('"' + name + '"')) m = m.replace('</manifest>', '    ' + p + '\n</manifest>');
}
const service = '<service android:name=".SquadMediaService" android:exported="false" android:foregroundServiceType="mediaPlayback" />';
if (!m.includes('.SquadMediaService')) m = m.replace('</application>', '    ' + service + '\n    </application>');
const widget = '<receiver android:name=".SquadWidget" android:exported="false" android:label="SQUAD SOUND">' +
  '<intent-filter><action android:name="android.appwidget.action.APPWIDGET_UPDATE" /></intent-filter>' +
  '<meta-data android:name="android.appwidget.provider" android:resource="@xml/squad_widget_info" /></receiver>';
if (!m.includes('.SquadWidget')) m = m.replace('</application>', '    ' + widget + '\n    </application>');
fs.writeFileSync(manifest, m);

run('npx cap sync android');
