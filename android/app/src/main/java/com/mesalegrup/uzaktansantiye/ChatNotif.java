package com.mesalegrup.uzaktansantiye;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Rect;
import android.net.Uri;
import android.os.Build;
import android.service.notification.StatusBarNotification;

import androidx.core.app.NotificationCompat;
import androidx.core.app.Person;
import androidx.core.app.RemoteInput;
import androidx.core.graphics.drawable.IconCompat;

/**
 * ChatNotif — WhatsApp-tarzı native sohbet bildirimleri (CallNotif kalıbından türetildi).
 *
 * Tasarım:
 *  - Konuşma BAŞINA ayrı bildirim: notification id = conversationId.hashCode().
 *  - NotificationCompat.MessagingStyle + Person (gönderen adı + baş-harf avatar).
 *  - Aynı konuşmaya yeni mesaj gelince mevcut bildirimden eski MessagingStyle çıkarılır
 *    (extractMessagingStyleFromNotification) ve yeni mesaj EKLENİR → son mesajlar birikir.
 *  - RemoteInput ile direkt cevap (FLAG_MUTABLE ŞART) → ChatReplyReceiver.
 *  - "Okundu yap" aksiyonu → ChatMarkReadReceiver.
 *
 * Üç kanal: chat_messages (HIGH, 1:1), chat_groups (HIGH, grup), chat_silent (LOW).
 *
 * NOT: Mevcut arama bildirimi (CallNotif) BOZULMAZ — bu tamamen ayrı kanallar/id'ler kullanır.
 */
public final class ChatNotif {

    private ChatNotif() {}

    public static final String CHANNEL_MESSAGES = "chat_messages";
    public static final String CHANNEL_GROUPS = "chat_groups";
    public static final String CHANNEL_SILENT = "chat_silent";

    /** RemoteInput sonucunun okunacağı anahtar (ChatReplyReceiver ile aynı olmalı). */
    public static final String KEY_REPLY = "key_chat_reply";

    /** Intent extra anahtarları (String extralar — Serializable DEĞİL). */
    public static final String EXTRA_CONVERSATION_ID = "conversationId";
    public static final String EXTRA_CONVERSATION_TITLE = "conversationTitle";
    public static final String EXTRA_IS_GROUP = "isGroup";
    public static final String EXTRA_SENDER_NAME = "senderName";
    public static final String EXTRA_SENDER_ID = "senderId";
    public static final String EXTRA_BODY = "body";
    public static final String EXTRA_MESSAGE_ID = "messageId";
    public static final String EXTRA_RELATED_URL = "relatedUrl";
    public static final String EXTRA_NOTIF_ID = "notifId";

    /** Konuşma id'sinden kararlı bildirim id'si üret. */
    public static int notifId(String conversationId) {
        if (conversationId == null) return 0;
        // 0 ve CallNotif.NOTIFICATION_ID (4711) ile çakışmayı önle
        int h = conversationId.hashCode();
        if (h == 0) h = 1;
        if (h == CallNotif.NOTIFICATION_ID) h = h + 1;
        return h;
    }

