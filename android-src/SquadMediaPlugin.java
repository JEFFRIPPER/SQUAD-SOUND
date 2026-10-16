package com.squad.sound;

// Мост между плеером в WebView и SquadMediaService (уведомление, экран блокировки, наушники).
// JS: Capacitor.nativePromise('SquadMedia', 'update', {...}); нажатия приходят window-событием «squadMedia».

import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import androidx.core.content.ContextCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
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

    // POST формы для скробблинга Last.fm (WebView упирается в CORS). Только ws.audioscrobbler.com.
    @PluginMethod
    public void post(PluginCall call) {
        String url = call.getString("url", "");
        String body = call.getString("body", "");
        if (!url.startsWith("https://ws.audioscrobbler.com/")) { call.reject("url"); return; }
        new Thread(() -> {
            HttpURLConnection c = null;
            try {
                c = (HttpURLConnection) new URL(url).openConnection();
                c.setRequestMethod("POST");
                c.setDoOutput(true);
                c.setConnectTimeout(15000);
                c.setReadTimeout(20000);
                c.setRequestProperty("Content-Type", "application/x-www-form-urlencoded; charset=utf-8");
                c.setRequestProperty("User-Agent", "SQUAD-SOUND");
                try (OutputStream o = c.getOutputStream()) { o.write(body.getBytes(StandardCharsets.UTF_8)); }
                int code = c.getResponseCode();
                InputStream in = code >= 400 ? c.getErrorStream() : c.getInputStream();
                ByteArrayOutputStream buf = new ByteArrayOutputStream();
                if (in != null) {
                    byte[] b = new byte[8192];
                    int n;
                    while ((n = in.read(b)) > 0) buf.write(b, 0, n);
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
