package app.timecraft;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.service.notification.StatusBarNotification;
import androidx.core.app.NotificationCompat;
import java.util.HashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The app's notifications, built from the api's data-only FCM messages (or the
 * web's own timer, TimeCraftPlugin.ring) with the sounds this phone chose in
 * the web (Avisos or Cuentas › Sonido). The end of a session rings like an
 * alarm clock: on the alarm stream, over the lock screen and, if the phone
 * chose so, repeating until someone stops it, here or on another device of
 * the family. When the phone talks, or the end repeats, AlarmService rings it.
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
    // The web's timer and the push that follows it ring once, whichever comes
    // first (as ringOnce in the web's lib/alarm.ts).
    private static final long SAME_ALARM_MS = 3 * 60 * 1000;
    private static final Map<String, Long> recent = new HashMap<>();
    // Tells the alarm screen that its alarm is over.
    static final String ACTION_ALARM_CLOSED = "app.timecraft.ALARM_CLOSED";

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

    static long[] vibration(String alarmKind) {
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

    // After the sound, the phone's voice reads the alarm (Speaker).
    static boolean speaks(Context context) {
        return prefs(context).getBoolean("speak", false);
    }

    // The web's volume for the voice (LOUDNESS in lib/voice.ts).
    static float voiceVolume(Context context) {
        switch (prefs(context).getString("volume", "medium")) {
            case "low":
                return 0.5f;
            case "high":
                return 1f;
            default:
                return 0.8f;
        }
    }

    // Saves the web's sound settings and remakes the channels that changed.
    static void saveSettings(Context context, Map<String, String> sounds, boolean repeatEnd, boolean speak, String volume) {
        SharedPreferences.Editor editor = prefs(context).edit();
        for (String kind : KINDS) {
            String sound = sounds.get(kind);
            if (sound != null && (sound.equals("none") || soundResource(context, sound) != 0)) {
                editor.putString("sound." + kind, sound);
            }
        }
        editor.putBoolean("repeatEnd", repeatEnd);
        editor.putBoolean("speak", speak);
        if (volume != null) {
            editor.putString("volume", volume);
        }
        editor.apply();
        for (String kind : KINDS) {
            ensureChannel(context, kind, soundFor(context, kind));
        }
    }

    private static int soundResource(Context context, String sound) {
        return context.getResources().getIdentifier("tc_" + sound, "raw", context.getPackageName());
    }

    private static int soundResourceFor(Context context, String alarmKind) {
        String sound = soundFor(context, alarmKind);
        return sound.equals("none") ? 0 : soundResource(context, sound);
    }

    private static AudioAttributes soundAttributes(String alarmKind) {
        return new AudioAttributes.Builder()
            .setUsage(isAlarm(alarmKind) ? AudioAttributes.USAGE_ALARM : AudioAttributes.USAGE_NOTIFICATION_EVENT)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();
    }

    private static Uri soundUri(Context context, int resource) {
        return Uri.parse("android.resource://" + context.getPackageName() + "/" + resource);
    }

    private static final Map<Integer, Integer> durations = new HashMap<>();

    // How long the kind's sound lasts, to speak after it.
    static synchronized long soundMillis(Context context, String alarmKind) {
        int resource = soundResourceFor(context, alarmKind);
        if (resource == 0) {
            return 0;
        }
        Integer known = durations.get(resource);
        if (known == null) {
            MediaPlayer probe = MediaPlayer.create(context, resource);
            known = probe == null ? 0 : probe.getDuration();
            if (probe != null) {
                probe.release();
            }
            durations.put(resource, known);
        }
        return known;
    }

    // The kind's sound, ready to start, on the same stream as its channel;
    // null for "none".
    static MediaPlayer player(Context context, String alarmKind) {
        int resource = soundResourceFor(context, alarmKind);
        if (resource == 0) {
            return null;
        }
        MediaPlayer player = new MediaPlayer();
        try {
            player.setAudioAttributes(soundAttributes(alarmKind));
            player.setDataSource(context, soundUri(context, resource));
            player.prepare();
            return player;
        } catch (Exception error) {
            player.release();
            return null;
        }
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
                channel.setSound(soundUri(context, resource), soundAttributes(alarmKind));
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

    static String tagOf(Map<String, String> data) {
        return valueOr(data.get("tag"), "timecraft");
    }

    // Shows one api message. Data keys: kind, title, body, url, tag.
    // `alarm_stopped` (another device stopped the end) silences it instead.
    static void show(Context context, Map<String, String> data) {
        String tag = tagOf(data);
        if ("alarm_stopped".equals(data.get("kind"))) {
            stop(context, tag);
            return;
        }
        String alarmKind = alarmKindOf(data.get("kind"));
        if (rangLately(tag, alarmKind)) {
            return;
        }
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        // A newer message about the same thing replaces the older one: the
        // end replaces the warning; the automatic close, the end.
        manager.cancel(tag, NOTIFICATION_ID);
        boolean repeat = alarmKind.equals("end") && repeatEnd(context);
        if ((repeat || speaks(context)) && AlarmService.ring(context, data)) {
            return;
        }
        AlarmService.stop(tag);
        Notification notification = build(context, data, false);
        if (repeat) {
            // AlarmService could not start: Android repeats the sound itself.
            notification.flags |= Notification.FLAG_INSISTENT;
        }
        manager.notify(tag, NOTIFICATION_ID, notification);
    }

    private static synchronized boolean rangLately(String tag, String alarmKind) {
        if (tag.startsWith("test-")) {
            return false;
        }
        String key = tag + ":" + alarmKind;
        long now = System.currentTimeMillis();
        Long last = recent.get(key);
        if (last != null && now - last < SAME_ALARM_MS) {
            return true;
        }
        recent.put(key, now);
        return false;
    }

    // The notification of one message; `quiet` for one that already rang
    // (AlarmService leaves it in the shade when it is done).
    static Notification build(Context context, Map<String, String> data, boolean quiet) {
        String alarmKind = alarmKindOf(data.get("kind"));
        String title = valueOr(data.get("title"), "Time Craft");
        String body = valueOr(data.get("body"), "");
        String url = valueOr(data.get("url"), "/");
        String tag = tagOf(data);
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
            .setSilent(quiet)
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

        return builder.build();
    }

    // Silences the alarm with that tag on this phone: its sound, its
    // notification and its screen.
    static void stop(Context context, String tag) {
        if (tag == null) {
            return;
        }
        AlarmService.stop(tag);
        context.getSystemService(NotificationManager.class).cancel(tag, NOTIFICATION_ID);
        closeAlarmScreen(context, tag);
    }

    // Someone on this phone noticed the alarm ("Detener", the alarm screen, a
    // tap in the app, or opening it from the notification): quiet here and,
    // if it was the end, on the family's other devices. Main thread; `then`
    // runs when the api heard it (or could not).
    static void stopByUser(Context context, String tag, Runnable then) {
        boolean end = AlarmService.isRingingEnd(tag) || hasEndNotification(context, tag);
        stop(context, tag);
        if (end) {
            StopSync.send(context, tag, then);
        } else {
            then.run();
        }
    }

    private static boolean hasEndNotification(Context context, String tag) {
        if (tag == null) {
            return false;
        }
        for (StatusBarNotification shown : context.getSystemService(NotificationManager.class).getActiveNotifications()) {
            if (tag.equals(shown.getTag()) && NotificationCompat.CATEGORY_ALARM.equals(shown.getNotification().category)) {
                return true;
            }
        }
        return false;
    }

    static void closeAlarmScreen(Context context, String tag) {
        context.sendBroadcast(new Intent(ACTION_ALARM_CLOSED).setPackage(context.getPackageName()).putExtra(EXTRA_TAG, tag));
    }

    private static final Pattern UNITS = Pattern.compile("(\\d+)\\s(min|h)\\b");

    // What the voice says: the title and the body, with "5 min" read as
    // "5 minutos" (spokenText in the web's lib/voice.ts).
    static String spokenText(String title, String body) {
        String start = valueOr(title, "");
        String text = body == null || body.isEmpty() ? start : start + (start.matches(".*[.!?:…]$") ? "" : ".") + " " + body;
        Matcher units = UNITS.matcher(text);
        StringBuffer out = new StringBuffer();
        while (units.find()) {
            String amount = units.group(1);
            boolean one = amount.equals("1");
            String unit = units.group(2).equals("min") ? (one ? "minuto" : "minutos") : (one ? "hora" : "horas");
            units.appendReplacement(out, amount + " " + unit);
        }
        units.appendTail(out);
        return out.toString();
    }

    private static String valueOr(String value, String fallback) {
        return value == null || value.isEmpty() ? fallback : value;
    }
}
