/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  async rewrites() {
    // В разработке FastAPI работает на :8000, на Vercel /api/* обслуживает Python-функция api/index.py
    return [
      {
        source: "/api/:path*",
        destination:
          process.env.NODE_ENV === "development"
            ? `${process.env.API_DEV_URL || "http://127.0.0.1:8000"}/api/:path*`
            : "/api/",
      },
    ];
  },
};
export default nextConfig;
