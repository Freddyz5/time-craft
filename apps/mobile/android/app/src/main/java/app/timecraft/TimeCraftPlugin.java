package app.timecraft;

import android.Manifest;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;
import java.util.HashMap;
import java.util.Map;

/**
 * The app's own bridge to the web (lib/native.ts): push token, notification
 * permission, the sounds the web chose, and the phone settings that keep
 * alarms from being silenced.
 */
@CapacitorPlugin(
    name = "TimeCraft",
    permissions = { @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = TimeCraftPlugin.NOTIFICATIONS) }
)
public class TimeCraftPlugin extends Plugin {

    static final String NOTIFICATIONS = "notifications";

    // The plugin of the open app, if any: the messaging service tells it
    // about pushes so the web refreshes at once.
    private static volatile TimeCraftPlugin instance;

    @Override
    public void load() {
        instance = this;
    }

    @Override
    protected void handleOnDestroy() {
        if (instance == this) {
            instance = null;
        }
    }

    static void dispatchPush(Map<String, String> data) {
        TimeCraftPlugin plugin = instance;
        if (plugin == null) {
            return;
        }
        JSObject event = new JSObject();
        for (Map.Entry<String, String> entry : data.entrySet()) {
            event.put(entry.getKey(), entry.getValue());
        }
        plugin.notifyListeners("push", event);
    }

    static void dispatchToken(String token) {
        TimeCraftPlugin plugin = instance;
        if (plugin == null) {
            return;
        }
        JSObject event = new JSObject();
        event.put("token", token);
        plugin.notifyListeners("token", event);
    }

    private boolean firebaseReady() {
        return !FirebaseApp.getApps(getContext()).isEmpty();
    }

    private String notificationState() {
        Context context = getContext();
        boolean enabled = NotificationManagerCompat.from(context).areNotificationsEnabled();
        if (Build.VERSION.SDK_INT < 33) {
            return enabled ? "granted" : "denied";
        }
        PermissionState state = getPermissionState(NOTIFICATIONS);
        if (state == PermissionState.GRANTED) {
            return enabled ? "granted" : "denied";
        }
        return state == PermissionState.DENIED ? "denied" : "prompt";
    }

    private JSObject status() {
        Context context = getContext();
        PowerManager power = context.getSystemService(PowerManager.class);
        JSObject status = new JSObject();
        status.put("firebase", firebaseReady());
        status.put("notifications", notificationState());
        status.put("batteryUnrestricted", power.isIgnoringBatteryOptimizations(context.getPackageName()));
        status.put("fullScreen", Alerts.canUseFullScreen(context));
        status.put("device", Build.MANUFACTURER + " " + Build.MODEL);
        return status;
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        call.resolve(status());
    }

    @PluginMethod
    public void requestNotifications(PluginCall call) {
        if (Build.VERSION.SDK_INT < 33 || getPermissionState(NOTIFICATIONS) == PermissionState.GRANTED) {
            call.resolve(status());
            return;
        }
        requestPermissionForAlias(NOTIFICATIONS, call, "notificationsResult");
    }

    @PermissionCallback
    private void notificationsResult(PluginCall call) {
        call.resolve(status());
    }

    @PluginMethod
    public void getToken(PluginCall call) {
        if (!firebaseReady()) {
            call.reject("Firebase is not configured in this build", "firebase_missing");
            return;
        }
        FirebaseMessaging.getInstance()
            .getToken()
            .addOnCompleteListener((task) -> {
                if (task.isSuccessful()) {
                    JSObject result = new JSObject();
                    result.put("token", task.getResult());
                    call.resolve(result);
                } else {
                    call.reject("Could not get the push token", "token_failed", task.getException());
                }
            });
    }

    @PluginMethod
    public void deleteToken(PluginCall call) {
        if (!firebaseReady()) {
            call.resolve();
            return;
        }
        FirebaseMessaging.getInstance().deleteToken().addOnCompleteListener((task) -> call.resolve());
    }

    // The web's sound settings (lib/sounds.ts): { sounds: { warning, end,
    // ready, answer, notice }, repeatEnd }.
    @PluginMethod
    public void setSoundSettings(PluginCall call) {
        JSObject sounds = call.getObject("sounds", new JSObject());
        Map<String, String> chosen = new HashMap<>();
        for (String kind : Alerts.KINDS) {
            String sound = sounds.getString(kind);
            if (sound != null) {
                chosen.put(kind, sound);
            }
        }
        Boolean repeatEnd = call.getBoolean("repeatEnd", true);
        Alerts.saveSettings(getContext(), chosen, repeatEnd == null || repeatEnd);
        call.resolve();
    }

    // which: "notifications" | "battery" | "fullScreen".
    @PluginMethod
    public void openSettings(PluginCall call) {
        Context context = getContext();
        String which = call.getString("which", "notifications");
        Uri app = Uri.parse("package:" + context.getPackageName());
        Intent intent;
        if ("battery".equals(which)) {
            intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, app);
        } else if ("fullScreen".equals(which) && Build.VERSION.SDK_INT >= 34) {
            intent = new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, app);
        } else {
            intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.getPackageName());
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            context.startActivity(intent);
        } catch (ActivityNotFoundException error) {
            context.startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, app).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        }
        call.resolve();
    }

    // Shows a sample of one alarm kind as the api's push would, to check the
    // sound and the lock screen without waiting for a session.
    @PluginMethod
    public void testAlert(PluginCall call) {
        String kind = call.getString("kind", "end");
        Map<String, String> data = new HashMap<>();
        data.put("kind", apiKindFor(kind));
        data.put("title", call.getString("title", "Time Craft"));
        data.put("body", call.getString("body", ""));
        data.put("url", call.getString("url", "/"));
        data.put("tag", "test-" + kind);
        Alerts.show(getContext(), data);
        call.resolve();
    }

    private static String apiKindFor(String alarmKind) {
        switch (alarmKind) {
            case "warning":
                return "session_warning";
            case "end":
                return "session_ended";
            case "ready":
                return "session_ready";
            case "answer":
                return "request_approved";
            default:
                return "request_created";
        }
    }
}
