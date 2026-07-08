import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import NativeBridge from "@/components/NativeBridge";

export const metadata: Metadata = {
  title: "MeşaleGrup - Şantiye Takip Sistemi",
  description: "İnşaat şantiyesi yönetim ve takip sistemi",
  manifest: "/manifest.json",
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "Uzaktan Şantiye",
    statusBarStyle: "black",
  },
};

export const viewport: Viewport = {
  themeColor: "#1a1a2e",
  width: "device-width",
  initialScale: 1,
  // iPhone çentik/güvenli alanların doğru ele alınması için (Capacitor native kabuk).
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Nonce'u oku — dynamic rendering'i zorunlu kılar, Next.js inline script'lere nonce ekler
  const nonce = (await headers()).get("x-nonce") ?? "";

  return (
    <html lang="tr">
      <body className="antialiased bg-[#1a1a2e] text-gray-900 min-h-screen" nonce={nonce}>
        <NativeBridge />
        {children}
      </body>
    </html>
  );
}
