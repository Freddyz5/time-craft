package app.timecraft;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * The end alarm's button in the notification: "Terminar sesión" for the
 * parents, "Silenciar" for the child (Alerts.stopFromAlarm). Either way it
 * goes quiet here and on the family's other devices.
 */
public class StopAlarmReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        // The api call may outlive onReceive: keep the receiver alive for it.
        PendingResult pending = goAsync();
        Alerts.stopFromAlarm(context, intent.getStringExtra(Alerts.EXTRA_TAG), intent.getStringExtra(Alerts.EXTRA_URL), pending::finish);
    }
}