    /** Üç sohbet kanalını idempotent oluştur (API 26+). */
    public static void ensureChannels(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        if (nm.getNotificationChannel(CHANNEL_MESSAGES) == null) {
            NotificationChannel ch = new NotificationChannel(
                    CHANNEL_MESSAGES, "Mesajlar", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("Birebir sohbet mesajları");
            ch.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
            ch.enableVibration(true);
            applyDefaultMessageSound(ch);
            nm.createNotificationChannel(ch);
        }
        if (nm.getNotificationChannel(CHANNEL_GROUPS) == null) {
            NotificationChannel ch = new NotificationChannel(
                    CHANNEL_GROUPS, "Grup mesajları", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("Grup sohbeti mesajları");
            ch.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
            ch.enableVibration(true);
            applyDefaultMessageSound(ch);
            nm.createNotificationChannel(ch);
        }
        if (nm.getNotificationChannel(CHANNEL_SILENT) == null) {
            NotificationChannel ch = new NotificationChannel(
                    CHANNEL_SILENT, "Sessiz", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Ses ve titreşim olmadan sohbet bildirimleri");
            ch.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
            ch.enableVibration(false);
            ch.setSound(null, null);
            nm.createNotificationChannel(ch);
        }
    }

    private static void applyDefaultMessageSound(NotificationChannel ch) {
        try {
            Uri snd = android.media.RingtoneManager.getDefaultUri(
                    android.media.RingtoneManager.TYPE_NOTIFICATION);
            if (snd != null) {
                android.media.AudioAttributes aa = new android.media.AudioAttributes.Builder()
                        .setUsage(android.media.AudioAttributes.USAGE_NOTIFICATION)
                        .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build();
                ch.setSound(snd, aa);
            }
        } catch (Throwable ignored) {
        }
    }

    /**
     * MessagingStyle bildirimini oluşturup (varsa eskisini genişleterek) gösterir.
     * Yeni gelen FCM mesajı için CallMessagingService.handleChatMessage'tan çağrılır.
     */
    public static void show(Context ctx,
                            String conversationId,
                            String conversationTitle,
                            boolean isGroup,
                            String senderName,
                            String senderId,
                            String body,
                            String messageId,
                            String relatedUrl) {
        ensureChannels(ctx);
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        final int id = notifId(conversationId);
        final String channelId = isGroup ? CHANNEL_GROUPS : CHANNEL_MESSAGES;
        final String safeSender = (senderName != null && !senderName.trim().isEmpty()) ? senderName : "Yeni mesaj";
        final String safeBody = body != null ? body : "";

        // "Sen" (cihaz sahibi) — MessagingStyle yapıcısı için.
        Person me = new Person.Builder().setName("Siz").setKey("self").build();

        // Mevcut bildirimden eski stili çıkar (mesaj biriktirme)
        NotificationCompat.MessagingStyle style = extractExisting(nm, id);
        if (style == null) {
            style = new NotificationCompat.MessagingStyle(me);
            if (isGroup) {
                style.setGroupConversation(true);
                if (conversationTitle != null && !conversationTitle.trim().isEmpty()) {
                    style.setConversationTitle(conversationTitle);
                }
            }
        }

        Person sender = new Person.Builder()
                .setName(safeSender)
                .setKey(senderId != null ? senderId : safeSender)
                .setIcon(IconCompat.createWithBitmap(initialsBitmap(safeSender)))
                .build();
        style.addMessage(safeBody, System.currentTimeMillis(), sender);

        // Yeni gelen mesaj → kullanıcıyı uyar (ses/titreşim/heads-up).
        Notification n = buildFromStyle(ctx, channelId, style, conversationId,
                conversationTitle, isGroup, senderId, relatedUrl, id, /*alertOnce=*/false, /*errorText=*/null);
        nm.notify(id, n);
    }

    /** Cevap gönderildikten sonra kendi mesajımızı bildirime ekleyip yeniden gösterir. */
    public static void appendOwnReply(Context ctx,
                                      int id,
                                      String channelId,
                                      String conversationId,
                                      String conversationTitle,
                                      boolean isGroup,
                                      String senderId,
                                      String relatedUrl,
                                      CharSequence replyText) {
        ensureChannels(ctx);
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        Person me = new Person.Builder().setName("Siz").setKey("self").build();
        NotificationCompat.MessagingStyle style = extractExisting(nm, id);
        if (style == null) {
            style = new NotificationCompat.MessagingStyle(me);
            if (isGroup) {
                style.setGroupConversation(true);
                if (conversationTitle != null && !conversationTitle.trim().isEmpty()) {
                    style.setConversationTitle(conversationTitle);
                }
            }
        }
        // person=null → MessagingStyle bunu "Siz" (kullanıcının kendi mesajı) olarak gösterir
        style.addMessage(replyText, System.currentTimeMillis(), (Person) null);

        // KENDİ cevabımız → tekrar ses/titreşim/heads-up İLE UYARMA (alertOnce=true).
        Notification n = buildFromStyle(ctx, channelId, style, conversationId,
                conversationTitle, isGroup, senderId, relatedUrl, id, /*alertOnce=*/true, /*errorText=*/null);
        nm.notify(id, n);
    }

    /**
     * Cevap GÖNDERİLEMEDİĞİNDE (oturum çerezi yok / ağ / sunucu hatası) çağrılır.
     * Yazılan metni SESSİZCE KAYBETME: bildirimi geri getir, kullanıcının yazdığını göster ve
     * "gönderilemedi, uygulamayı açıp tekrar deneyin" uyarısı ver (alertOnce=false → kullanıcı fark etsin).
     */
    public static void showReplyFailed(Context ctx,
                                       int id,
                                       String channelId,
                                       String conversationId,
                                       String conversationTitle,
                                       boolean isGroup,
                                       String senderId,
                                       String relatedUrl,
                                       CharSequence replyText) {
        ensureChannels(ctx);
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        Person me = new Person.Builder().setName("Siz").setKey("self").build();
        NotificationCompat.MessagingStyle style = extractExisting(nm, id);
        if (style == null) {
            style = new NotificationCompat.MessagingStyle(me);
            if (isGroup) {
                style.setGroupConversation(true);
                if (conversationTitle != null && !conversationTitle.trim().isEmpty()) {
                    style.setConversationTitle(conversationTitle);
                }
            }
        }
        // Yazdığı cevabı göster (kaybolmasın) — "Siz" olarak.
        style.addMessage(replyText, System.currentTimeMillis(), (Person) null);

        String ch = (channelId == null || channelId.isEmpty()) ? CHANNEL_MESSAGES : channelId;
        Notification n = buildFromStyle(ctx, ch, style, conversationId,
                conversationTitle, isGroup, senderId, relatedUrl, id, /*alertOnce=*/false,
                /*errorText=*/"⚠ Gönderilemedi — uygulamayı açıp tekrar deneyin");
        nm.notify(id, n);
    }

    /** Aktif bildirimlerden id eşleşeni bul, MessagingStyle'ı çıkar (yoksa null). */
    private static NotificationCompat.MessagingStyle extractExisting(NotificationManager nm, int id) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return null; // getActiveNotifications API 23+
        try {
            StatusBarNotification[] active = nm.getActiveNotifications();
            if (active == null) return null;
            for (StatusBarNotification sbn : active) {
                if (sbn.getId() == id) {
                    return NotificationCompat.MessagingStyle
                            .extractMessagingStyleFromNotification(sbn.getNotification());
                }
            }
        } catch (Throwable ignored) {
        }
        return null;
    }

    /** Verilen MessagingStyle'dan tam bildirimi (aksiyonlar + içerik intent) kurar. */
    private static Notification buildFromStyle(Context ctx,
                                               String channelId,
                                               NotificationCompat.MessagingStyle style,
                                               String conversationId,
                                               String conversationTitle,
                                               boolean isGroup,
                                               String senderId,
                                               String relatedUrl,
                                               int id,
                                               boolean alertOnce,
                                               String errorText) {
        // --- Tıklama → MainActivity (deep-link). Capacitor BridgeActivity, ACTION_VIEW + https data
        //     URI'sini App plugin 'appUrlOpen' olayına köprüler → NativeBridge o path'e gider.
        //     (Data-only push olduğu için Capacitor pushNotificationActionPerformed TETİKLENMEZ.) ---
        Intent open = new Intent(ctx, MainActivity.class);
        open.setAction(Intent.ACTION_VIEW);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (relatedUrl != null && !relatedUrl.isEmpty()) {
            String full = relatedUrl.startsWith("http")
                    ? relatedUrl
                    : "https://uzaktansantiye.com" + (relatedUrl.startsWith("/") ? relatedUrl : "/" + relatedUrl);
            open.setData(Uri.parse(full));
            open.putExtra("relatedUrl", relatedUrl);
        }
        PendingIntent openPi = PendingIntent.getActivity(ctx, id, open, immutableFlags());

        // --- Yanıtla (RemoteInput) → ChatReplyReceiver ---
        RemoteInput remoteInput = new RemoteInput.Builder(KEY_REPLY)
                .setLabel("Yanıtla")
                .build();
        Intent replyIntent = new Intent(ctx, ChatReplyReceiver.class);
        replyIntent.setAction(ChatReplyReceiver.ACTION_REPLY);
        putExtras(replyIntent, conversationId, conversationTitle, isGroup, senderId, relatedUrl, channelId, id);
        PendingIntent replyPi = PendingIntent.getBroadcast(
                ctx, id, replyIntent, mutableFlags());
        NotificationCompat.Action replyAction =
                new NotificationCompat.Action.Builder(
                        android.R.drawable.ic_menu_send, "Yanıtla", replyPi)
                        .addRemoteInput(remoteInput)
                        .setAllowGeneratedReplies(true)
                        .setSemanticAction(NotificationCompat.Action.SEMANTIC_ACTION_REPLY)
                        .build();

        // --- Okundu yap → ChatMarkReadReceiver ---
        Intent readIntent = new Intent(ctx, ChatMarkReadReceiver.class);
        readIntent.setAction(ChatMarkReadReceiver.ACTION_MARK_READ);
        putExtras(readIntent, conversationId, conversationTitle, isGroup, senderId, relatedUrl, channelId, id);
        PendingIntent readPi = PendingIntent.getBroadcast(
                ctx, id ^ 0x5EAD, readIntent, immutableFlags());
        NotificationCompat.Action readAction =
                new NotificationCompat.Action.Builder(
                        android.R.drawable.ic_menu_view, "Okundu yap", readPi)
                        .setSemanticAction(NotificationCompat.Action.SEMANTIC_ACTION_MARK_AS_READ)
                        .setShowsUserInterface(false)
                        .build();

        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, channelId)
                .setSmallIcon(smallIconRes(ctx))
                .setStyle(style)
                .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                .setAutoCancel(true)
                .setOnlyAlertOnce(alertOnce)
                .setContentIntent(openPi)
                .addAction(replyAction)
                .addAction(readAction);

        if (errorText != null && !errorText.isEmpty()) {
            b.setSubText(errorText);
        }

        return b.build();
    }

    /** Baş-harf avatar bitmap'i (renkli daire + ilk harf). Ağ I/O yok, her zaman çalışır. */
    private static Bitmap initialsBitmap(String name) {
        final int size = 128;
        Bitmap bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bmp);

        String letter = "?";
        if (name != null) {
            String t = name.trim();
            if (!t.isEmpty()) letter = t.substring(0, 1).toUpperCase();
        }

        int color = colorForName(name);
        Paint circle = new Paint(Paint.ANTI_ALIAS_FLAG);
        circle.setColor(color);
        canvas.drawCircle(size / 2f, size / 2f, size / 2f, circle);

        Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);
        text.setColor(Color.WHITE);
        text.setTextSize(size * 0.5f);
        text.setTextAlign(Paint.Align.CENTER);
        Rect bounds = new Rect();
        text.getTextBounds(letter, 0, letter.length(), bounds);
        float y = size / 2f - bounds.exactCenterY();
        canvas.drawText(letter, size / 2f, y, text);

