/** @type {import('next').NextConfig} */
const nextConfig = {
  // Iniciar el bot scheduler cuando el servidor arranca
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Solo en el servidor, no en el cliente
    }
    return config;
  },
  // Permitir imports de módulos que usan require() de node
  experimental: {
    serverComponentsExternalPackages: ['@whiskeysockets/baileys', 'better-sqlite3'],
  },
};

export default nextConfig;
