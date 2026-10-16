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
