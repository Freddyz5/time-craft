package app.timecraft;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.MediaPlayer;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import androidx.core.content.ContextCompat;
import java.util.HashMap;
import java.util.Map;

/**
 * Rings one alarm the way the web's tab does (lib/alarm.ts): the sound, then,
 * if the phone talks, the words, and for the end again and again, every 5
 * seconds, until someone stops it or 5 minutes pass. A foreground service, so
 * it keeps going with the screen off and the app closed; its notification is
 * the alarm's own. The first sound is the notification channel's.
 */
public class AlarmService extends Service {

    private static final String ACTION_RING = "app.timecraft.RING";
    private static final String EXTRA_DATA = "timecraft_data";
    private static final int FOREGROUND_ID = 2;

    private static final long REPEAT_EVERY_MS = 5_000;
    private static final long REPEAT_GAP_MS = 1_500;
    private static final long REPEAT_FOR_MS = 5 * 60_000;

    private static final Handler MAIN = new Handler(Looper.getMainLooper());
    // The running service, on the main thread.
    private static AlarmService running;

    private Map<String, String> data;
    private String tag;
    private String alarmKind;
    // Which ringing is current: stop() or a newer alarm drop the older's
    // pending steps.
    private int ticket = 0;
    private long until;
    private MediaPlayer player;

    // Starts ringing; false if Android does not let it start (then the
    // caller shows a plain notification).
    static boolean ring(Context context, Map<String, String> data) {
        Bundle extras = new Bundle();
        for (Map.Entry<String, String> entry : data.entrySet()) {
            extras.putString(entry.getKey(), entry.getValue());
        }
        Intent intent = new Intent(context, AlarmService.class).setAction(ACTION_RING).putExtra(EXTRA_DATA, extras);
        try {
            ContextCompat.startForegroundService(context, intent);
            return true;
        } catch (IllegalStateException | SecurityException notAllowed) {
            return false;
        }
    }

    static boolean isRingingEnd(String tag) {
        return running != null && tag != null && tag.equals(running.tag) && "end".equals(running.alarmKind);
    }

    // Stops the alarm with that tag (any, if null). Any thread.
    static void stop(String tag) {
        MAIN.post(() -> {
            if (running != null && (tag == null || tag.equals(running.tag))) {
                running.finish(false);
            }
        });
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        running = this;
        Bundle extras = intent == null ? null : intent.getBundleExtra(EXTRA_DATA);
        if (extras == null) {
            // Restarted by Android after being killed: nothing to ring.
            stopSelf();
            return START_NOT_STICKY;
        }
        Map<String, String> next = new HashMap<>();
        for (String key : extras.keySet()) {
            next.put(key, extras.getString(key));
        }
        start(next);
        return START_NOT_STICKY;
    }

    private void start(Map<String, String> next) {
        ticket += 1;
        int mine = ticket;
        releasePlayer();
        Speaker.stop();
        String previous = tag;
        data = next;
        tag = Alerts.tagOf(next);
        if (previous != null && !previous.equals(tag)) {
            Alerts.closeAlarmScreen(this, previous);
        }
        alarmKind = Alerts.alarmKindOf(next.get("kind"));
        until = System.currentTimeMillis() + REPEAT_FOR_MS;
        Notification notification = Alerts.build(this, next, false);
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(FOREGROUND_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(FOREGROUND_ID, notification);
        }
        boolean repeat = alarmKind.equals("end") && Alerts.repeatEnd(this);
        if (Alerts.speaks(this)) {
            // The voice engine starts while the first sound plays.
            Speaker.prepare(this);
        }
        long started = System.currentTimeMillis();
        // The channel plays the first sound with the notification.
        later(mine, Alerts.soundMillis(this, alarmKind), () ->
            say(mine, Alerts.spokenText(next.get("title"), next.get("body")), () -> {
                if (repeat) {
                    again(mine, started);
                } else {
                    finish(true);
                }
            })
        );
    }

    // The end once more: 5 seconds after the last one started, or a moment
    // after its voice, if it took longer. The voice only says the title.
    private void again(int mine, long lastStarted) {
        long wait = Math.max(REPEAT_GAP_MS, REPEAT_EVERY_MS - (System.currentTimeMillis() - lastStarted));
        later(mine, wait, () -> {
            if (System.currentTimeMillis() >= until) {
                finish(false);
                return;
            }
            long started = System.currentTimeMillis();
            vibrate();
            play(mine, () -> say(mine, Alerts.spokenText(data.get("title"), null), () -> again(mine, started)));
        });
    }

    private void say(int mine, String text, Runnable then) {
        if (mine != ticket) {
            return;
        }
        if (!Alerts.speaks(this)) {
            then.run();
            return;
        }
        Speaker.speak(this, text, Alerts.voiceVolume(this), () -> {
            if (mine == ticket) {
                then.run();
            }
        });
    }

    private void play(int mine, Runnable then) {
        releasePlayer();
        MediaPlayer next = Alerts.player(this, alarmKind);
        if (next == null) {
            then.run();
            return;
        }
        player = next;
        next.setOnCompletionListener((done) -> {
            releasePlayer();
            if (mine == ticket) {
                then.run();
            }
        });
        next.start();
    }

    private void vibrate() {
        Vibrator vibrator = getSystemService(Vibrator.class);
        if (vibrator != null && vibrator.hasVibrator()) {
            vibrator.vibrate(VibrationEffect.createWaveform(Alerts.vibration(alarmKind), -1));
        }
    }

    private void later(int mine, long delayMs, Runnable step) {
        MAIN.postDelayed(() -> {
            if (mine == ticket) {
                step.run();
            }
        }, delayMs);
    }

    // Over: the end disappears (someone stopped it, or nobody did for 5
    // minutes); anything else stays in the shade, quiet, to be read.
    private void finish(boolean keepNotification) {
        ticket += 1;
        releasePlayer();
        Speaker.stop();
        stopForeground(STOP_FOREGROUND_REMOVE);
        if (keepNotification && data != null) {
            getSystemService(NotificationManager.class).notify(tag, Alerts.NOTIFICATION_ID, Alerts.build(this, data, true));
        }
        Alerts.closeAlarmScreen(this, tag);
        tag = null;
        alarmKind = null;
        data = null;
        running = null;
        stopSelf();
    }

    private void releasePlayer() {
        if (player != null) {
            player.release();
            player = null;
        }
    }

    @Override
    public void onDestroy() {
        ticket += 1;
        releasePlayer();
        if (running == this) {
            running = null;
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
