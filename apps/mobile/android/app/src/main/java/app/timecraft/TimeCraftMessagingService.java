package app.timecraft;

import androidx.annotation.NonNull;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

/**
 * Receives the api's FCM messages even with the app closed. They are data
 * only, so this service builds every notification (Alerts) and, if the app
 * is open, tells the web to refresh at once.
 */
public class TimeCraftMessagingService extends FirebaseMessagingService {

    @Override
    public void onMessageReceived(@NonNull RemoteMessage message) {
        Alerts.show(this, message.getData());
        TimeCraftPlugin.dispatchPush(message.getData());
    }

    @Override
    public void onNewToken(@NonNull String token) {
        TimeCraftPlugin.dispatchToken(token);
    }
}
