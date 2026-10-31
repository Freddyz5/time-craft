package app.timecraft;

import android.content.Context;
import android.webkit.CookieManager;
import com.getcapacitor.CapConfig;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Tells the api that this phone stopped the end alarm, so the family's other
 * devices go quiet too (POST /api/sessions/:id/stop-alarm). It signs in with
 * the web view's own session cookie; the web does the same from a browser.
 */
final class StopSync {

    private static final int TIMEOUT_MS = 10_000;

    private StopSync() {}

    // Call it on the main thread (the cookie store wants it); the request
    // itself goes on its own thread. `then` runs when it is over, either way.
    static void send(Context context, String tag, Runnable then) {
        String sessionId = sessionIdOf(tag);
        String server = CapConfig.loadDefault(context).getServerUrl();
        if (sessionId == null || server == null) {
            then.run();
            return;
        }
        String cookie = CookieManager.getInstance().getCookie(server);
        new Thread(() -> {
            try {
                post(server, sessionId, cookie);
            } catch (Exception ignored) {
                // Offline or signed out: the other devices stop by themselves.
            } finally {
                then.run();
            }
        }).start();
    }

    private static String sessionIdOf(String tag) {
        return tag != null && tag.startsWith("session-") ? tag.substring("session-".length()) : null;
    }

    private static void post(String server, String sessionId, String cookie) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(server + "/api/sessions/" + sessionId + "/stop-alarm").openConnection();
        try {
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(TIMEOUT_MS);
            connection.setReadTimeout(TIMEOUT_MS);
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setRequestProperty("Origin", server);
            if (cookie != null) {
                connection.setRequestProperty("Cookie", cookie);
            }
            try (OutputStream body = connection.getOutputStream()) {
                body.write("{}".getBytes(StandardCharsets.UTF_8));
            }
            connection.getResponseCode();
        } finally {
            connection.disconnect();
        }
    }
}
