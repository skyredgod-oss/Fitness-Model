import path from 'node:path';
import { mkdir, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
const dir = process.env.E2E_DIR;
if (!dir || !process.env.E2E_PASSWORD) throw new Error('Launch via Playwright');
await mkdir(dir, { recursive: true });
process.env.DATABASE_URL = 'file:' + path.join(dir, 'test.db');
process.env.SESSION_SECRET = randomBytes(48).toString('hex');
process.env.UPLOAD_DIR = path.join(dir, 'slips');
process.env.PORT = '3107';
process.env.NODE_ENV = 'test';
execFileSync(process.execPath, ['../node_modules/prisma/build/index.js', 'migrate', 'deploy'], {
  env: process.env,
  stdio: 'pipe',
});
execFileSync(process.execPath, ['../node_modules/tsx/dist/cli.mjs', 'prisma/seed.ts'], {
  env: process.env,
  stdio: 'pipe',
});
const { db } = await import('../src/core.js');
for (const role of ['ADMIN', 'STAFF'])
  await db.user.upsert({
    where: { username: role.toLowerCase() },
    update: { passwordHash: await bcrypt.hash(process.env.E2E_PASSWORD, 4) },
    create: {
      username: role.toLowerCase(),
      name: role === 'ADMIN' ? 'ผู้ดูแลทดสอบ' : 'เจ้าหน้าที่ทดสอบ',
      role,
      passwordHash: await bcrypt.hash(process.env.E2E_PASSWORD, 4),
    },
  });
const { default: app } = await import('../src/app.js');
const server = app.listen(3107, '127.0.0.1');
process.on('SIGTERM', () =>
  server.close(async () => {
    await db.$disconnect();
    await rm(dir, { recursive: true, force: true });
    process.exit(0);
  }),
);
