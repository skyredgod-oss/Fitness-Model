import { defineConfig } from 'prisma/config';
import { PrismaLibSQL } from '@prisma/adapter-libsql';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(root, '.env'), quiet: true });
const rawUrl = process.env.DATABASE_URL || 'file:./fitness.db';
if (!rawUrl.startsWith('file:')) throw new Error('Local SQLite file URL required');
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  experimental: { adapter: true },
  engine: 'js',
  adapter: async () =>
    new PrismaLibSQL({ url: 'file:' + path.resolve(root, 'prisma', rawUrl.slice(5)) }),
});
