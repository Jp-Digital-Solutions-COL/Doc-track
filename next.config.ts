import type { NextConfig } from "next";

// CSP se maneja en middleware.ts (necesita nonce por request). Aquí van los
// headers de seguridad que no dependen del request.
const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  // Quita el header X-Powered-By: Next.js — no aporta nada al cliente y es
  // fingerprinting gratis para quien esté reconociendo el stack.
  poweredByHeader: false,
  // ponytail: el optimizador de imágenes de Next necesita un pipeline de
  // procesamiento que no está trivialmente disponible en Workers. Las únicas
  // imágenes de la app son logos PNG estáticos chicos — no vale la pena
  // Cloudflare Images para eso. Revisar si se agregan fotos/uploads de
  // usuario servidas por next/image.
  images: {
    unoptimized: true,
  },
  experimental: {
    serverActions: {
      // Default de Next es 1MB; el bucket admite hasta 15MB (ver migración
      // de storage). Un poco más de margen por el resto del multipart body.
      bodySizeLimit: "16mb",
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;

import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
