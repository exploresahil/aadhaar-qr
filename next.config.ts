import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  typedRoutes: true,
  cacheComponents: true,
  experimental: {
    typedEnv: true,
  },
  allowedDevOrigins: ["192.168.1.10"],
};

export default nextConfig;
