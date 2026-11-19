/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "20mb" },
    // Keep sharp/pdf-lib out of the webpack bundle — they're Node-only and
    // ship their own native binaries. Bundling them breaks at runtime.
    serverComponentsExternalPackages: ["sharp", "pdf-lib", "pdfjs-dist", "mupdf"],
  },
  // The sections were renamed for what they produce, and the paths followed.
  // Anything already bookmarked or pasted into a chat still lands in the
  // right place. The /api/communities routes are untouched — those are
  // plumbing, not a section of the site.
  async redirects() {
    return [
      { source: "/events", destination: "/social", permanent: false },
      { source: "/communities", destination: "/settings", permanent: false },
      { source: "/communities/:slug", destination: "/settings/:slug", permanent: false },
    ];
  },
};
module.exports = nextConfig;
