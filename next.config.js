/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "20mb" },
    // Keep sharp/pdf-lib out of the webpack bundle — they're Node-only and
    // ship their own native binaries. Bundling them breaks at runtime.
    serverComponentsExternalPackages: ["sharp", "pdf-lib", "pdfjs-dist"],
  },
};
module.exports = nextConfig;
