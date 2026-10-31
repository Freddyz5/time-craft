package app.timecraft;

import android.content.Intent;
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

/**
 * The end of a session over the lock screen, like an alarm clock. The sound
 * comes from the notification (it repeats until the notification closes);
 * "Detener" closes it.
 */
public class AlarmActivity extends AppCompatActivity {

    private static final int BG = Color.parseColor("#1B1E24");
    private static final int FG = Color.parseColor("#F4EFE4");
    private static final int BRICK = Color.parseColor("#F2B705");

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
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

        Button stop = button("Detener", true);
        stop.setOnClickListener((view) -> {
            Alerts.stop(this, tag);
            finish();
        });
        root.addView(stop);

        Button open = button("Abrir Time Craft", false);
        open.setOnClickListener((view) -> {
            Alerts.stop(this, tag);
            startActivity(Alerts.openIntent(this, url == null ? "/" : url, tag));
            finish();
        });
        root.addView(open);
        return root;
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
