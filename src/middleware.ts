import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  // Her request için benzersiz nonce oluştur
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  const cspHeader = [
    "default-src 'none'",
    `script-src 'self' 'nonce-${nonce}' https://cdnjs.cloudflare.com`,
    `style-src 'self' 'nonce-${nonce}'`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob: mediastream:",
    "font-src 'self'",
    "connect-src 'self' https://cdnjs.cloudflare.com https://rtc.uzaktansantiye.com wss://rtc.uzaktansantiye.com",
    "worker-src 'self' blob: https://cdnjs.cloudflare.com",
    "manifest-src 'self'",
    "frame-src 'self'",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join("; ");

  const token = request.cookies.get("auth-token")?.value;
  const { pathname } = request.nextUrl;

  // Public rotalar
  // NOT: /api/adisyo/webhook (Adisyo HMAC ile çağırır) ve /api/adisyo/sync (cron token ile)
  // cookie'siz erişilir; kendi güvenlik kontrollerini route içinde yaparlar.
  // /api/adisyo/stats public DEĞİL — giriş yapmış kullanıcı (cookie) ile çalışır.
  const publicPaths = [
    "/login",
    "/hesap-sil", // Play "Data deletion" public URL — login gerektirmez
    "/gizlilik", // Privacy Policy (public, Play zorunlu) — login gerektirmez
    "/api/auth/login",
    "/api/studyanka/sync",
    "/api/studyanka/report",
    "/api/yurtanka/sync",
    "/api/adisyo/webhook",
    "/api/adisyo/sync",
    "/api/push/send",
    "/api/call/reject",
  ];

  // Nonce ve CSP'yi request headers'a ekle (Next.js rendering engine okur)
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", cspHeader);

  let response: NextResponse;

  if (publicPaths.some((path) => pathname.startsWith(path))) {
    // Zaten giriş yapmışsa dashboard'a yönlendir
    if (token && pathname === "/login") {
      response = NextResponse.redirect(new URL("/dashboard", request.url));
    } else {
      response = NextResponse.next({
        request: { headers: requestHeaders },
      });
    }
  } else if (!token) {
    // API rotaları (auth hariç) ve sayfa rotaları için token kontrolü
    if (pathname.startsWith("/api/")) {
      response = NextResponse.json(
        { error: "Yetkisiz erişim" },
        { status: 401 }
      );
    } else {
      response = NextResponse.redirect(new URL("/login", request.url));
    }
  } else {
    response = NextResponse.next({
      request: { headers: requestHeaders },
    });
  }

  // CSP header'ını response'a ekle
  response.headers.set("Content-Security-Policy", cspHeader);
  response.headers.set("x-nonce", nonce);

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|icons|uploads|assets|dwg-viewer\\.html|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico)$).*)",
  ],
};
