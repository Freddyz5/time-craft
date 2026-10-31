package app.timecraft;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** The "Detener" button of the end alarm: silences it here and on the family's other devices. */
public class StopAlarmReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        // The api call may outlive onReceive: keep the receiver alive for it.
        PendingResult pending = goAsync();
        Alerts.stopByUser(context, intent.getStringExtra(Alerts.EXTRA_TAG), pending::finish);
    }
}
