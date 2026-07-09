import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";
import path from "path";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  output: "standalone",
  compress: true,
  poweredByHeader: false,
  serverExternalPackages: ["bcryptjs"],
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    formats: ["image/avif", "image/webp"],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "100mb",
    },
  },
  webpack: (config) => {
    // @capacitor-firebase/messaging'in WEB impl'i `firebase/messaging` (Firebase JS
    // SDK) import eder. Biz web'de Firebase push kullanmıyoruz (iOS=native,
    // Android=push-notifications) → büyük `firebase` paketini kurmak yerine no-op
    // stub'a yönlendir ki webpack build'de çözebilsin. Bu kod native'de çalışmaz.
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "firebase/messaging": path.resolve(process.cwd(), "src/lib/firebaseMessagingWebStub.js"),
    };
    return config;
  },
};

export default withBundleAnalyzer(nextConfig);
