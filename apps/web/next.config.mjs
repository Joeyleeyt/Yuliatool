/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone', // for the multi-stage Docker image
  reactStrictMode: true,
  poweredByHeader: false,
  // Workspace packages are TS source; let Next transpile them.
  transpilePackages: ['@yulia/core', '@yulia/db', '@yulia/domain', '@yulia/services', '@yulia/queue'],
  // Native/node deps that must never be bundled into the server build.
  serverExternalPackages: ['postgres', 'ioredis', '@aws-sdk/client-s3', 'pino', 'bullmq'],
  webpack: (config) => {
    // The workspace packages import with explicit `.js` extensions (NodeNext/
    // Bundler style over TS source). Teach webpack to resolve `.js` -> `.ts`.
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    return config;
  },
};

export default nextConfig;
