"use client";

import { useState, useEffect } from "react";

/**
 * Cihaz tipi: 'mobile' | 'tablet' | 'desktop' (MECE — kesişmez, boşluk bırakmaz).
 *
 * Tasarım kararları (yön dönüşü + iPad Split View hatalarına karşı):
 * - Karar PENCERE (innerWidth) değil EKRAN (screen.width/height) boyutuna dayanır →
 *   telefonun yatay dönüşü, iPad Split View / Stage Manager / Android split-screen
 *   pencere daraltması cihaz tipini DEĞİŞTİRMEZ. (min(screen.w, screen.h) yön-bağımsız.)
 * - Tablet kuralında hover:none ŞARTI YOK → iPad'e Magic Keyboard/fare bağlanınca tablet kalır
 *   (eski kuralda hover:none olduğundan aksesuarlı iPad hiçbir sınıfa girmiyordu).
 * - Histerezis (600/640) → foldable ve 7" tablet sınırında flapping olmaz.
 * - KRİTİK: değer DEĞİŞMEDİKÇE setState çağrılmaz → yön dönüşünde gereksiz re-render/remount
 *   (ve route'un ana sayfaya atması) engellenir.
 * - SSR'da 'desktop' döner (isMobile=isTablet=false — eski davranış korunur).
 */
type DeviceType = "mobile" | "tablet" | "desktop";

function classify(prev: DeviceType | null): DeviceType {
  if (typeof window === "undefined") return "desktop";

  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const touch = (navigator.maxTouchPoints || 0) > 0;
  // iPadOS Safari masaüstü UA gönderir; maxTouchPoints>1 + Macintosh ile yakalanır.
  const isIpadOS = navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent);
  const nav = navigator as Navigator & { userAgentData?: { mobile?: boolean } };
  const uaMobile = nav.userAgentData ? nav.userAgentData.mobile === true : null;

  // Dokunmatik cihaz mı? (iPad'e fare bağlanıp pointer 'fine' olsa bile isIpadOS ile korunur)
  const isTouchDevice = (coarse && touch) || isIpadOS;
  // Dokunmatik değil ve UA telefon demiyorsa → masaüstü (dokunmatik laptop dahil).
  if (!isTouchDevice && uaMobile !== true) return "desktop";

  // EKRAN kısa kenarı (pencereden/zoom'dan/Split View'dan bağımsız).
  const sMin = Math.min(window.screen.width, window.screen.height);

  // Histerezis: mobile→tablet için >=640, tablet→mobile için <600.
  const LO = 600;
  const HI = 640;
  let isMobile = prev === "mobile" ? sMin < HI : sMin < LO;

  // UA kesin telefon diyorsa zorla mobil ('masaüstü sitesi iste' / büyük telefon koruması).
  if (uaMobile === true && !isIpadOS) isMobile = true;

  return isMobile ? "mobile" : "tablet";
}

export function useDevice() {
  const [type, setType] = useState<DeviceType>("desktop");

  useEffect(() => {
    let prev: DeviceType | null = null;
    let timer = 0;

    const apply = () => {
      const next = classify(prev);
      if (next !== prev) {
        prev = next;
        setType(next); // KRİTİK: değişmediyse setState YOK → yön dönüşünde remount/ana-sayfaya-atma engellenir
      }
    };
    // orientationchange + resize ardışık ateşlenir → tek hesaba indir.
    const debounced = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(apply, 150);
    };

    apply(); // mount'ta bir kez senkron

    window.addEventListener("resize", debounced);
    window.addEventListener("orientationchange", debounced);
    const coarseMq = window.matchMedia("(pointer: coarse)");
    coarseMq.addEventListener("change", apply); // aksesuar/işaretleyici değişimi (anlık)

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", debounced);
      window.removeEventListener("orientationchange", debounced);
      coarseMq.removeEventListener("change", apply);
    };
  }, []);

  return { isMobile: type === "mobile", isTablet: type === "tablet" };
}
