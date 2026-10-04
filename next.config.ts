import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Was a separate `module.exports = { allowedDevOrigins }` below the default
  // export — two competing configs in one file, so one of them was ignored.
  allowedDevOrigins: ["192.168.0.121"],
  experimental: {
    // Default is 1MB — too small for certificate background/signature image
    // uploads (src/actions/certificates.ts's uploadCertificateAsset).
    serverActions: {
      bodySizeLimit: "5mb",
    },
  },
};

export default nextConfig;
