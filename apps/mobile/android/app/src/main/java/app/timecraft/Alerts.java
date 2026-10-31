package app.timecraft;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import java.util.Map;

/**
 * The app's notifications, built from the api's data-only FCM messages with the
 * sounds this phone chose in the web (Avisos or Cuentas › Sonido). The end of a
 * session rings like an alarm clock: on the alarm stream, over the lock screen
 * and, if the phone chose so, repeating until someone stops it.
 */
final class Alerts {

    static final String EXTRA_URL = "timecraft_url";
    static final String EXTRA_TAG = "timecraft_tag";
    static final String EXTRA_TITLE = "timecraft_title";
    static final String EXTRA_BODY = "timecraft_body";
    static final int NOTIFICATION_ID = 1;

    static final String[] KINDS = { "warning", "end", "ready", "answer", "notice" };

    private static final String PREFS = "timecraft.alerts";
    private static final String CHANNEL_PREFIX = "tc-";
    // An end alarm nobody stops goes quiet after this long.
    private static final long END_TIMEOUT_MS = 10 * 60 * 1000;

    private Alerts() {}

    // The api's notification kind → the web's alarm kind (lib/alarm.ts).
    static String alarmKindOf(String kind) {
        if (kind == null) {
            return "notice";
        }
        switch (kind) {
            case "session_ready":
                return "ready";
            case "session_warning":
                return "warning";
            case "session_ended":
                return "end";
            case "request_approved":
            case "report_approved":
                return "answer";
            default:
                return "notice";
        }
    }

    // The defaults of the web's DEFAULT_SOUND_SETTINGS (lib/sounds.ts).
    private static String defaultSound(String alarmKind) {
        switch (alarmKind) {
            case "warning":
                return "chime";
            case "end":
                return "alarm";
            case "ready":
                return "rise";
            case "answer":
                return "bright";
            default:
                return "doorbell";
        }
    }

    private static String channelName(String alarmKind) {
        switch (alarmKind) {
            case "warning":
                return "Aviso antes del final";
            case "end":
                return "Fin de la sesión";
            case "ready":
                return "Ya puede empezar";
            case "answer":
                return "Respuestas a pedidos";
            default:
                return "Pedidos y avisos";
        }
    }

    // Alarms that must be heard: on the alarm stream, which Do Not Disturb
    // lets through by default.
    private static boolean isAlarm(String alarmKind) {
        return alarmKind.equals("warning") || alarmKind.equals("end") || alarmKind.equals("ready");
    }

    private static long[] vibration(String alarmKind) {
        if (alarmKind.equals("end")) {
            return new long[] { 0, 600, 300, 600, 300, 600 };
        }
        if (isAlarm(alarmKind)) {
            return new long[] { 0, 300, 150, 300 };
        }
        return new long[] { 0, 200 };
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static String soundFor(Context context, String alarmKind) {
        return prefs(context).getString("sound." + alarmKind, defaultSound(alarmKind));
    }

    static boolean repeatEnd(Context context) {
        return prefs(context).getBoolean("repeatEnd", true);
    }

    // Saves the web's sound settings and remakes the channels that changed.
    static void saveSettings(Context context, Map<String, String> sounds, boolean repeatEnd) {
        SharedPreferences.Editor editor = prefs(context).edit();
        for (String kind : KINDS) {
            String sound = sounds.get(kind);
            if (sound != null && (sound.equals("none") || soundResource(context, sound) != 0)) {
                editor.putString("sound." + kind, sound);
            }
        }
        editor.putBoolean("repeatEnd", repeatEnd);
        editor.apply();
        for (String kind : KINDS) {
            ensureChannel(context, kind, soundFor(context, kind));
        }
    }

    private static int soundResource(Context context, String sound) {
        return context.getResources().getIdentifier("tc_" + sound, "raw", context.getPackageName());
    }

    // A channel's sound cannot change once created, so each sound has its
    // own channel; the kind's channels for other sounds are deleted.
    static String ensureChannel(Context context, String alarmKind, String sound) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        String id = CHANNEL_PREFIX + alarmKind + "-" + sound;
        if (manager.getNotificationChannel(id) == null) {
            NotificationChannel channel = new NotificationChannel(id, channelName(alarmKind), NotificationManager.IMPORTANCE_HIGH);
            channel.enableVibration(true);
            channel.setVibrationPattern(vibration(alarmKind));
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            int resource = sound.equals("none") ? 0 : soundResource(context, sound);
            if (resource == 0) {
                channel.setSound(null, null);
            } else {
                Uri uri = Uri.parse("android.resource://" + context.getPackageName() + "/" + resource);
                AudioAttributes attributes = new AudioAttributes.Builder()
                    .setUsage(isAlarm(alarmKind) ? AudioAttributes.USAGE_ALARM : AudioAttributes.USAGE_NOTIFICATION_EVENT)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build();
                channel.setSound(uri, attributes);
            }
            manager.createNotificationChannel(channel);
        }
        for (NotificationChannel other : manager.getNotificationChannels()) {
            String otherId = other.getId();
            if (otherId.startsWith(CHANNEL_PREFIX + alarmKind + "-") && !otherId.equals(id)) {
                manager.deleteNotificationChannel(otherId);
            }
        }
        return id;
    }

