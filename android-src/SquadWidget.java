package com.squad.sound;

// Виджет на рабочий стол. Пока играет SquadMediaService — кнопки управляют плеером,
// иначе любое нажатие открывает приложение (без WebView управлять нечем).

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.widget.RemoteViews;

public class SquadWidget extends AppWidgetProvider {

    @Override
    public void onUpdate(Context ctx, AppWidgetManager m, int[] ids) {
        push(ctx);
    }

    static void push(Context ctx) {
        try {
            AppWidgetManager m = AppWidgetManager.getInstance(ctx);
            int[] ids = m.getAppWidgetIds(new ComponentName(ctx, SquadWidget.class));
            if (ids == null || ids.length == 0) return;
            boolean live = SquadMediaService.instance != null;
            RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.squad_widget);
            PendingIntent open = openApp(ctx);
            v.setOnClickPendingIntent(R.id.w_root, open);
            v.setOnClickPendingIntent(R.id.w_art, open);
            if (live) {
                v.setTextViewText(R.id.w_title, SquadMediaService.title);
                v.setTextViewText(R.id.w_artist, SquadMediaService.artist);
                if (SquadMediaService.art != null) v.setImageViewBitmap(R.id.w_art, SquadMediaService.art);
                else v.setImageViewResource(R.id.w_art, R.mipmap.ic_launcher);
                v.setImageViewResource(R.id.w_play, SquadMediaService.playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play);
                v.setOnClickPendingIntent(R.id.w_prev, action(ctx, SquadMediaService.ACTION_PREV, 21));
                v.setOnClickPendingIntent(R.id.w_play, action(ctx, SquadMediaService.ACTION_TOGGLE, 22));
                v.setOnClickPendingIntent(R.id.w_next, action(ctx, SquadMediaService.ACTION_NEXT, 23));
            } else {
                v.setTextViewText(R.id.w_title, "SQUAD SOUND");
                v.setTextViewText(R.id.w_artist, "Нажмите, чтобы открыть");
                v.setImageViewResource(R.id.w_art, R.mipmap.ic_launcher);
                v.setImageViewResource(R.id.w_play, android.R.drawable.ic_media_play);
                v.setOnClickPendingIntent(R.id.w_prev, open);
                v.setOnClickPendingIntent(R.id.w_play, open);
                v.setOnClickPendingIntent(R.id.w_next, open);
            }
            m.updateAppWidget(ids, v);
        } catch (Throwable e) {
            android.util.Log.w("SquadWidget", "push", e);
        }
    }

    private static PendingIntent openApp(Context ctx) {
        Intent i = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
        if (i == null) i = new Intent(ctx, MainActivity.class);
        i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        return PendingIntent.getActivity(ctx, 20, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private static PendingIntent action(Context ctx, String a, int code) {
        Intent i = new Intent(ctx, SquadMediaService.class).setAction(a);
        int f = PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT;
        // процесс могли выгрузить — тогда служба стартует заново и откроет приложение
        return Build.VERSION.SDK_INT >= 26 ? PendingIntent.getForegroundService(ctx, code, i, f) : PendingIntent.getService(ctx, code, i, f);
    }
}
