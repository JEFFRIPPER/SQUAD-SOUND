package com.squad.sound;

// Мост между плеером в WebView и SquadMediaService (уведомление, экран блокировки, наушники).
// JS: Capacitor.nativePromise('SquadMedia', 'update', {...}); нажатия приходят window-событием «squadMedia».

import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.media.AudioDeviceCallback;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.os.Build;
import android.os.SystemClock;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import androidx.core.content.ContextCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.JSObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

@CapacitorPlugin(name = "SquadMedia")
public class SquadMediaPlugin extends Plugin {

    private static volatile SquadMediaPlugin self;
    private final Handler main = new Handler(Looper.getMainLooper());

    @Override
    public void load() {
        self = this;
        Context ctx = getContext();
        // Наушники выдернули / Bluetooth отвалился — пауза, чтобы музыка не заорала из динамика
        ContextCompat.registerReceiver(ctx, new BroadcastReceiver() {
            @Override public void onReceive(Context c, Intent i) { emit("noisy", -1); }
        }, new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY), ContextCompat.RECEIVER_NOT_EXPORTED);
        // Сменился выход звука (подключили наушники) — JS перезапустит вывод Web Audio под новое устройство,
        // иначе на некоторых телефонах он продолжает писать с параметрами динамика и трещит
        if (Build.VERSION.SDK_INT >= 23) {
            final long since = SystemClock.elapsedRealtime();
            AudioManager am = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
            am.registerAudioDeviceCallback(new AudioDeviceCallback() {
                @Override public void onAudioDevicesAdded(AudioDeviceInfo[] d) { route(d, since); }
                @Override public void onAudioDevicesRemoved(AudioDeviceInfo[] d) { route(d, since); }
            }, main);
        }
    }

    private static void route(AudioDeviceInfo[] d, long since) {
        if (SystemClock.elapsedRealtime() - since < 2000) return; // первый вызов — список уже подключённых устройств
        for (AudioDeviceInfo i : d) if (i.isSink()) { emit("route", -1); return; }
    }

    // Жив ли плеер в WebView (после выгрузки процесса — нет)
    static boolean alive() {
        SquadMediaPlugin p = self;
        return p != null && p.bridge != null && p.getActivity() != null && !p.getActivity().isFinishing();
    }

    // Нажатие в уведомлении/на наушниках → window «squadMedia» {action, pos}
    static void emit(String action, double pos) {
        SquadMediaPlugin p = self;
        if (p == null || p.bridge == null) return;
        try {
            JSONObject o = new JSONObject();
            o.put("action", action);
            o.put("pos", pos);
            p.bridge.triggerWindowJSEvent("squadMedia", o.toString());
        } catch (Throwable ignored) {}
    }

    @PluginMethod
    public void update(PluginCall call) {
        String t = call.getString("title");
        if (t != null) SquadMediaService.title = t;
        String a = call.getString("artist");
        if (a != null) SquadMediaService.artist = a;
        Boolean pl = call.getBoolean("playing");
        if (pl != null) SquadMediaService.playing = pl;
        Double pos = call.getDouble("position");
        if (pos != null && !pos.isNaN()) SquadMediaService.positionMs = (long) (pos * 1000);
        Double dur = call.getDouble("duration");
        if (dur != null && !dur.isNaN() && !dur.isInfinite()) SquadMediaService.durationMs = (long) (dur * 1000);
        Double sp = call.getDouble("speed");
        if (sp != null && sp > 0) SquadMediaService.speed = sp.floatValue();
        if (call.getData().has("art")) SquadMediaService.art = decode(call.getString("art"));

        SquadMediaService s = SquadMediaService.instance;
        if (s != null) {
            main.post(s::refresh);
        } else if (SquadMediaService.playing) {
            try {
                Context ctx = getContext();
                Intent i = new Intent(ctx, SquadMediaService.class).setAction(SquadMediaService.ACTION_START);
                ContextCompat.startForegroundService(ctx, i);
            } catch (Throwable e) {
                // Android 12+ не даёт запускать службу из фона — запустим при следующем нажатии «играть»
                android.util.Log.w("SquadMedia", "start", e);
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        SquadMediaService s = SquadMediaService.instance;
        if (s != null) main.post(s::shutdown);
        call.resolve();
    }

    // Запросы мимо CORS WebView — только к своему списку адресов:
    // POST формы — скробблинг Last.fm и распознавание песни AudD; GET — плейлист по ссылке (Яндекс Музыка, Deezer, Spotify).
    private static final String[] POST_OK = { "https://ws.audioscrobbler.com/", "https://api.audd.io/" };
    private static final String[] GET_OK = { "https://api.music.yandex.net/", "https://api.deezer.com/", "https://open.spotify.com/embed/" };

    private static boolean allowed(String url, String[] list) {
        for (String p : list) if (url.startsWith(p)) return true;
        return false;
    }

    @PluginMethod
    public void post(PluginCall call) {
        String url = call.getString("url", "");
        if (!allowed(url, POST_OK)) { call.reject("url"); return; }
        http(call, url, call.getString("body", ""));
    }

    @PluginMethod
    public void get(PluginCall call) {
        String url = call.getString("url", "");
        if (!allowed(url, GET_OK)) { call.reject("url"); return; }
        http(call, url, null);
    }

    private void http(PluginCall call, String url, String body) {
        new Thread(() -> {
            HttpURLConnection c = null;
            try {
                c = (HttpURLConnection) new URL(url).openConnection();
                c.setConnectTimeout(15000);
                c.setReadTimeout(30000);
                c.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android) SQUAD-SOUND");
                if (body != null) {
                    c.setRequestMethod("POST");
                    c.setDoOutput(true);
                    c.setRequestProperty("Content-Type", "application/x-www-form-urlencoded; charset=utf-8");
                    try (OutputStream o = c.getOutputStream()) { o.write(body.getBytes(StandardCharsets.UTF_8)); }
                }
                int code = c.getResponseCode();
                InputStream in = code >= 400 ? c.getErrorStream() : c.getInputStream();
                ByteArrayOutputStream buf = new ByteArrayOutputStream();
                if (in != null) {
                    byte[] b = new byte[8192];
                    int n;
                    while ((n = in.read(b)) > 0 && buf.size() < 8 * 1024 * 1024) buf.write(b, 0, n);
                    in.close();
                }
                JSObject r = new JSObject();
                r.put("status", code);
                r.put("body", buf.toString("UTF-8"));
                call.resolve(r);
            } catch (Throwable e) {
                call.reject(String.valueOf(e.getMessage()));
            } finally {
                if (c != null) c.disconnect();
            }
        }).start();
    }

    // Сохранить текст в файл, место выбирает пользователь (резервная копия настроек, пресеты)
    @PluginMethod
    public void saveText(PluginCall call) {
        Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT)
            .addCategory(Intent.CATEGORY_OPENABLE)
            .setType(call.getString("mime", "application/json"))
            .putExtra(Intent.EXTRA_TITLE, call.getString("name", "squad-sound.json"));
        startActivityForResult(call, i, "onSaveText");
    }

    @ActivityCallback
    private void onSaveText(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject r = new JSObject();
        Intent data = result.getData();
        Uri uri = data != null ? data.getData() : null;
        if (result.getResultCode() != Activity.RESULT_OK || uri == null) {
            r.put("saved", false);
            call.resolve(r);
            return;
        }
        try (OutputStream o = getContext().getContentResolver().openOutputStream(uri, "w")) {
            if (o == null) throw new IllegalStateException("stream");
            o.write(call.getString("text", "").getBytes(StandardCharsets.UTF_8));
            r.put("saved", true);
            call.resolve(r);
        } catch (Throwable e) {
            call.reject(String.valueOf(e.getMessage()));
        }
    }

    private static Bitmap decode(String dataUrl) {
        if (dataUrl == null || dataUrl.isEmpty()) return null;
        try {
            int comma = dataUrl.indexOf(',');
            byte[] b = Base64.decode(comma >= 0 ? dataUrl.substring(comma + 1) : dataUrl, Base64.DEFAULT);
            return BitmapFactory.decodeByteArray(b, 0, b.length);
        } catch (Throwable e) {
            return null;
        }
    }
}
