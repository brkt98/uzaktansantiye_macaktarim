// @capacitor-firebase/messaging'in WEB implementasyonu `firebase/messaging`'den
// bu fonksiyonları import eder. Ama biz web'de Firebase push KULLANMIYORUZ:
//   iOS   → native FirebaseMessaging (bu web kodu çalışmaz),
//   Android → @capacitor/push-notifications,
//   masaüstü web → hiç push yok.
// Bu yüzden büyük `firebase` JS SDK'sını kurmak yerine bundler'ın çözebilmesi için
// no-op stub veriyoruz. Bu fonksiyonlar bizim platformlarımızda ASLA çağrılmaz.
const notUsed = () => {
  throw new Error("firebase/messaging (web) bu uygulamada kullanılmıyor");
};

export const getMessaging = notUsed;
export const getToken = notUsed;
export const deleteToken = notUsed;
export const onMessage = notUsed;
export const isSupported = async () => false;