    static boolean canUseFullScreen(Context context) {
        if (Build.VERSION.SDK_INT < 34) {
            return true;
        }
        return context.getSystemService(NotificationManager.class).canUseFullScreenIntent();
    }

    private static int requestCode(String tag, int salt) {
        return (tag + "#" + salt).hashCode();
    }

    static Intent openIntent(Context context, String url, String tag) {
        return new Intent(context, MainActivity.class)
            .putExtra(EXTRA_URL, url)
            .putExtra(EXTRA_TAG, tag)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
    }

    // Shows one api message. Data keys: kind, title, body, url, tag.
    static void show(Context context, Map<String, String> data) {
        String alarmKind = alarmKindOf(data.get("kind"));
        String title = valueOr(data.get("title"), "Time Craft");
        String body = valueOr(data.get("body"), "");
        String url = valueOr(data.get("url"), "/");
        String tag = valueOr(data.get("tag"), "timecraft");
        String channel = ensureChannel(context, alarmKind, soundFor(context, alarmKind));
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, channel)
            .setSmallIcon(R.drawable.ic_stat_timecraft)
            .setColor(0xFFF2B705)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setContentIntent(PendingIntent.getActivity(context, requestCode(tag, 0), openIntent(context, url, tag), flags));

        boolean end = alarmKind.equals("end");
        if (end) {
            Intent stop = new Intent(context, StopAlarmReceiver.class).putExtra(EXTRA_TAG, tag);
            builder
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setOngoing(true)
                .setTimeoutAfter(END_TIMEOUT_MS)
                .addAction(0, "Detener", PendingIntent.getBroadcast(context, requestCode(tag, 1), stop, flags));
            if (canUseFullScreen(context)) {
                Intent alarm = new Intent(context, AlarmActivity.class)
                    .putExtra(EXTRA_TAG, tag)
                    .putExtra(EXTRA_URL, url)
                    .putExtra(EXTRA_TITLE, title)
                    .putExtra(EXTRA_BODY, body)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_NO_USER_ACTION);
                builder.setFullScreenIntent(PendingIntent.getActivity(context, requestCode(tag, 2), alarm, flags), true);
            }
        } else {
            builder.setCategory(isAlarm(alarmKind) ? NotificationCompat.CATEGORY_REMINDER : NotificationCompat.CATEGORY_MESSAGE);
        }

        Notification notification = builder.build();
        if (end && repeatEnd(context)) {
            notification.flags |= Notification.FLAG_INSISTENT;
        }
        context.getSystemService(NotificationManager.class).notify(tag, NOTIFICATION_ID, notification);
    }

    static void stop(Context context, String tag) {
        if (tag != null) {
            context.getSystemService(NotificationManager.class).cancel(tag, NOTIFICATION_ID);
        }
    }

    private static String valueOr(String value, String fallback) {
        return value == null || value.isEmpty() ? fallback : value;
    }
}
