/** @type {import('next').NextConfig} */
const nextConfig = {
  // pino / pino-pretty rely on dynamic requires that bundlers can't trace —
  // keep them external so they run untouched in the Node server runtime.
  experimental: {
    serverComponentsExternalPackages: ['pino', 'pino-pretty'],
  },
}

export default nextConfig
