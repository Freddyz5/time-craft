package app.timecraft;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.webkit.CookieManager;
import com.getcapacitor.CapConfig;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.function.Consumer;

/**
 * Tells the api about the end alarm stopped on this phone, so the family's
 * other devices go quiet too: POST /api/sessions/:id/stop-alarm, or /stop
 * when a parent ends the session from the alarm (past its end the api quiets
 * them as well). It signs in with the web view's own session cookie; the web
 * does the same from a browser.
 */
final class StopSync {

    private static final int TIMEOUT_MS = 10_000;
    private static final Handler MAIN = new Handler(Looper.getMainLooper());

    private StopSync() {}

    // Call them on the main thread (the cookie store wants it); the requests
    // go on their own thread, and `then` runs on the main thread when they
    // are over, either way.
    static void send(Context context, String tag, Runnable then) {
        request(context, tag, false, (ended) -> then.run());
    }

    // `then` gets whether the session ended. If it did not, the alarm still
    // stops everywhere.
    static void endSession(Context context, String tag, Consumer<Boolean> then) {
        request(context, tag, true, then);
    }

    static boolean isSession(String tag) {
        return sessionIdOf(tag) != null;
    }

    private static void request(Context context, String tag, boolean end, Consumer<Boolean> then) {
        String sessionId = sessionIdOf(tag);
        String server = CapConfig.loadDefault(context).getServerUrl();
        if (sessionId == null || server == null) {
            MAIN.post(() -> then.accept(false));
            return;
        }
        String cookie = CookieManager.getInstance().getCookie(server);
        String session = server + "/api/sessions/" + sessionId;
        new Thread(() -> {
            boolean ended = false;
            try {
                ended = end && post(session + "/stop", server, cookie) / 100 == 2;
                if (!ended) {
                    post(session + "/stop-alarm", server, cookie);
                }
            } catch (Exception ignored) {
                // Offline or signed out: the other devices stop by themselves.
            } finally {
                boolean result = ended;
                MAIN.post(() -> then.accept(result));
            }
        }).start();
    }

    private static String sessionIdOf(String tag) {
        return tag != null && tag.startsWith("session-") ? tag.substring("session-".length()) : null;
    }

    private static int post(String url, String server, String cookie) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
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
            return connection.getResponseCode();
        } finally {
            connection.disconnect();
        }
    }
}
