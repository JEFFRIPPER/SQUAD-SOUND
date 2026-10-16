package com.squad.sound;

// Поиск музыки на телефоне через MediaStore (вся память и SD-карта).
// Вызывается из www/js/app.js через Capacitor.nativePromise('MusicScanner', ...).

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Size;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;

@CapacitorPlugin(
    name = "MusicScanner",
    permissions = {
        @Permission(alias = "audio", strings = { "android.permission.READ_MEDIA_AUDIO" }),
        @Permission(alias = "storage", strings = { Manifest.permission.READ_EXTERNAL_STORAGE }),
    }
)
public class MusicScannerPlugin extends Plugin {

    private String perm() {
        return Build.VERSION.SDK_INT >= 33 ? "android.permission.READ_MEDIA_AUDIO" : Manifest.permission.READ_EXTERNAL_STORAGE;
    }

    private boolean granted() {
        return ContextCompat.checkSelfPermission(getContext(), perm()) == PackageManager.PERMISSION_GRANTED;
    }

    private void resolveState(PluginCall call) {
        JSObject r = new JSObject();
        r.put("audio", granted() ? "granted" : "denied");
        call.resolve(r);
    }

    @PluginMethod
    public void checkAudio(PluginCall call) {
        resolveState(call);
    }

    @PluginMethod
    public void requestAudio(PluginCall call) {
        if (granted()) { resolveState(call); return; }
        requestPermissionForAlias(Build.VERSION.SDK_INT >= 33 ? "audio" : "storage", call, "permCallback");
    }

    @PermissionCallback
    private void permCallback(PluginCall call) {
        resolveState(call);
    }

    private static String str(Cursor c, int i) {
        if (i < 0 || c.isNull(i)) return "";
        String s = c.getString(i);
        return s == null || s.equals("<unknown>") ? "" : s;
    }

    @PluginMethod
    public void scan(PluginCall call) {
        if (!granted()) { call.reject("Нет доступа к музыке", "NO_PERMISSION"); return; }
        getBridge().execute(() -> {
            try {
                ContentResolver cr = getContext().getContentResolver();
                Uri base = Build.VERSION.SDK_INT >= 29
                    ? MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL)
                    : MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;
                String folderCol = Build.VERSION.SDK_INT >= 29 ? MediaStore.Audio.Media.RELATIVE_PATH : MediaStore.Audio.Media.DATA;
                String[] proj = {
                    MediaStore.Audio.Media._ID, MediaStore.Audio.Media.TITLE, MediaStore.Audio.Media.ARTIST,
                    MediaStore.Audio.Media.ALBUM, MediaStore.Audio.Media.ALBUM_ID, MediaStore.Audio.Media.DURATION,
                    MediaStore.Audio.Media.TRACK, MediaStore.Audio.Media.YEAR, MediaStore.Audio.Media.DISPLAY_NAME,
                    MediaStore.Audio.Media.SIZE, folderCol,
                    Build.VERSION.SDK_INT >= 30 ? MediaStore.Audio.Media.GENRE : MediaStore.Audio.Media.MIME_TYPE,
                };
                String sel = MediaStore.Audio.Media.IS_MUSIC + " != 0 AND " + MediaStore.Audio.Media.DURATION + " >= 15000";
                JSArray list = new JSArray();
                try (Cursor c = cr.query(base, proj, sel, null, MediaStore.Audio.Media.DATE_ADDED + " DESC")) {
                    if (c != null) {
                        while (c.moveToNext()) {
                            long id = c.getLong(0);
                            JSObject t = new JSObject();
                            t.put("uri", ContentUris.withAppendedId(base, id).toString());
                            t.put("title", str(c, 1));
                            t.put("artist", str(c, 2));
                            t.put("album", str(c, 3));
                            t.put("albumId", c.getLong(4));
                            t.put("duration", c.getLong(5));
                            int track = c.isNull(6) ? 0 : c.getInt(6);
                            t.put("no", track % 1000);
                            t.put("disc", track / 1000);
                            t.put("year", c.isNull(7) ? 0 : c.getInt(7));
                            t.put("name", str(c, 8));
                            t.put("size", c.getLong(9));
                            String folder = str(c, 10);
                            if (Build.VERSION.SDK_INT < 29 && folder.contains("/")) folder = folder.substring(0, folder.lastIndexOf('/'));
                            t.put("folder", folder.replaceAll("/+$", ""));
                            t.put("genre", Build.VERSION.SDK_INT >= 30 ? str(c, 11) : "");
                            list.put(t);
                        }
                    }
                }
                JSObject r = new JSObject();
                r.put("tracks", list);
                call.resolve(r);
            } catch (Exception e) {
                call.reject("Ошибка поиска музыки: " + e.getMessage());
            }
        });
    }

    // Обложка трека (встроенная или из альбома) в виде data:image/jpeg;base64
    @PluginMethod
    public void artwork(PluginCall call) {
        String uri = call.getString("uri");
        long albumId = call.getLong("albumId", 0L);
        int size = call.getInt("size", 160);
        getBridge().execute(() -> {
            Bitmap bmp = null;
            ContentResolver cr = getContext().getContentResolver();
            try {
                if (Build.VERSION.SDK_INT >= 29 && uri != null) {
                    bmp = cr.loadThumbnail(Uri.parse(uri), new Size(size, size), null);
                }
            } catch (Exception ignored) {}
            if (bmp == null && albumId > 0) {
                try (InputStream in = cr.openInputStream(ContentUris.withAppendedId(Uri.parse("content://media/external/audio/albumart"), albumId))) {
                    if (in != null) bmp = BitmapFactory.decodeStream(in);
                } catch (Exception ignored) {}
            }
            JSObject r = new JSObject();
            if (bmp != null) {
                if (bmp.getWidth() > size * 2) bmp = Bitmap.createScaledBitmap(bmp, size, size * bmp.getHeight() / bmp.getWidth(), true);
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                bmp.compress(Bitmap.CompressFormat.JPEG, 88, out);
                r.put("data", "data:image/jpeg;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP));
            }
            call.resolve(r);
        });
    }
}
