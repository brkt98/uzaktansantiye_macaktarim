/* Biyometrik kimlik doğrulama (native Biometric plugin — androidx.biometric).
   Web / eklenti yoksa: isAvailable=false, authenticate=true (kilit yok, geçer). APK rebuild ister. */

interface BiometricApi {
  isAvailable(): Promise<{ available: boolean; code?: number; sdk?: number }>;
  authenticate(o: { title?: string; subtitle?: string }): Promise<{ success: boolean }>;
}

/** Tanı satırı için: durum + Android sürümü + kod (ör. "ok · sdk33"). */
export async function biometricDiag(): Promise<string> {
  try {
    const { Capacitor, registerPlugin } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return "web";
    const p = registerPlugin<BiometricApi>("Biometric");
    const r = await p.isAvailable();
    return `${r.available ? "ok" : "kod" + r.code} · sdk${r.sdk ?? "?"}`;
  } catch (e) {
    return "no-plugin (" + ((e as { message?: string })?.message || "?") + ")";
  }
}

export type BioStatus = "web" | "no-plugin" | "ok" | "no-enroll" | "no-hardware" | "unknown";

/** Biyometriğin neden kullanılamadığını ayırt eder (toggle'da net mesaj için). */
export async function biometricStatus(): Promise<BioStatus> {
  try {
    const { Capacitor, registerPlugin } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return "web";
    const p = registerPlugin<BiometricApi>("Biometric");
    const r = await p.isAvailable(); // eklenti yoksa "not implemented" → catch → no-plugin
    if (r.available) return "ok";
    if (r.code === 11) return "no-enroll";
    if (r.code === 12 || r.code === 1) return "no-hardware";
    return "unknown";
  } catch {
    return "no-plugin";
  }
}

async function plugin(): Promise<BiometricApi | null> {
  try {
    const { Capacitor, registerPlugin } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return null;
    return registerPlugin<BiometricApi>("Biometric");
  } catch {
    return null;
  }
}

export async function biometricAvailable(): Promise<boolean> {
  try {
    const p = await plugin();
    if (!p) return false;
    const r = await p.isAvailable();
    return !!r.available;
  } catch {
    return false;
  }
}

/** {success}. Web/eklenti yok→success:true (kilit yok). Hata olursa error = native mesaj (tanı için). */
export async function biometricAuthenticate(title = "Uygulama kilidi", subtitle = "Kimliğinizi doğrulayın"): Promise<{ success: boolean; error?: string }> {
  try {
    const p = await plugin();
    if (!p) return { success: true };
    // Prompt hiç callback vermezse (asılı kalırsa) zaman aşımıyla yüzeye çıkar
    const r = await Promise.race([
      p.authenticate({ title, subtitle }),
      new Promise<{ success: boolean }>((_, rej) => setTimeout(() => rej(new Error("Prompt açılmadı — callback gelmedi (12sn zaman aşımı)")), 12000)),
    ]);
    return { success: !!r.success };
  } catch (e) {
    const err = (e as { message?: string; errorMessage?: string })?.message
      || (e as { errorMessage?: string })?.errorMessage
      || String(e);
    return { success: false, error: err };
  }
}
