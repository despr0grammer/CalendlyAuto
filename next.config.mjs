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

// Iniciar el bot scheduler en el servidor (no en build time)
if (typeof window === 'undefined' && process.env.NODE_ENV !== 'test') {
  // Delay para asegurar que Prisma esté listo
  setTimeout(async () => {
    try {
      const { initBotScheduler } = await import('./src/lib/bot-scheduler.js');
      initBotScheduler();
    } catch (e) {
      console.error('Error iniciando bot scheduler:', e);
    }
  }, 2000);
}

export default nextConfig;
