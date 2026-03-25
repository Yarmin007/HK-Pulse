import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co', // Caches your Supabase Storage images
      },
      {
        protocol: 'https',
        hostname: 'ui-avatars.com', // Caches your fallback avatars
      }
    ],
  },
};

export default nextConfig;