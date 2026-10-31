package app.timecraft;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

/**
 * Capacitor's activity, which shows the deployed web. A tapped notification
 * opens the page it points to (the push's url, a path of the web).
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(TimeCraftPlugin.class);
        super.onCreate(savedInstanceState);
        openFromNotification(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        openFromNotification(intent);
    }

    private void openFromNotification(Intent intent) {
        if (intent == null || bridge == null) {
            return;
        }
        String path = intent.getStringExtra(Alerts.EXTRA_URL);
        intent.removeExtra(Alerts.EXTRA_URL);
        if (path == null || !path.startsWith("/") || path.startsWith("//")) {
            return;
        }
        String target = bridge.getServerUrl() + path;
        bridge.getWebView().post(() -> bridge.getWebView().loadUrl(target));
    }
}
