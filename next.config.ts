import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Default is 1MB — too small for certificate background/signature image
    // uploads (src/actions/certificates.ts's uploadCertificateAsset).
    serverActions: {
      bodySizeLimit: "5mb",
    },
  },
};

export default nextConfig;
