package com.squad.sound;

// Фоновое воспроизведение: служба переднего плана (mediaPlayback) держит процесс живым при выключенном экране,
// MediaSession отдаёт управление шторке, экрану блокировки, наушникам и часам.
// Состояние приходит из JS через SquadMediaPlugin, нажатия уходят обратно в JS событием window «squadMedia».

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;

public class SquadMediaService extends Service {

    static final String ACTION_START = "com.squad.sound.media.START";
    static final String ACTION_TOGGLE = "com.squad.sound.media.TOGGLE";
    static final String ACTION_NEXT = "com.squad.sound.media.NEXT";
    static final String ACTION_PREV = "com.squad.sound.media.PREV";
    private static final String ACTION_CLOSE = "com.squad.sound.media.CLOSE";
    private static final String CHANNEL = "playback";
    private static final int ID = 7001;

    // Последнее состояние плеера (пишет плагин, читает служба)
    static volatile String title = "SQUAD SOUND";
    static volatile String artist = "";
    static volatile boolean playing = false;
    static volatile long positionMs = 0;
    static volatile long durationMs = 0;
    static volatile float speed = 1f;
    static volatile Bitmap art = null;

    static volatile SquadMediaService instance = null;

    private MediaSession session;
    private PowerManager.WakeLock wake;
    private final Handler main = new Handler(Looper.getMainLooper());

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Воспроизведение", NotificationManager.IMPORTANCE_LOW);
            ch.setShowBadge(false);
            getSystemService(NotificationManager.class).createNotificationChannel(ch);
        }
        session = new MediaSession(this, "SquadSound");
        session.setCallback(new MediaSession.Callback() {
            @Override public void onPlay() { SquadMediaPlugin.emit("play", -1); }
            @Override public void onPause() { SquadMediaPlugin.emit("pause", -1); }
            @Override public void onSkipToNext() { SquadMediaPlugin.emit("next", -1); }
            @Override public void onSkipToPrevious() { SquadMediaPlugin.emit("prev", -1); }
            @Override public void onSeekTo(long pos) { SquadMediaPlugin.emit("seek", pos / 1000.0); }
            @Override public void onStop() { SquadMediaPlugin.emit("pause", -1); }
        }, main);
        session.setActive(true);
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        wake = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "SquadSound:playback");
        wake.setReferenceCounted(false);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String a = intent != null ? intent.getAction() : null;
        // startForeground — сразу, иначе система закроет приложение
        refresh();
        if (a != null && !ACTION_START.equals(a) && !SquadMediaPlugin.alive()) {
            // нажали в виджете, а плеера уже нет: открываем приложение
            try {
                Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
                if (open != null) startActivity(open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            } catch (Throwable ignored) {}
            shutdown();
            return START_NOT_STICKY;
        }
        if (ACTION_TOGGLE.equals(a)) SquadMediaPlugin.emit(playing ? "pause" : "play", -1);
        else if (ACTION_NEXT.equals(a)) SquadMediaPlugin.emit("next", -1);
        else if (ACTION_PREV.equals(a)) SquadMediaPlugin.emit("prev", -1);
        else if (ACTION_CLOSE.equals(a)) {
            SquadMediaPlugin.emit("pause", -1);
            shutdown();
        }
        return START_NOT_STICKY;
    }

    void shutdown() {
        if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE);
        else stopForeground(true);
        stopSelf();
    }

    // Обновить сессию и уведомление по текущему состоянию
    void refresh() {
        try {
            MediaMetadata.Builder md = new MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_TITLE, title)
                .putString(MediaMetadata.METADATA_KEY_ARTIST, artist)
                .putLong(MediaMetadata.METADATA_KEY_DURATION, durationMs);
            if (art != null) md.putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, art);
            session.setMetadata(md.build());
            session.setPlaybackState(new PlaybackState.Builder()
                .setActions(PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_PLAY_PAUSE
                    | PlaybackState.ACTION_SKIP_TO_NEXT | PlaybackState.ACTION_SKIP_TO_PREVIOUS
                    | PlaybackState.ACTION_SEEK_TO | PlaybackState.ACTION_STOP)
                .setState(playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED, positionMs,
                    playing ? speed : 0f, SystemClock.elapsedRealtime())
                .build());
            Notification n = build();
            if (Build.VERSION.SDK_INT >= 29) startForeground(ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            else startForeground(ID, n);
            if (playing) wake.acquire(6 * 60 * 60 * 1000L); else if (wake.isHeld()) wake.release();
            SquadWidget.push(this);
        } catch (Throwable e) {
            android.util.Log.e("SquadMedia", "refresh", e);
        }
    }

    private PendingIntent action(String a, int code) {
        Intent i = new Intent(this, SquadMediaService.class).setAction(a);
        return PendingIntent.getService(this, code, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    @SuppressWarnings("deprecation")
    private Notification build() {
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
        Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (open != null) {
            open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
            b.setContentIntent(PendingIntent.getActivity(this, 10, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        }
        b.setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle(title)
            .setContentText(artist)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setOngoing(playing)
            .addAction(new Notification.Action.Builder(android.R.drawable.ic_media_previous, "Назад", action(ACTION_PREV, 1)).build())
            .addAction(new Notification.Action.Builder(playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play,
                playing ? "Пауза" : "Играть", action(ACTION_TOGGLE, 2)).build())
            .addAction(new Notification.Action.Builder(android.R.drawable.ic_media_next, "Вперёд", action(ACTION_NEXT, 3)).build())
            .addAction(new Notification.Action.Builder(android.R.drawable.ic_menu_close_clear_cancel, "Закрыть", action(ACTION_CLOSE, 4)).build())
            .setStyle(new Notification.MediaStyle().setMediaSession(session.getSessionToken()).setShowActionsInCompactView(0, 1, 2));
        if (art != null) b.setLargeIcon(art);
        return b.build();
    }

    // Приложение смахнули из недавних — WebView со звуком уже нет, убираем уведомление
    @Override
    public void onTaskRemoved(Intent rootIntent) {
        shutdown();
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        instance = null;
        SquadWidget.push(this);
        try { if (wake != null && wake.isHeld()) wake.release(); } catch (Throwable ignored) {}
        try { session.setActive(false); session.release(); } catch (Throwable ignored) {}
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}
