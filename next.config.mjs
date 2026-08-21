/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.amazonaws.com",
      },
    ],
  },
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
