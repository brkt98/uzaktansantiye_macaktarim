package com.mesalegrup.uzaktansantiye;

import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Base64;
import androidx.core.content.IntentCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

/**
 * ShareTarget — başka uygulamalardan (Galeri, WhatsApp, dosya) veya kendi medya
 * görüntüleyicimizden gelen ACTION_SEND / ACTION_SEND_MULTIPLE içeriğini yakalar
 * ve web tarafına (uygulama içi sohbete iletmek üzere) köprüler.
 *
 * Doğrulanmış düzeltmeler: (1) pending HER ZAMAN yazılır, sadece clearPendingShare
 * ile temizlenir (cold-start kaybını önler) (2) IntentCompat ile deprecated
 * getParcelableExtra yerine güvenli okuma (3) 25MB native boyut eşiği (OOM önleme)
 * (4) artan shareId ile idempotency.
 */
@CapacitorPlugin(name = "ShareTarget")
public class ShareTargetPlugin extends Plugin {

    private static final long MAX_BYTES = 25L * 1024 * 1024; // 25MB native eşik
    private JSObject pending = null;
    private int shareCounter = 0;

    @Override
    public void load() {
        // Cold-start: BridgeActivity.load() bridge KURULDUKTAN sonra çağrılır.
        handle(getActivity().getIntent());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        handle(intent);
    }

    private void handle(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (action == null) return;
        boolean single = Intent.ACTION_SEND.equals(action);
        boolean multi = Intent.ACTION_SEND_MULTIPLE.equals(action);
        if (!single && !multi) return; // SADECE paylaşım — LAUNCHER/VIEW asla işlenmez

        JSObject data = new JSObject();
        data.put("id", ++shareCounter);
        JSArray files = new JSArray();
        JSArray texts = new JSArray();

        String text = intent.getStringExtra(Intent.EXTRA_TEXT);
        if (text != null) texts.put(text);

        List<Uri> uris = new ArrayList<>();
        if (single) {
            Uri u = IntentCompat.getParcelableExtra(intent, Intent.EXTRA_STREAM, Uri.class);
            if (u != null) uris.add(u);
        } else {
            ArrayList<Uri> list = IntentCompat.getParcelableArrayListExtra(intent, Intent.EXTRA_STREAM, Uri.class);
            if (list != null) uris.addAll(list);
        }

        for (Uri uri : uris) {
            JSObject f = readUri(uri);
            if (f != null) files.put(f);
        }

        if (files.length() == 0 && texts.length() == 0) return;
        data.put("files", files);
        data.put("texts", texts);

        // FIX: HER ZAMAN pending'e yaz; warm listener için ek olarak notify et.
        pending = data;
        notifyListeners("shareReceived", data);
        // intent tüketildi → aynı paylaşımın tekrar okunmasını engelle
        getActivity().setIntent(new Intent(Intent.ACTION_MAIN));
    }

    private JSObject readUri(Uri uri) {
        try {
            String name = "dosya";
            long size = -1;
            try (Cursor c = getContext().getContentResolver().query(uri, null, null, null, null)) {
                if (c != null && c.moveToFirst()) {
                    int ni = c.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                    int si = c.getColumnIndex(OpenableColumns.SIZE);
                    if (ni >= 0 && !c.isNull(ni)) name = c.getString(ni);
                    if (si >= 0 && !c.isNull(si)) size = c.getLong(si);
                }
            }
            String mime = getContext().getContentResolver().getType(uri);
            if (mime == null) mime = "application/octet-stream";

            JSObject f = new JSObject();
            f.put("name", name);
            f.put("mimeType", mime);
            f.put("size", size);

            // FIX: NATIVE boyut eşiği — büyük dosyada base64'e çevirme (OOM önleme)
            if (size > MAX_BYTES) {
                f.put("tooLarge", true);
                return f;
            }
            try (InputStream is = getContext().getContentResolver().openInputStream(uri)) {
                if (is == null) return null;
                ByteArrayOutputStream bos = new ByteArrayOutputStream();
                byte[] buf = new byte[8192];
                int n;
                long total = 0;
                while ((n = is.read(buf)) != -1) {
                    total += n;
                    if (total > MAX_BYTES) { // boyut bilinmiyorsa (size=-1) akış sırasında da koru
                        f.put("tooLarge", true);
                        return f;
                    }
                    bos.write(buf, 0, n);
                }
                f.put("base64", Base64.encodeToString(bos.toByteArray(), Base64.NO_WRAP));
            }
            f.put("tooLarge", false);
            return f;
        } catch (Exception e) {
            return null;
        }
    }

    @PluginMethod
    public void getPendingShare(PluginCall call) {
        if (pending != null) {
            call.resolve(pending);
        } else {
            JSObject empty = new JSObject();
            empty.put("id", 0);
            empty.put("files", new JSArray());
            empty.put("texts", new JSArray());
            call.resolve(empty);
        }
    }

    @PluginMethod
    public void clearPendingShare(PluginCall call) {
        pending = null; // SADECE JS işledikten sonra temizlenir
        call.resolve();
    }
}
