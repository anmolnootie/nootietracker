/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // There's no page at "/" - send it to the dashboard (which _app.tsx sends on
  // to /login when nobody is signed in) instead of a 404.
  async redirects() {
    return [{ source: '/', destination: '/dashboard', permanent: false }];
  },
};

module.exports = nextConfig;
