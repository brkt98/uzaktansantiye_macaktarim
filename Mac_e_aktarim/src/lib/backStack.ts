"use client";

/**
 * Merkezi "geri yığını" (LIFO close-handler registry).
 *
 * Sorun: Tam-ekran modaller/overlay'ler saf React state ile açılıyor, tarayıcı
 * history'sine girmiyor. Android geri-gesture'ı (NativeBridge'deki backButton
 * handler) bunu bilmediğinden, modal açıkken geri alttaki SAYFAYI pop ediyor →
 * "ana sayfaya atladı" algısı.
 *
 * Çözüm: Her overlay açıldığında kapatma fonksiyonunu bu yığına push eder.
 * NativeBridge geri-gesture'da önce `backStackPop()` çağırır: yığın boş değilse
 * en üstteki overlay'i kapatır ve `true` döner → history.back() ÇAĞRILMAZ.
 *
 * Not: history.pushState/sentinel yaklaşımından bilinçli kaçınıldı — Next.js App
 * Router'ın kendi popstate sarmalayıcısıyla yarışır. Saf JS stack daha güvenli.
 */

import { useEffect, useRef } from "react";

type CloseFn = () => void;
type Entry = { id: number; close: CloseFn };

const stack: Entry[] = [];
let nextId = 1;

function push(close: CloseFn): number {
  const id = nextId++;
  stack.push({ id, close });
  return id;
}

function remove(id: number): void {
  const i = stack.findIndex((e) => e.id === id);
  if (i !== -1) stack.splice(i, 1);
}

/**
 * En üstteki overlay'i kapatır. Bir overlay kapatıldıysa `true` döner
 * (çağıran taraf history.back() YAPMAMALI), yığın boşsa `false`.
 */
export function backStackPop(): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  stack.pop(); // önce çıkar → close()'un tetiklediği unmount cleanup'ı çift-silmesin
  try {
    top.close();
  } catch {
    /* yoksay */
  }
  return true;
}

/** Yığında açık overlay var mı (tanılama/koşullu kullanım için). */
export function backStackHas(): boolean {
  return stack.length > 0;
}

/**
 * Bir overlay'i geri-yığınına bağlar.
 * @param open   overlay açık mı
 * @param onClose overlay'i kapatan fonksiyon (en güncel referans her render alınır)
 *
 * Kullanım: `useModalBack(menuOpen, () => setMenuOpen(false));`
 */
export function useModalBack(open: boolean, onClose: CloseFn): void {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const id = push(() => closeRef.current());
    return () => remove(id);
  }, [open]);
}
