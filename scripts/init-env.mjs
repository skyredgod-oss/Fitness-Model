import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const config = new URL('../backend/.env', import.meta.url);
if (!existsSync(config)) {
  writeFileSync(
    config,
    `DATABASE_URL="file:./fitness.db"\nSESSION_SECRET="${randomBytes(48).toString('hex')}"\nPORT=3001\nNODE_ENV=development\nTRUST_PROXY=0\n`,
    { flag: 'wx', mode: 0o600 },
  );
  console.log('Created backend/.env with a random session secret (not displayed).');
} else console.log('Preserved existing backend/.env.');
mkdirSync(new URL('../backend/data/slips/', import.meta.url), { recursive: true, mode: 0o700 });
