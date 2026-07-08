package com.mesalegrup.uzaktansantiye;

import android.app.Activity;
import android.app.KeyguardManager;
import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * IncomingCallActivity — kilit ekranı üstünde gösterilen TAM EKRAN çalan ekran.
 *
 * Full-screen-intent buraya bağlıdır. setShowWhenLocked/setTurnScreenOn (API27+) +
 * <27 window-flag fallback ile kilitli ekranda da açılır. Arayan adı + Kabul/Reddet.
 *
 *  Kabul  → CallForegroundService durdur + bildirim iptal + MainActivity'yi
 *           relatedUrl + accept=1 ile aç (deep link, setClassName).
 *  Reddet → CallActionReceiver (HTTP reject + durdur).
 *
 * Bu ekran zaten çalan bildirimle eşzamanlı; bildirim ringtone'u çalmayı sürdürür.
 */
public class IncomingCallActivity extends Activity {

    public static final String ACTION_INCOMING = "com.mesalegrup.uzaktansantiye.INCOMING_CALL";
    public static final String ACTION_ACCEPT = "com.mesalegrup.uzaktansantiye.CALL_ACCEPT";
    /** Arayan vazgeçince/iptal edince çalan ekranı kapatmak için yayın. */
    public static final String ACTION_FINISH = "com.mesalegrup.uzaktansantiye.CALL_FINISH";

    private BroadcastReceiver finishReceiver;

    // İnşaat fotoğrafı crossfade arka planı (login ekranı gibi)
    private static final int[] BG = { R.drawable.call_bg_1, R.drawable.call_bg_2, R.drawable.call_bg_3 };
    private Handler bgHandler;
    private ImageView bgFront, bgBack;
    private int bgIndex;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        showWhenLockedAndTurnScreenOn();

        Intent intent = getIntent();

        // Bildirimdeki "Kabul" düğmesi doğrudan accept action ile gelebilir → UI gösterme, hemen kabul et
        if (intent != null && ACTION_ACCEPT.equals(intent.getAction())) {
            accept(intent);
            return;
        }