        return bmp;
    }

    private static int colorForName(String name) {
        int[] palette = {
                0xFF1E88E5, 0xFF43A047, 0xFFE53935, 0xFF8E24AA,
                0xFFFB8C00, 0xFF00897B, 0xFF3949AB, 0xFFD81B60
        };
        int idx = 0;
        if (name != null && !name.isEmpty()) {
            idx = Math.abs(name.hashCode()) % palette.length;
        }
        return palette[idx];
    }

    /** String extralarını intent'e ekler (receiver'lar bunları okur). */
    public static void putExtras(Intent i,
                                 String conversationId,
                                 String conversationTitle,
                                 boolean isGroup,
                                 String senderId,
                                 String relatedUrl,
                                 String channelId,
                                 int notifId) {
        i.putExtra(EXTRA_CONVERSATION_ID, conversationId == null ? "" : conversationId);
        i.putExtra(EXTRA_CONVERSATION_TITLE, conversationTitle == null ? "" : conversationTitle);
        i.putExtra(EXTRA_IS_GROUP, isGroup);
        i.putExtra(EXTRA_SENDER_ID, senderId == null ? "" : senderId);
        i.putExtra(EXTRA_RELATED_URL, relatedUrl == null ? "" : relatedUrl);
        i.putExtra("channelId", channelId == null ? CHANNEL_MESSAGES : channelId);
        i.putExtra(EXTRA_NOTIF_ID, notifId);
    }

    /** RemoteInput İÇİN: FLAG_MUTABLE ŞART (IMMUTABLE ile getResultsFromIntent null döner). */
    private static int mutableFlags() {
        int f = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            f |= PendingIntent.FLAG_MUTABLE;
        }
        return f;
    }

    /** RemoteInput taşımayan aksiyonlar/içerik intent için (IMMUTABLE). */
    private static int immutableFlags() {
        int f = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            f |= PendingIntent.FLAG_IMMUTABLE;
        }
        return f;
    }

    /**
     * Bildirim küçük ikonu: meşale silueti; HERHANGİ bir sorunda sistem sohbet ikonuna düş.
     * Bildirim, ikon yüzünden ASLA düşmemeli (sessiz kayıp → "bildirim gelmiyor" hatası).
     */
    private static int smallIconRes(Context ctx) {
        try {
            if (ctx.getResources().getDrawable(R.drawable.ic_stat_flame, ctx.getTheme()) != null) {
                return R.drawable.ic_stat_flame;
            }
        } catch (Throwable t) {
            android.util.Log.e("ChatNotif", "ic_stat_flame yüklenemedi, sistem ikonuna düşülüyor", t);
        }
        return android.R.drawable.sym_action_chat;
    }
}
