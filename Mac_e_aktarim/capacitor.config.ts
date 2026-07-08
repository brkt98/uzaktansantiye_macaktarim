import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor yapılandırması — "remote-URL" deseni.
 *
 * Uygulama Next.js'te `output: "standalone"` ile derinlemesine sunucu-taraflı
 * çalıştığı için statik export edilemez. Bu yüzden native kabuk (WKWebView /
 * Android WebView) doğrudan yayındaki siteyi yükler. Capacitor native bridge'i
 * enjekte ettiğinden push, kamera, ağ gibi eklentiler yine de çalışır.
 *
 * Geliştirme sırasında canlı yeniden yükleme için `server.url`'ü kendi yerel
 * dev sunucunuza (örn. http://192.168.x.x:3000) çevirebilirsiniz.
 */
const config: CapacitorConfig = {
  appId: 'com.mesalegrup.uzaktansantiye',
  appName: 'Uzaktan Şantiye',
  // Remote-URL modunda kullanılmaz ama Capacitor CLI tarafından zorunlu tutulur.
  webDir: 'public',
  server: {
    url: 'https://uzaktansantiye.com',
    hostname: 'uzaktansantiye.com',
    androidScheme: 'https',
    // Üretimde harici http kaynaklarına izin verilmez.
    cleartext: false,
  },
  ios: {
    // İçerik üst/alt güvenli alanlara (notch/home indicator) saygı göstersin.
    contentInset: 'always',
    // iOS 14+ App-Bound Domains: cookie/localStorage/WebRTC kısıtlanmasın.
    // (Info.plist'e WKAppBoundDomains anahtarı da eklenecek.)
    limitsNavigationsToAppBoundDomains: true,
  },
  android: {
    // Aynı origin (uzaktansantiye.com) dışına çıkışları engelleyerek
    // oturum/cookie güvenliğini korur.
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#1a1a2e',
      showSpinner: false,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
