package app.timecraft;

import android.app.KeyguardManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;

/**
 * The end of a session over the lock screen, like an alarm clock. The sound
 * comes from AlarmService (or the notification). Its button ends the session
 * (parents) or silences it (the child), here and on the family's other
 * devices; "Abrir Time Craft" unlocks the phone and opens the app. The screen
 * closes by itself when the alarm is stopped elsewhere.
 */
public class AlarmActivity extends AppCompatActivity {

    private static final int BG = Color.parseColor("#1B1E24");
    private static final int FG = Color.parseColor("#F4EFE4");
    private static final int BRICK = Color.parseColor("#F2B705");

    private final BroadcastReceiver closed = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            String tag = intent.getStringExtra(Alerts.EXTRA_TAG);
            if (tag != null && tag.equals(getIntent().getStringExtra(Alerts.EXTRA_TAG))) {
                finish();
            }
        }
    };

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        ContextCompat.registerReceiver(this, closed, new IntentFilter(Alerts.ACTION_ALARM_CLOSED), ContextCompat.RECEIVER_NOT_EXPORTED);
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        setContentView(layout(getIntent()));
    }

    @Override
    protected void onDestroy() {
        unregisterReceiver(closed);
        super.onDestroy();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        setContentView(layout(intent));
    }

    private int dp(int value) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value, getResources().getDisplayMetrics()));
    }

    private View layout(Intent intent) {
        String tag = intent.getStringExtra(Alerts.EXTRA_TAG);
        String url = intent.getStringExtra(Alerts.EXTRA_URL);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setBackgroundColor(BG);
        root.setPadding(dp(24), dp(24), dp(24), dp(24));

        TextView title = new TextView(this);
        title.setText(intent.getStringExtra(Alerts.EXTRA_TITLE));
        title.setTextColor(FG);
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 34);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setGravity(Gravity.CENTER);
        root.addView(title);

        TextView body = new TextView(this);
        body.setText(intent.getStringExtra(Alerts.EXTRA_BODY));
        body.setTextColor(FG);
        body.setTextSize(TypedValue.COMPLEX_UNIT_SP, 20);
        body.setGravity(Gravity.CENTER);
        body.setPadding(0, dp(12), 0, dp(32));
        root.addView(body);

        Button stop = button(Alerts.stopLabel(tag, url), true);
        stop.setOnClickListener((view) -> {
            Alerts.stopFromAlarm(this, tag, url, () -> {});
            finish();
        });
        root.addView(stop);

        Button open = button("Abrir Time Craft", false);
        // The app stops the alarm as it opens (MainActivity).
        open.setOnClickListener((view) -> whenUnlocked(() -> {
            startActivity(Alerts.openIntent(this, url == null ? "/" : url, tag));
            finish();
        }));
        root.addView(open);
        return root;
    }

    // The app does not show over the lock screen: without unlocking first
    // (fingerprint, PIN or a swipe) it would open behind it.
    private void whenUnlocked(Runnable then) {
        KeyguardManager keyguard = getSystemService(KeyguardManager.class);
        if (!keyguard.isKeyguardLocked()) {
            then.run();
            return;
        }
        keyguard.requestDismissKeyguard(
            this,
            new KeyguardManager.KeyguardDismissCallback() {
                @Override
                public void onDismissSucceeded() {
                    then.run();
                }
            }
        );
    }

    private Button button(String text, boolean primary) {
        Button button = new Button(this);
        button.setText(text);
        button.setAllCaps(false);
        button.setTextSize(TypedValue.COMPLEX_UNIT_SP, 20);
        button.setTypeface(Typeface.DEFAULT_BOLD);
        button.setTextColor(primary ? BG : FG);
        GradientDrawable shape = new GradientDrawable();
        shape.setCornerRadius(dp(10));
        if (primary) {
            shape.setColor(BRICK);
        } else {
            shape.setColor(Color.TRANSPARENT);
            shape.setStroke(dp(2), FG);
        }
        button.setBackground(shape);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(64));
        params.topMargin = dp(12);
        button.setLayoutParams(params);
        return button;
    }
}
