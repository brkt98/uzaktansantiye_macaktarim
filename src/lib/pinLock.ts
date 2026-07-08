/* Uygulama içi 4 haneli PIN kilidi (kolaylık kilidi — cihazı eline alan kişiye karşı).
   SENKRON localStorage kullanır (Preferences dinamik import'u cihazda takılıyordu) →
   açılış kararı anında, kayıt anında, hiç bekletme yok. Hash: tuz + iterasyonlu JS hash
   (crypto.subtle bu WebView'de güvenilmez/yavaş). Gerçek güvenlik sunucu oturumundadır. */

import { Capacitor } from "@capacitor/core";

const KEY_HASH = "app_pin_hash";
const KEY_SALT = "app_pin_salt";
const KEY_FAILS = "app_pin_fails";
const KEY_LOCKED_UNTIL = "app_pin_locked_until";
const ITER = 100000;

function ls(): Storage | null {
  try {
    return typeof window !== "undefined" && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function randomSaltHex(): string {
  const a = new Uint8Array(16);
  try {
    if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(a);
    else throw new Error("no crypto");
  } catch {
    for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
  }
  return toHex(a);
}

// Bağımsız, hızlı, deterministik hash (iterasyonlu) — kolaylık kilidi için yeterli.
function mix(s: string): string {
  let h1 = 0xdeadbeef ^ s.length;
  let h2 = 0x41c6ce57 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return ((h2 >>> 0).toString(16).padStart(8, "0")) + ((h1 >>> 0).toString(16).padStart(8, "0"));
}
function hashPin(pin: string, saltHex: string): string {
  let v = saltHex + "|" + pin;
  for (let i = 0; i < ITER; i++) v = mix(v + saltHex + i);
  return v;
}

function timingSafeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export function pinSupported(): boolean {
  return Capacitor.isNativePlatform() && !!ls();
}

/** Senkron — PIN ayarlı mı (cold-start kararı için, beklemesiz). */
export function isPinSetSync(): boolean {
  const s = ls();
  return !!(s && s.getItem(KEY_HASH));
}
export async function isPinSet(): Promise<boolean> {
  return isPinSetSync();
}

export async function setPin(pin: string): Promise<void> {
  const s = ls();
  if (!s) throw new Error("Depolama kullanılamıyor");
  const salt = randomSaltHex();
  s.setItem(KEY_SALT, salt);
  s.setItem(KEY_HASH, hashPin(pin, salt));
  resetPinFails();
}

export async function verifyPin(pin: string): Promise<boolean> {
  const s = ls();
  if (!s) return false;
  const salt = s.getItem(KEY_SALT);
  const hash = s.getItem(KEY_HASH);
  if (!salt || !hash) return false;
  return timingSafeEq(hashPin(pin, salt), hash);
}

export function clearPinSync(): void {
  const s = ls();
  if (s) {
    s.removeItem(KEY_HASH);
    s.removeItem(KEY_SALT);
  }
  resetPinFails();
}
export async function clearPin(): Promise<void> {
  clearPinSync();
}

// ── Kalıcı deneme/kilit durumu (senkron, reload ile sıfırlanamaz) ──

function cooldownMsFor(fails: number): number {
  const blocks = Math.floor(fails / 5);
  if (blocks <= 0) return 0;
  return Math.min(30000 * Math.pow(2, blocks - 1), 1800000); // 30sn → max 30dk
}

export function getLockRemainingSecSync(): number {
  const s = ls();
  if (!s) return 0;
  const v = s.getItem(KEY_LOCKED_UNTIL);
  if (!v) return 0;
  const rem = parseInt(v, 10) - Date.now();
  return rem > 0 ? Math.ceil(rem / 1000) : 0;
}

export function recordPinFailSync(): number {
  const s = ls();
  if (!s) return 0;
  const fails = parseInt(s.getItem(KEY_FAILS) || "0", 10) + 1;
  s.setItem(KEY_FAILS, String(fails));
  if (fails % 5 === 0) {
    const ms = cooldownMsFor(fails);
    s.setItem(KEY_LOCKED_UNTIL, String(Date.now() + ms));
    return Math.ceil(ms / 1000);
  }
  return 0;
}

export function resetPinFails(): void {
  const s = ls();
  if (s) {
    s.removeItem(KEY_FAILS);
    s.removeItem(KEY_LOCKED_UNTIL);
  }
}

export function getPinFailCountSync(): number {
  const s = ls();
  return s ? parseInt(s.getItem(KEY_FAILS) || "0", 10) : 0;
}
