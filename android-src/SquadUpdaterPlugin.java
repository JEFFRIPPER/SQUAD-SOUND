package com.squad.sound;

// Обновление APK внутри приложения: скачать новую версию из GitHub Releases в кэш
// и открыть системный установщик. Из JS: Capacitor.nativePromise('SquadUpdater', ...).

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

@CapacitorPlugin(name = "SquadUpdater")
public class SquadUpdaterPlugin extends Plugin {

    private static final String ALLOWED = "https://github.com/JEFFRIPPER/SQUAD-SOUND/releases/download/";

    private volatile String state = "idle"; // idle | downloading | ready | error
    private volatile long done = 0;
    private volatile long total = 0;
    private volatile String error = "";
    private volatile String version = "";

    private File apk() {
        return new File(new File(getContext().getCacheDir(), "updates"), "SQUAD-SOUND.apk");
    }

    private JSObject snapshot() {
        JSObject r = new JSObject();
        r.put("state", state);
        r.put("done", done);
        r.put("total", total);
        r.put("error", error);
        r.put("version", version);
        return r;
    }

    @PluginMethod
    public void status(PluginCall call) {
        call.resolve(snapshot());
    }

    @PluginMethod
    public void download(PluginCall call) {
        String url = call.getString("url", "");
        if (!url.startsWith(ALLOWED)) { call.reject("Недопустимый адрес обновления"); return; }
        if ("downloading".equals(state)) { call.resolve(snapshot()); return; }
        String ver = call.getString("version", "");
        if ("ready".equals(state) && ver.equals(version) && apk().exists()) { call.resolve(snapshot()); return; }
        state = "downloading";
        done = 0;
        total = call.getLong("size", 0L);
        error = "";
        version = ver;
        call.resolve(snapshot());
        new Thread(() -> {
            File out = apk();
            File tmp = new File(out.getParentFile(), "SQUAD-SOUND.part");
            try {
                out.getParentFile().mkdirs();
                String u = url;
                HttpURLConnection c = null;
                // GitHub отдаёт файл через редиректы на другой хост
                for (int i = 0; i < 6; i++) {
                    c = (HttpURLConnection) new URL(u).openConnection();
                    c.setInstanceFollowRedirects(false);
                    c.setConnectTimeout(20000);
                    c.setReadTimeout(30000);
                    int code = c.getResponseCode();
                    if (code >= 300 && code < 400) {
                        u = new URL(new URL(u), c.getHeaderField("Location")).toString();
                        c.disconnect();
                        continue;
                    }
                    if (code != 200) throw new Exception("HTTP " + code);
                    break;
                }
                long len = c.getContentLengthLong();
                if (len > 0) total = len;
                try (InputStream in = c.getInputStream(); FileOutputStream fo = new FileOutputStream(tmp)) {
                    byte[] buf = new byte[64 * 1024];
                    int n;
                    while ((n = in.read(buf)) > 0) {
                        fo.write(buf, 0, n);
                        done += n;
                    }
                }
                c.disconnect();
                if (total > 0 && done != total) throw new Exception("файл скачан не полностью");
                if (out.exists()) out.delete();
                if (!tmp.renameTo(out)) throw new Exception("не удалось сохранить файл");
                state = "ready";
            } catch (Exception e) {
                tmp.delete();
                error = e.getMessage() == null ? e.toString() : e.getMessage();
                state = "error";
            }
        }).start();
    }

    @PluginMethod
    public void install(PluginCall call) {
        File f = apk();
        if (!"ready".equals(state) || !f.exists()) { call.reject("Обновление ещё не скачано"); return; }
        JSObject r = new JSObject();
        try {
            if (Build.VERSION.SDK_INT >= 26 && !getContext().getPackageManager().canRequestPackageInstalls()) {
                // Сначала разрешение «Установка неизвестных приложений» для SQUAD SOUND
                Intent s = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
                s.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(s);
                r.put("needPermission", true);
                call.resolve(r);
                return;
            }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", f);
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(uri, "application/vnd.android.package-archive");
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            r.put("started", true);
            call.resolve(r);
        } catch (Exception e) {
            call.reject("Не удалось открыть установщик: " + e.getMessage());
        }
    }

    @PluginMethod
    public void openUrl(PluginCall call) {
        String url = call.getString("url", "");
        if (!url.startsWith("https://github.com/JEFFRIPPER/SQUAD-SOUND")) { call.reject("bad url"); return; }
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        call.resolve();
    }
}
