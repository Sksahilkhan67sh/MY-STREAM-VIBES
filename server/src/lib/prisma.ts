import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

// Lazy singleton — only instantiated on first access, never during tsc compilation.
// This prevents "call config.load() before reading values" on Render's build runner
// where DATABASE_URL is not available at build time.
function getPrisma(): PrismaClient {
  if (!global.__prisma) {
    global.__prisma = new PrismaClient({
      log: ['error'],
    });
  }
  return global.__prisma;
}

// Proxy so callers can still do `prisma.stream.findMany(...)` directly
const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    return (getPrisma() as any)[prop];
  },
});

export { prisma };
export default prisma;
