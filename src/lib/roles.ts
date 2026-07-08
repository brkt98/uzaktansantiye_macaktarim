// Saf (client + server güvenli) rol & yetki yardımcıları.
// lib/auth.ts bcrypt/jwt/next-headers import ettiği için client'tan kullanılamaz;
// bu modül yalnızca rol mantığını içerir ve hem API route'lardan hem client
// bileşenlerinden import edilebilir.
//
// Tasarım: Bir kullanıcının birden çok rolü olabilir (`roles`). Yetkiler bu
// rollerin BİRLEŞİMİDİR (genişler). `role` (Ana Rol) yalnızca açılış panosunu/
// arayüzü belirler — yetki kararlarında kullanılmaz.

export type RoleInput = string | string[] | null | undefined;

/** Tek rol veya rol dizisini normalize edip benzersiz, boş-olmayan bir diziye çevirir. */
export function toRoleArray(roleOrRoles: RoleInput): string[] {
  if (!roleOrRoles) return [];
  const arr = Array.isArray(roleOrRoles) ? roleOrRoles : [roleOrRoles];
  return Array.from(new Set(arr.filter((r): r is string => typeof r === "string" && r.length > 0)));
}

/** Rollerden herhangi biri verilen hedef rol mü? */
export function hasRole(roleOrRoles: RoleInput, target: string): boolean {
  return toRoleArray(roleOrRoles).includes(target);
}

/** Rollerden herhangi biri verilen hedeflerden birine eşit mi? */
export function hasAnyRole(roleOrRoles: RoleInput, targets: string[]): boolean {
  const set = new Set(toRoleArray(roleOrRoles));
  return targets.some((t) => set.has(t));
}

export function isAdmin(roleOrRoles: RoleInput): boolean {
  return hasAnyRole(roleOrRoles, ["ADMIN", "SUPER_ADMIN"]);
}

export function isManagerOrAbove(roleOrRoles: RoleInput): boolean {
  return hasAnyRole(roleOrRoles, ["SUPER_ADMIN", "ADMIN", "MANAGER"]);
}

export function canEdit(roleOrRoles: RoleInput): boolean {
  return hasAnyRole(roleOrRoles, ["SUPER_ADMIN", "ADMIN", "MANAGER", "SITE_CHIEF", "USER"]);
}

/**
 * Şantiye Şefi KAPSAM kısıtlaması yalnızca kullanıcı *yalnızca* şantiye şefi
 * (daha üst rolü yok) ise uygulanmalı; aksi halde çoklu rol yetkiyi genişletir.
 */
export function isSiteChiefScoped(roleOrRoles: RoleInput): boolean {
  return hasRole(roleOrRoles, "SITE_CHIEF") && !isManagerOrAbove(roleOrRoles);
}

/** Finans modülleri (Satış / Maliyet) için erişim — Müdür ve üzeri veya Muhasebe. */
export function canAccessFinance(roleOrRoles: RoleInput): boolean {
  return isManagerOrAbove(roleOrRoles) || hasRole(roleOrRoles, "MUHASEBE");
}

/**
 * Satış DÜZENLEME yetkisi — yalnızca Müdür ve üzeri (SUPER_ADMIN / ADMIN / MANAGER).
 * Muhasebe dâhil diğer roller satışı DÜZENLEYEMEZ; yalnızca görüntüler (fiyatları görür).
 */
export function canEditSales(roleOrRoles: RoleInput): boolean {
  return isManagerOrAbove(roleOrRoles);
}

/**
 * Satış sayfasında SALT-OKUNUR mod: Müdür-ve-üzeri OLMAYAN herkes (şef, muhasebe, kullanıcı…).
 * Bu kullanıcılar fiyatları/durumları (kartlarda yazılı) görür ama düzenleyemez; daireye
 * tıklayınca yönetim pop-up'ı yerine medya viewer açılır.
 * NOT: Kullanıcı talebiyle kural "yalnızca şantiye şefi" yerine "Müdür+ değil" olarak güncellendi.
 */
export function isSalesMediaOnly(roleOrRoles: RoleInput): boolean {
  return !isManagerOrAbove(roleOrRoles);
}

// ==================== Görünen Etiketler / Renkler ====================

export const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Admin",
  ADMIN: "Yönetici",
  MANAGER: "Müdür",
  SITE_CHIEF: "Şantiye Şefi",
  MUHASEBE: "Muhasebe",
  USER: "Kullanıcı",
  VIEWER: "İzleyici",
};

export const ROLE_COLORS: Record<string, string> = {
  SUPER_ADMIN: "bg-purple-100 text-purple-700",
  ADMIN: "bg-red-100 text-red-700",
  MANAGER: "bg-blue-100 text-blue-700",
  SITE_CHIEF: "bg-orange-100 text-orange-700",
  MUHASEBE: "bg-teal-100 text-teal-700",
  USER: "bg-green-100 text-green-700",
  VIEWER: "bg-gray-100 text-gray-700",
};

export function getRoleLabel(role: string): string {
  return ROLE_LABELS[role] || role;
}

export function getRoleColor(role: string): string {
  return ROLE_COLORS[role] || "bg-gray-100 text-gray-700";
}

/**
 * Atanabilir roller (en düşük yetkiden en yükseğe sıralı).
 * SUPER_ADMIN ayrıdır: yalnızca bir SUPER_ADMIN tarafından atanabilir, bu yüzden
 * UI'da koşullu eklenir.
 */
export const ASSIGNABLE_ROLES: string[] = [
  "VIEWER",
  "USER",
  "MUHASEBE",
  "SITE_CHIEF",
  "MANAGER",
  "ADMIN",
];
