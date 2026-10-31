package app.timecraft;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** The "Detener" button of the end alarm: silences it by closing the notification. */
public class StopAlarmReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        Alerts.stop(context, intent.getStringExtra(Alerts.EXTRA_TAG));
    }
}
