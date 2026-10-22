import type { NextConfig } from "next";

// The authenticated PDF already loaded by the internal viewer is printed in a
// temporary Blob frame. Apply consistently to the shell: Next Link navigation
// retains the initial document's CSP when entering Orders from another module.
const contentSecurityPolicy = "default-src 'self' https: data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' https: data: blob:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' https: wss:; frame-src https: blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: '/settings/catalog',
        destination: '/catalog',
        permanent: false
      }
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: contentSecurityPolicy
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          }
        ]
      }
    ];
  }
};

export default nextConfig;
