import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { prisma } from "./db";

// Saf rol/yetki yardımcılarını roles.ts'ten re-export et — mevcut
// `import { isAdmin } from "@/lib/auth"` çağrıları çalışmaya devam etsin.
export {
  isAdmin,
  isManagerOrAbove,
  canEdit,
  hasRole,
  hasAnyRole,
  isSiteChiefScoped,
  canAccessFinance,
  toRoleArray,
} from "./roles";

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

// JWT imza anahtarı — ZAYIF VARSAYILAN YOK. Env yoksa runtime'da fail-fast; build'i etkilemez
// (yalnız token üretimi/doğrulaması çağrıldığında değerlendirilir, module-load/build sırasında değil).
function getJwtSecret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET ortam değişkeni tanımlı değil.");
  return s;
}

export interface JWTPayload {
  userId: string;
  username: string;
  role: string;
  roles: string[];
  email: string;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateToken(payload: JWTPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions);
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, getJwtSecret()) as JWTPayload;
  } catch {
    return null;
  }
}

type CachedUser = NonNullable<Awaited<ReturnType<typeof fetchUserFromDb>>>;
const USER_CACHE_TTL_MS = 60_000;
// ⚠️ userCache PROCESS-LOCAL'dir; invalidateUserCache() yalnız BU instance'ı temizler, cluster-wide DEĞİL.
// Uygulama TEK 'app' replica ile çalışmalı (docker-compose.yml). Yatay ölçekleme yapılırsa (—scale app>1 / k8s)
// silinen/pasifleştirilen kullanıcı diğer instance'larda 60sn'ye kadar aktif kalır → ölçeklemeden ÖNCE gerçek
// token-revocation ekle (User.tokenVersion + JWT payload'a yaz + getCurrentUser'da karşılaştır + silme/pasifte increment).
const userCache = new Map<string, { user: CachedUser; expiresAt: number }>();

async function fetchUserFromDb(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      roles: true,
      isActive: true,
      phone: true,
      studyankaAccess: true,
    },
  });
}

export function invalidateUserCache(userId?: string) {
  if (userId) userCache.delete(userId);
  else userCache.clear();
}

export async function getCurrentUser() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("auth-token")?.value;
    if (!token) return null;

    const payload = verifyToken(token);
    if (!payload) return null;

    const now = Date.now();
    const cached = userCache.get(payload.userId);
    if (cached && cached.expiresAt > now) {
      return cached.user;
    }

    const user = await fetchUserFromDb(payload.userId);
    if (!user || !user.isActive) {
      userCache.delete(payload.userId);
      return null;
    }

    // `roles` boşsa (eski kullanıcılar) Ana Rol'ü tek elemanlı diziye düşür ki
    // yetki birleşimi her zaman çalışsın.
    const normalized = {
      ...user,
      roles: user.roles.length > 0 ? user.roles : [user.role],
    };

    userCache.set(payload.userId, { user: normalized, expiresAt: now + USER_CACHE_TTL_MS });
    return normalized;
  } catch {
    return null;
  }
}