        buildUi(intent);
        registerFinishReceiver();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (intent != null && ACTION_ACCEPT.equals(intent.getAction())) {
            accept(intent);
            return;
        }
        if (intent != null && ACTION_FINISH.equals(intent.getAction())) {
            finishAndRemoveTask();
            return;
        }
        buildUi(intent);
    }

    private void showWhenLockedAndTurnScreenOn() {
        // NOT: requestDismissKeyguard / FLAG_DISMISS_KEYGUARD KULLANILMIYOR —
        // amaç telefon kilidini AÇTIRMADAN üstte göstermek (kabulde PIN istenmesin).
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) { // API27+
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(
                    WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                            | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }

    private void buildUi(Intent intent) {
        final String conversationId = strExtra(intent, CallNotif.EXTRA_CONVERSATION_ID);
        final String callerName = strExtra(intent, CallNotif.EXTRA_CALLER_NAME);
        final String fromUserId = strExtra(intent, CallNotif.EXTRA_FROM_USER_ID);
        final String callType = strExtra(intent, CallNotif.EXTRA_CALL_TYPE);
        final String relatedUrl = strExtra(intent, CallNotif.EXTRA_RELATED_URL);

        String name = TextUtils.isEmpty(callerName) ? "Gelen arama" : callerName;
        boolean isVideo = "video".equals(callType);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        // Arka plan artık animasyonlu ImageView slideshow → root SAYDAM
        int pad = dp(28);
        root.setPadding(pad, pad, pad, pad);

        TextView label = new TextView(this);
        label.setText(isVideo ? "Görüntülü gelen arama" : "Sesli gelen arama");
        label.setTextColor(Color.parseColor("#C8C8D8"));
        label.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        label.setGravity(Gravity.CENTER);

        // Avatar dairesi (baş harfler) — uygulama içi arama ekranına benzer görünüm
        TextView avatar = new TextView(this);
        avatar.setText(initials(name));
        avatar.setTextColor(Color.WHITE);
        avatar.setTextSize(TypedValue.COMPLEX_UNIT_SP, 42);
        avatar.setGravity(Gravity.CENTER);
        GradientDrawable circle = new GradientDrawable();
        circle.setShape(GradientDrawable.OVAL);
        circle.setColor(Color.parseColor("#1e3a5f"));
        avatar.setBackground(circle);
        LinearLayout.LayoutParams avLp = new LinearLayout.LayoutParams(dp(120), dp(120));
        avLp.topMargin = dp(24);
        avLp.bottomMargin = dp(20);
        avatar.setLayoutParams(avLp);

        TextView nameView = new TextView(this);
        nameView.setText(name);
        nameView.setTextColor(Color.WHITE);
        nameView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 28);
        nameView.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams nameLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        nameLp.bottomMargin = dp(64);
        nameView.setLayoutParams(nameLp);

        LinearLayout buttons = new LinearLayout(this);
        buttons.setOrientation(LinearLayout.HORIZONTAL);
        buttons.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams btnRowLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        buttons.setLayoutParams(btnRowLp);

        Button reject = new Button(this);
        reject.setText("Reddet");
        reject.setTextColor(Color.WHITE);
        reject.setAllCaps(false);
        reject.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17);
        reject.setBackground(roundedBg("#c0392b"));
        LinearLayout.LayoutParams rejLp = new LinearLayout.LayoutParams(0, dp(58), 1f);
        rejLp.rightMargin = dp(10);
        reject.setLayoutParams(rejLp);
        reject.setOnClickListener(v -> {
            Intent rj = new Intent(this, CallActionReceiver.class);
            rj.setAction(CallActionReceiver.ACTION_REJECT);
            CallNotif.putExtras(rj, conversationId, callerName, fromUserId, callType, relatedUrl);
            sendBroadcast(rj);
            finishAndRemoveTask();
        });

        Button accept = new Button(this);
        accept.setText("Kabul");
        accept.setTextColor(Color.WHITE);
        accept.setAllCaps(false);
        accept.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17);
        accept.setBackground(roundedBg("#27ae60"));
        LinearLayout.LayoutParams accLp = new LinearLayout.LayoutParams(0, dp(58), 1f);
        accLp.leftMargin = dp(10);
        accept.setLayoutParams(accLp);
        accept.setOnClickListener(v -> accept(getIntent()));

        buttons.addView(reject);
        buttons.addView(accept);

        root.addView(label);
        root.addView(avatar);
        root.addView(nameView);
        root.addView(buttons);

        // Katmanlar: [bg1][bg2 crossfade][koyu örtü][içerik]
        FrameLayout container = new FrameLayout(this);
        container.setBackgroundColor(Color.parseColor("#0b1220"));
        final int MP = FrameLayout.LayoutParams.MATCH_PARENT;

        ImageView bg1 = new ImageView(this);
        bg1.setScaleType(ImageView.ScaleType.CENTER_CROP);
        ImageView bg2 = new ImageView(this);
        bg2.setScaleType(ImageView.ScaleType.CENTER_CROP);
        bg2.setAlpha(0f);
        container.addView(bg1, new FrameLayout.LayoutParams(MP, MP));
        container.addView(bg2, new FrameLayout.LayoutParams(MP, MP));

        View overlay = new View(this);
        overlay.setBackgroundColor(Color.parseColor("#C00b1220")); // ~75% koyu örtü (fotoğraf görünür + metin okunur)
        container.addView(overlay, new FrameLayout.LayoutParams(MP, MP));

        container.addView(root, new FrameLayout.LayoutParams(MP, MP));

        setContentView(container);
        startBgSlideshow(bg1, bg2);
    }

    /** İnşaat fotoğraflarını 5sn'de bir crossfade ile değiştir. */
    private void startBgSlideshow(ImageView a, ImageView b) {
        bgFront = a;
        bgBack = b;
        bgIndex = 0;
        a.setImageResource(BG[0]);
        bgHandler = new Handler(Looper.getMainLooper());
        bgHandler.postDelayed(bgTick, 5000);
    }

    private final Runnable bgTick = new Runnable() {
        @Override
        public void run() {
            if (bgHandler == null || bgFront == null || bgBack == null) return;
            bgIndex = (bgIndex + 1) % BG.length;
            bgBack.setImageResource(BG[bgIndex]);
            bgBack.setAlpha(0f);
            bgBack.animate().alpha(1f).setDuration(1200).start();
            ImageView tmp = bgFront;
            bgFront = bgBack;
            bgBack = tmp;
            bgHandler.postDelayed(this, 5000);
        }
    };

    /** Kabul: servis/bildirim durdur → MainActivity'yi deep-link + accept=1 ile aç. */
    private void accept(Intent src) {
        final String conversationId = strExtra(src, CallNotif.EXTRA_CONVERSATION_ID);
        final String callType = strExtra(src, CallNotif.EXTRA_CALL_TYPE);
        String relatedUrl = strExtra(src, CallNotif.EXTRA_RELATED_URL);

        // Çalmayı durdur (foreground servis + bildirim)
        stopCallService();

        // relatedUrl yoksa conversationId'den arama URL'i kur
        if (TextUtils.isEmpty(relatedUrl) && !TextUtils.isEmpty(conversationId)) {
            relatedUrl = "/dashboard/arama/" + conversationId
                    + "?video=" + ("video".equals(callType) ? "1" : "0");
        }
        // accept=1 işaretle (web tarafı 'call:accept' emit etsin / arayan ringback kessin)
        String target = appendAccept(relatedUrl);

        Intent main = new Intent();
        main.setClassName(getPackageName(), getPackageName() + ".MainActivity");
        main.setAction(Intent.ACTION_VIEW);
        if (!TextUtils.isEmpty(target)) {
            // appUrlOpen (NativeBridge) bunu yakalayıp path'e gider
            main.setData(Uri.parse("https://uzaktansantiye.com" + target));
        }
        main.putExtra(CallNotif.EXTRA_RELATED_URL, target);
        main.putExtra("accept", "1");
        main.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_SINGLE_TOP
                | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        startActivity(main);

        finishAndRemoveTask();
    }

    private String appendAccept(String url) {
        if (TextUtils.isEmpty(url)) return url;
        return url + (url.contains("?") ? "&" : "?") + "accept=1";
    }

    private void stopCallService() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(CallNotif.NOTIFICATION_ID);
        Intent svc = new Intent(this, CallForegroundService.class);
        svc.setAction(CallForegroundService.ACTION_STOP);
        try {
            startService(svc);
        } catch (Exception ignored) {
        }
    }

    private void registerFinishReceiver() {
        finishReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                finishAndRemoveTask();
            }
        };
        IntentFilter filter = new IntentFilter(ACTION_FINISH);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(finishReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(finishReceiver, filter);
        }
    }

    @Override
    protected void onDestroy() {
        if (bgHandler != null) {
            bgHandler.removeCallbacksAndMessages(null);
            bgHandler = null;
        }
        bgFront = null;
        bgBack = null;
        if (finishReceiver != null) {
            try {
                unregisterReceiver(finishReceiver);
            } catch (Exception ignored) {
            }
            finishReceiver = null;
        }
        super.onDestroy();
    }

    private static String strExtra(Intent i, String key) {
        if (i == null) return "";
        String v = i.getStringExtra(key);
        return v == null ? "" : v;
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }

    private GradientDrawable roundedBg(String color) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(Color.parseColor(color));
        g.setCornerRadius(dp(16));
        return g;
    }

    private static String initials(String name) {
        if (name == null) return "?";
        String[] parts = name.trim().split("\\s+");
        StringBuilder s = new StringBuilder();
        if (parts.length > 0 && !parts[0].isEmpty()) s.append(parts[0].charAt(0));
        if (parts.length > 1 && !parts[1].isEmpty()) s.append(parts[1].charAt(0));
        return s.length() == 0 ? "?" : s.toString().toUpperCase();
    }
}
