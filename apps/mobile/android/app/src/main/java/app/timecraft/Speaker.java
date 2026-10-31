package app.timecraft;

import android.content.Context;
import android.media.AudioAttributes;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * The phone's voice (Android's text to speech), which reads the alarms when
 * the phone chose so: the web view has no voices of its own. One engine for
 * the whole app, in Spanish (Latin American when the phone has it), on the
 * alarm stream like the sounds. Callbacks run on the main thread.
 */
final class Speaker {

    private static final Locale[] SPANISH = {
        Locale.forLanguageTag("es-US"),
        Locale.forLanguageTag("es-MX"),
        Locale.forLanguageTag("es-419"),
        Locale.forLanguageTag("es")
    };

    private static final Handler MAIN = new Handler(Looper.getMainLooper());
    private static TextToSpeech engine;
    // null: still starting; false: no engine or no Spanish.
    private static Boolean ready;
    private static final List<Runnable> waiting = new ArrayList<>();
    // Which utterance is current: a newer one, or stop(), drops the older's
    // callback.
    private static int current = 0;

    private Speaker() {}

    static void speak(Context context, String text, float volume, Runnable onDone) {
        current += 1;
        int id = current;
        Runnable done = () -> {
            if (id == current) {
                current += 1;
                onDone.run();
            }
        };
        if (text == null || text.isEmpty()) {
            MAIN.post(done);
            return;
        }
        whenReady(context, () -> {
            if (id != current) {
                return;
            }
            if (!Boolean.TRUE.equals(ready)) {
                done.run();
                return;
            }
            // Some engines never say they ended: give up after a while, as
            // the web does.
            MAIN.postDelayed(done, 3_000 + text.length() * 120L);
            Bundle params = new Bundle();
            params.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, volume);
            engine.setOnUtteranceProgressListener(
                new UtteranceProgressListener() {
                    @Override
                    public void onStart(String utterance) {}

                    @Override
                    public void onDone(String utterance) {
                        MAIN.post(done);
                    }

                    @Override
                    public void onError(String utterance) {
                        MAIN.post(done);
                    }
                }
            );
            engine.speak(text, TextToSpeech.QUEUE_FLUSH, params, "timecraft-" + id);
        });
    }

    // Starts the engine ahead of the first words (it takes a few seconds).
    static void prepare(Context context) {
        whenReady(context, () -> {});
    }

    static void stop() {
        current += 1;
        if (engine != null && Boolean.TRUE.equals(ready)) {
            engine.stop();
        }
    }

    private static void whenReady(Context context, Runnable then) {
        if (ready != null) {
            then.run();
            return;
        }
        waiting.add(then);
        if (engine != null) {
            return;
        }
        engine = new TextToSpeech(context.getApplicationContext(), (status) ->
            MAIN.post(() -> {
                ready = status == TextToSpeech.SUCCESS && pickSpanish();
                if (ready) {
                    engine.setAudioAttributes(
                        new AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_ALARM)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                            .build()
                    );
                }
                List<Runnable> run = new ArrayList<>(waiting);
                waiting.clear();
                for (Runnable next : run) {
                    next.run();
                }
            })
        );
    }

    private static boolean pickSpanish() {
        for (Locale locale : SPANISH) {
            if (engine.isLanguageAvailable(locale) >= TextToSpeech.LANG_AVAILABLE) {
                engine.setLanguage(locale);
                return true;
            }
        }
        return false;
    }
}
